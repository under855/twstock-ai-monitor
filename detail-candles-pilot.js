/* Detail-only OHLC pilot. Independent of MIS, fallback, short-term scoring and polling. */
(() => {
  'use strict';
  const cache=new Map(),pending=new Map();
  const num=v=>{if(v==null||v===''||/^-+$/.test(String(v).trim()))return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null};
  const isoDate=x=>{const m=String(x||'').match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);if(!m)return null;const y=Number(m[1])+1911,mo=Number(m[2]),d=Number(m[3]);const key=y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');return new Date(key+'T00:00:00Z').toISOString().slice(0,10)===key?key:null};
  function daily(input){
    const out=[];
    for(const x of input||[]){
      const date=String(x?.date||''),open=num(x?.open),high=num(x?.high),low=num(x?.low),close=num(x?.close),volume=num(x?.volume);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||![open,high,low,close].every(n=>n!=null&&n>0)||high<Math.max(open,close)||low>Math.min(open,close)||low>high)continue;
      out.push({date,open,high,low,close,volume:volume!=null&&volume>=0?volume:null});
    }
    return [...new Map(out.sort((a,b)=>a.date.localeCompare(b.date)).map(x=>[x.date,x])).values()];
  }
  function aggregate(data,period){
    if(period==='daily')return daily(data);
    const groups=new Map();
    for(const d of daily(data)){
      const ts=Date.parse(d.date+'T00:00:00Z');
      const weekStart=new Date(ts-( (new Date(ts).getUTCDay()+6)%7)*86400000).toISOString().slice(0,10);
      const key=period==='weekly'?weekStart:d.date.slice(0,7);
      const prior=groups.get(key);
      if(!prior)groups.set(key,{...d});
      else{prior.high=Math.max(prior.high,d.high);prior.low=Math.min(prior.low,d.low);prior.close=d.close;prior.date=d.date;prior.volume=prior.volume!=null&&d.volume!=null?prior.volume+d.volume:null;}
    }
    return [...groups.values()];
  }
  function months(n){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const val=k=>p.find(x=>x.type===k)?.value;
    const date=new Date(Date.UTC(Number(val('year')),Number(val('month'))-1,1)),out=[];
    for(let i=0;i<n;i++){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-i,1));out.push(String(d.getUTCFullYear())+String(d.getUTCMonth()+1).padStart(2,'0')+'01')}
    return out;
  }
  // Official history fetches are bounded, shared per symbol and progressively displayed.
  // No timers or network access are added to the six-second live quote scheduler.
  const loadedMonths=new Map(),historyProgress=new Map(),progressListeners=new Map();
  async function download(code,onProgress){
    if(typeof onProgress==='function')progressListeners.set(code,onProgress);
    const keys=months(13),done=loadedMonths.get(code)||new Set();
    loadedMonths.set(code,done);
    const existing=cache.get(code)||[];
    if(done.size===keys.length)return existing;
    if(pending.has(code))return pending.get(code);
    const all=new Map(existing.map(x=>[x.date,x]));
    const task=(async()=>{
      const queue=keys.filter(key=>!done.has(key));
      let next=0;
      const worker=async()=>{
        while(next<queue.length){
          if(!document.getElementById('sheet')?.classList.contains('show')||String(active)!==code)break;
          const key=queue[next++];
          try{
            const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),3200);
            let response;
            try{response=await fetch('https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date='+key+'&stockNo='+encodeURIComponent(code)+'&response=json',{signal:ac.signal,cache:'default'})}finally{clearTimeout(timer)}
            if(!response.ok)continue;
            const body=await response.json();
            if(body?.stat!=='OK'||!Array.isArray(body.data))continue;
            const batch=daily(body.data.map(raw=>({date:isoDate(raw?.[0]),open:raw?.[3],high:raw?.[4],low:raw?.[5],close:raw?.[6],volume:raw?.[1]})));
            // Do not mark unsuccessful or invalid months as complete.
            if(!batch.length)continue;
            for(const x of batch)all.set(x.date,x);
            done.add(key);
            const points=daily([...all.values()]);
            cache.set(code,points);
            historyProgress.set(code,{done:done.size,total:keys.length});
            try{progressListeners.get(code)?.(points,done.size,keys.length)}catch{}
          }catch{/* Do not create substitute values for failed official-history requests. */}
        }
      };
      // Two at most to reduce waiting without overloading the official endpoint.
      await Promise.all([worker(),worker()]);
      return cache.get(code)||[];
    })().finally(()=>pending.delete(code));
    pending.set(code,task);
    return task;
  }
  function draw(canvas,points){
    const ctx=canvas?.getContext('2d');if(!ctx||!points.length)return;
    const rect=canvas.getBoundingClientRect(),scale=Math.min(2,window.devicePixelRatio||1),w=Math.max(280,Math.round((rect.width||600)*scale)),h=Math.max(190,Math.round((rect.height||260)*scale));
    if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    ctx.clearRect(0,0,w,h);
    const left=8*scale,right=44*scale,top=14*scale,bottom=26*scale,plotW=w-left-right,plotH=h-top-bottom;
    const hi=Math.max(...points.map(x=>x.high)),lo=Math.min(...points.map(x=>x.low));const pad=Math.max((hi-lo)*.08,hi*.002),max=hi+pad,min=lo-pad;
    const Y=p=>top+(max-p)/(max-min)*plotH;
    ctx.font=11*scale+'px sans-serif';ctx.textBaseline='middle';
    for(let i=0;i<5;i++){const val=min+(max-min)*i/4,y=Y(val);ctx.strokeStyle='rgba(120,153,186,.17)';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle='#9bb0ca';ctx.textAlign='right';ctx.fillText(val.toFixed(2),w-2*scale,y)}
    const step=plotW/points.length;
    for(let i=0;i<points.length;i++){
      const d=points[i],x=left+step*(i+.5),red=d.close>=d.open;
      ctx.strokeStyle=red?'#ef6767':'#2bd492';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=Math.max(1,scale);
      ctx.beginPath();ctx.moveTo(x,Y(d.high));ctx.lineTo(x,Y(d.low));ctx.stroke();
      const y1=Y(Math.max(d.open,d.close)),y2=Y(Math.min(d.open,d.close));
      ctx.fillRect(x-Math.max(1,step*.31),y1,Math.max(2,step*.62),Math.max(1.3*scale,y2-y1));
    }
    ctx.textAlign='center';ctx.fillStyle='#9bb0ca';ctx.font=10*scale+'px sans-serif';
    for(let i=0;i<4;i++){const idx=Math.min(points.length-1,Math.round(i*(points.length-1)/3));ctx.fillText(points[idx].date.slice(5),left+step*(idx+.5),h-10*scale)}
  }
  function init(){
    const card=document.getElementById('detailCandlePilot'),canvas=document.getElementById('detailCandlesCanvas'),status=document.getElementById('detailCandlesStatus');
    if(!card||!canvas||!status)return;
    let period='weekly',renderToken=0;
    const buttons=[...card.querySelectorAll('button[data-candle-period]')];
    const setStatus=v=>{if(status.textContent!==v)status.textContent=v};
    function showBars(code,records,progress){
      const bars=aggregate(records,period).slice(period==='daily'?-70:period==='weekly'?-55:-13);
      if(!bars.length)return false;
      draw(canvas,bars);
      const text='歷史 '+(period==='daily'?'日':period==='weekly'?'週':'月')+' K｜'+bars.length+' 根｜'+bars[0].date+'～'+bars.at(-1).date;
      setStatus(text+'｜證交所原始價格（非即時、未還原除權息）'+(progress?'｜已載入 '+progress.done+'/'+progress.total+' 個月份':'｜已有歷史資料'));
      return true;
    }
    async function render(){
      const code=String(typeof active==='undefined'?'':active||''),token=++renderToken;
      if(!code||!document.getElementById('sheet')?.classList.contains('show'))return;
      buttons.forEach(b=>{const selected=b.dataset.candlePeriod===period;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))});
      if(!/^\d{4,6}$/.test(code)){setStatus('此標的暫無可驗證的歷史日 K 資料');return}
      const market=String(universeMap?.get?.(code)?.market||'');
      if(market==='TPEx'){setStatus('上櫃標的：尚未接入櫃買中心歷史日 K，暫不以證交所資料替代');return}
      const records=cache.get(code)||daily(historyCache?.[code]||[]);
      const progress=historyProgress.get(code);
      const drawn=records.length&&showBars(code,records,progress);
      if(!drawn){canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);setStatus('正在取得證交所歷史 K 線資料；不影響盤中報價')}
      if(loadedMonths.get(code)?.size===months(13).length)return;
      // Exactly one download per symbol; a tab switch attaches to its existing results.
      const update=(points,count,total)=>{
        if(token!==renderToken||String(active)!==code||!document.getElementById('sheet')?.classList.contains('show'))return;
        showBars(code,points,{done:count,total});
      };
      const points=await download(code,update);
      if(token!==renderToken||String(active)!==code)return;
      if(points.length)showBars(code,points,historyProgress.get(code));
      else if(!drawn)setStatus('證交所歷史資料暫時無法取得，請稍後重試；不顯示虛構行情');
    }
    card.addEventListener('click',e=>{const b=e.target.closest('button[data-candle-period]');if(!b||!card.contains(b))return;period=b.dataset.candlePeriod;void render().catch(()=>setStatus('歷史圖表載入失敗，其他功能不受影響'))});
    const sheet=document.getElementById('sheet'),title=document.getElementById('dTitle');
    if(title)new MutationObserver(()=>{if(sheet?.classList.contains('show')){period='weekly';void render().catch(()=>setStatus('歷史圖表暫時無法顯示'))}}).observe(title,{subtree:true,characterData:true,childList:true});
    if(sheet)new MutationObserver(()=>{if(sheet.classList.contains('show'))void render().catch(()=>setStatus('歷史圖表暫時無法顯示'))}).observe(sheet,{attributes:true,attributeFilter:['class']});
  }
  window.__TW_DETAIL_CANDLES_TEST__={daily,aggregate};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();