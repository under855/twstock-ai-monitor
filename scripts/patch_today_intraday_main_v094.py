from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')
old="""  function mainLivePoints(code){return Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.seriesPoints||0)}
  function enforceTodayOnlyMainCharts(){
    if(typeof watchlist!=='function')return false;
    for(const code of [...new Set(watchlist().map(String))]){
      const r=rowFor(code);if(!r)continue;if(mainLivePoints(code)>=2)continue;
      const c=r.querySelector('canvas.spark');if(!c)continue;
      const f=document.createElement('div');f.className='sparkFallback';f.innerHTML='今日走勢<br>等待即時資料';c.replaceWith(f);
    }
    return true;
  }
  function startTodayOnlyMainCharts(){
    let timer=null;const run=()=>enforceTodayOnlyMainCharts(),watch=document.getElementById('watch');
    if(watch)new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80)}).observe(watch,{childList:true,subtree:true});
    setTimeout(run,150);setTimeout(run,900);setTimeout(run,2500);setInterval(run,5000);return true;
  }
"""
new="""  function mainLivePoints(code){return Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.seriesPoints||0)}
  const todayChartCache=new Map(),todayChartBusy=new Set();
  function taipeiDayKey(){
    const ps=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),g=t=>ps.find(x=>x.type===t)?.value||'';
    return `${g('year')}${g('month')}${g('day')}`;
  }
  function localTodayPoints(code){
    try{
      const raw=JSON.parse(localStorage.getItem('tw_live091_series_'+taipeiDayKey())||'{}'),a=raw?.[String(code)]||[];
      return Array.isArray(a)?a.map(x=>({stamp:Number(x?.stamp),close:Number(x?.close)})).filter(x=>Number.isFinite(x.stamp)&&Number.isFinite(x.close)).sort((a,b)=>a.stamp-b.stamp):[];
    }catch{return []}
  }
  function mainCanvas(code){
    const r=rowFor(code);if(!r)return null;let c=r.querySelector('canvas.spark');if(c)return c;
    const f=r.querySelector('.sparkFallback');if(!f)return null;c=document.createElement('canvas');c.className='spark';c.width=420;c.height=50;f.replaceWith(c);return c;
  }
  function drawTodayPoints(canvas,points){
    if(!canvas||!Array.isArray(points)||points.length<2)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const a=points.filter(x=>Number.isFinite(Number(x.stamp))&&Number.isFinite(Number(x.close))).sort((x,y)=>x.stamp-y.stamp);if(a.length<2)return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(30,Math.round((r.width||320)*dpr)),h=Math.max(24,Math.round((r.height||50)*dpr));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;ctx.clearRect(0,0,w,h);
    const vals=a.map(x=>Number(x.close));let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*.08;lo-=pad;hi+=pad;const t0=a[0].stamp,t1=a.at(-1).stamp,span=Math.max(1,t1-t0),X=x=>dpr+(x.stamp-t0)/span*(w-2*dpr),Y=v=>dpr+(hi-v)/(hi-lo)*(h-2*dpr);
    ctx.strokeStyle='rgba(120,173,255,.98)';ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.beginPath();a.forEach((x,i)=>i?ctx.lineTo(X(x),Y(x.close)):ctx.moveTo(X(x),Y(x.close)));ctx.stroke();const last=a.at(-1);ctx.fillStyle='#edf5ff';ctx.beginPath();ctx.arc(X(last),Y(last.close),Math.max(2.2,2.5*dpr),0,Math.PI*2);ctx.fill();canvas.dataset.todayFallback='1';return true;
  }
  async function fetchTodayIntraday(code){
    const key=String(code),cached=todayChartCache.get(key);if(cached?.length>=2)return cached;
    let market='';try{market=String(universeMap?.get?.(key)?.market||'')}catch{}
    const syms=market==='TPEx'?[`${key}.TWO`]:market==='TWSE'?[`${key}.TW`]:[`${key}.TW`,`${key}.TWO`],day=taipeiDayKey();
    for(const sym of syms){
      const up=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m&includePrePost=false&_=${Date.now()}`;
      for(const url of [`https://proxy.cors.dev/${up}`]){
        try{
          const j=await fetchJson(url,7000),r=j?.chart?.result?.[0],ts=r?.timestamp||[],q=r?.indicators?.quote?.[0]||{},out=[];
          for(let i=0;i<ts.length;i++){const close=Number(q.close?.[i]),stamp=Number(ts[i])*1000;if(!Number.isFinite(close)||!Number.isFinite(stamp))continue;const d=new Date(stamp),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),g=t=>parts.find(x=>x.type===t)?.value||'';if(`${g('year')}${g('month')}${g('day')}`!==day)continue;out.push({stamp,close})}
          if(out.length>=2){todayChartCache.set(key,out);return out}
        }catch{}
      }
    }
    return [];
  }
  async function ensureTodayMainChart(code){
    const key=String(code),local=localTodayPoints(key);if(local.length>=2){todayChartCache.set(key,local);return drawTodayPoints(mainCanvas(key),local)}
    const cached=todayChartCache.get(key);if(cached?.length>=2)return drawTodayPoints(mainCanvas(key),cached);
    if(todayChartBusy.has(key))return false;todayChartBusy.add(key);
    try{const remote=await fetchTodayIntraday(key);if(remote.length>=2)return drawTodayPoints(mainCanvas(key),remote)}finally{todayChartBusy.delete(key)}
    return false;
  }
  function enforceTodayOnlyMainCharts(){
    if(typeof watchlist!=='function')return false;
    for(const code of [...new Set(watchlist().map(String))]){
      if(mainLivePoints(code)>=2){const local=localTodayPoints(code);if(local.length>=2)drawTodayPoints(mainCanvas(code),local);continue}
      ensureTodayMainChart(code).then(ok=>{if(ok)return;const r=rowFor(code);if(!r)return;const c=r.querySelector('canvas.spark');if(!c)return;const f=document.createElement('div');f.className='sparkFallback';f.innerHTML='今日走勢<br>分時資料載入中';c.replaceWith(f)}).catch(()=>{});
    }
    return true;
  }
  function startTodayOnlyMainCharts(){
    let timer=null;const run=()=>enforceTodayOnlyMainCharts(),watch=document.getElementById('watch');
    if(watch)new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,120)}).observe(watch,{childList:true,subtree:true});
    setTimeout(run,200);setTimeout(run,1200);setTimeout(run,3500);setTimeout(run,8000);setInterval(run,15000);return true;
  }
"""
if old not in s: raise SystemExit('target block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('patched only main today chart display layer')
