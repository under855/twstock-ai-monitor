(() => {
  'use strict';
  const VERSION='0.8.2';
  const INTERVAL=15000;
  const MAX_POINTS=260;
  const liveSeries=new Map();
  const seeded=new Set();
  let busy=false;

  const n=v=>{if(v==null)return null;const s=String(v).trim().replaceAll(',','').replaceAll('+','');if(!s||s==='-'||s==='--'||s==='---')return null;const x=Number(s);return Number.isFinite(x)?x:null};
  const f=(v,d=2)=>n(v)==null?'—':n(v).toLocaleString('zh-TW',{maximumFractionDigits:d});
  const cclass=v=>n(v)==null?'flat':n(v)>0?'up':n(v)<0?'down':'flat';
  const taipeiDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
  const todayKey=()=>`tw_intraday_${taipeiDate()}`;

  async function getJson(url,timeout=8000){
    const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);
    try{const r=await fetch(url,{cache:'no-store',signal:ac.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
    finally{clearTimeout(t)}
  }

  function watchCodes(){
    try{return [...new Set((typeof watchlist==='function'?watchlist():[]).map(String))].slice(0,20)}catch{return[]}
  }

  function loadPersisted(){
    try{
      const raw=JSON.parse(localStorage.getItem(todayKey())||'{}');
      for(const [code,arr] of Object.entries(raw)){
        if(Array.isArray(arr))liveSeries.set(code,arr.filter(p=>Number.isFinite(Number(p?.close))&&Number.isFinite(Number(p?.stamp))).slice(-MAX_POINTS));
      }
    }catch{}
  }

  function persist(){
    try{
      const obj={};for(const [code,arr] of liveSeries)obj[code]=arr.slice(-MAX_POINTS);
      localStorage.setItem(todayKey(),JSON.stringify(obj));
      for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('tw_intraday_')&&k!==todayKey())localStorage.removeItem(k)}
    }catch{}
  }

  async function fetchMis(codes){
    if(!codes.length)return[];
    const channels=[];for(const code of codes)channels.push(`tse_${code}.tw`,`otc_${code}.tw`);
    const upstream=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels.join('|'))}&json=1&delay=0&_=${Date.now()}`;
    const urls=[`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`];
    let err;
    for(const u of urls){try{const j=await getJson(u);if(Array.isArray(j?.msgArray))return j.msgArray}catch(e){err=e}}
    throw err||new Error('MIS unavailable');
  }

  function tradeStamp(date,time){
    const d=String(date||'');const t=String(time||'');
    if(!/^\d{8}$/.test(d)||!/^\d{2}:\d{2}:\d{2}$/.test(t))return null;
    const iso=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t}+08:00`;
    const ms=Date.parse(iso);return Number.isFinite(ms)?ms:null;
  }

  function parse(m){
    const code=String(m?.c||'').trim();if(!code||String(m?.d||'')!==taipeiDate())return null;
    const trade=n(m?.trade?.z),direct=n(m?.z),ask=n(String(m?.a||'').split('_')[0]),bid=n(String(m?.b||'').split('_')[0]);
    const price=trade??direct??ask??bid;if(price==null)return null;
    const prev=n(m?.y),tlong=n(m?.tlong),time=tlong?new Date(tlong):new Date(),tradeTime=String(m?.trade?.t||'');
    return {code,price,tradePrice:trade,prev,change:prev==null?null:price-prev,open:n(m?.o),high:n(m?.h),low:n(m?.l),volume:n(m?.v),time,tradeTime,tradeStamp:tradeStamp(m?.d,tradeTime),source:trade!=null?'TWSE MIS 最新成交':'TWSE MIS 即時報價'};
  }

  function latestMap(items){
    const map=new Map();
    for(const m of items){const q=parse(m);if(!q)continue;const old=map.get(q.code);if(!old||q.time>=old.time)map.set(q.code,q)}
    return map;
  }

  function rememberTrade(code,q){
    if(q.tradePrice==null||q.tradeStamp==null)return;
    const arr=liveSeries.get(code)||[];const last=arr.at(-1);
    if(!last||last.stamp<q.tradeStamp){arr.push({date:q.tradeTime,close:q.tradePrice,stamp:q.tradeStamp,live:true});}
    else if(last.stamp===q.tradeStamp&&last.close!==q.tradePrice){last.close=q.tradePrice;}
    if(arr.length>MAX_POINTS)arr.splice(0,arr.length-MAX_POINTS);
    liveSeries.set(code,arr);
  }

  function yahooSymbol(code){
    try{const u=universeMap?.get?.(code);if(String(u?.market||'').toLowerCase().includes('tpex')||String(u?.market||'').toLowerCase().includes('otc'))return `${code}.TWO`;}catch{}
    return `${code}.TW`;
  }

  async function seedIntraday(code){
    if(seeded.has(code))return;seeded.add(code);
    const symbol=yahooSymbol(code);
    const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false&_=${Date.now()}`;
    const urls=[`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`];
    let root=null;
    for(const u of urls){try{root=await getJson(u,9000);if(root)break}catch{}}
    try{
      const r=root?.chart?.result?.[0],ts=r?.timestamp||[],cl=r?.indicators?.quote?.[0]?.close||[];
      const arr=liveSeries.get(code)||[];const byStamp=new Map(arr.map(p=>[p.stamp,p]));
      for(let i=0;i<ts.length;i++){
        const px=n(cl[i]),stamp=Number(ts[i])*1000;if(px==null||!Number.isFinite(stamp))continue;
        const dt=new Date(stamp);const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(dt).replaceAll('-','');
        if(d!==taipeiDate())continue;
        const tm=dt.toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false});
        if(!byStamp.has(stamp))byStamp.set(stamp,{date:tm,close:px,stamp,seed:true});
      }
      const merged=[...byStamp.values()].sort((a,b)=>a.stamp-b.stamp).slice(-MAX_POINTS);if(merged.length)liveSeries.set(code,merged);
    }catch{}
  }

  async function seedAll(codes){await Promise.allSettled(codes.map(seedIntraday));persist();redrawAll()}

  function drawIntraday(canvas,arr){
    if(!canvas||!Array.isArray(arr)||arr.length<2)return false;
    const ctx=canvas.getContext('2d');if(!ctx)return false;
    const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(10,Math.round(rect.width*dpr)),h=Math.max(10,Math.round(rect.height*dpr));
    if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
    ctx.clearRect(0,0,w,h);
    const vals=arr.map(p=>Number(p.close)).filter(Number.isFinite);if(vals.length<2)return false;
    let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*.08;hi+=pad;lo-=pad;
    ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.strokeStyle='rgba(120,173,255,.95)';ctx.beginPath();
    vals.forEach((v,i)=>{const x=(i/(vals.length-1))*(w-2*dpr)+dpr,y=dpr+(hi-v)/(hi-lo)*(h-2*dpr);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
    const last=vals.at(-1),x=w-dpr,y=dpr+(hi-last)/(hi-lo)*(h-2*dpr);ctx.fillStyle='rgba(237,245,255,.95)';ctx.beginPath();ctx.arc(x,y,Math.max(2.2,2.5*dpr),0,Math.PI*2);ctx.fill();
    return true;
  }

  function patchRow(row,code,q){
    if(!row||!q)return;const p=row.querySelector('.price'),chg=row.querySelector('.chg'),day=row.querySelector('.dayline'),meta=row.querySelector('.meta');
    if(p)p.textContent=f(q.price);if(chg){chg.textContent=`${q.change>0?'+':''}${f(q.change)}`;chg.className=`chg ${cclass(q.change)}`}
    if(day)day.textContent=`${q.tradeTime||q.time.toLocaleTimeString('zh-TW')}　開 ${f(q.open)}　高 ${f(q.high)}　低 ${f(q.low)}　最新 ${f(q.price)}　量 ${f(q.volume,0)}`;
    if(meta)meta.innerHTML=`<span>${q.source}</span><span>漲跌 ${q.change>0?'+':''}${f(q.change)}</span>`;
    const cv=row.querySelector('canvas.spark'),arr=liveSeries.get(code)||[];if(cv)drawIntraday(cv,arr);
    try{const base=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{},hist=historyCache?.[code]||[],s=scoreStock(base,val,hist,q),sn=row.querySelector('.scoreNum'),sl=row.querySelector('.scoreLabel');if(sn){sn.textContent=s.total==null?'—':String(s.total);sn.className=`scoreNum ${scoreCls(s.total)}`}if(sl)sl.textContent=s.total==null?'資料不足':s.mode}catch{}
  }

  function patchRows(map){document.querySelectorAll('#watch article.row').forEach(row=>{const code=row.querySelector('.sym')?.textContent?.trim();if(code&&map.has(code))patchRow(row,code,map.get(code))})}
  function redrawAll(){document.querySelectorAll('#watch article.row').forEach(row=>{const code=row.querySelector('.sym')?.textContent?.trim(),cv=row.querySelector('canvas.spark');if(code&&cv)drawIntraday(cv,liveSeries.get(code)||[])})}

  function patchDetail(map){
    try{const code=String(active||'');if(!code||!map.has(code)||!document.getElementById('sheet')?.classList.contains('show'))return;const q=map.get(code),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};set('dPrice',f(q.price));set('dOpen',f(q.open));set('dRange',`${f(q.high)} / ${f(q.low)}`);set('dVolume',f(q.volume,0));set('dTime',`${q.source}｜${q.tradeTime||q.time.toLocaleTimeString('zh-TW')}`);const ch=document.getElementById('dChange');if(ch){ch.textContent=`${q.change>0?'+':''}${f(q.change)}`;ch.className='v '+cclass(q.change)}const cv=document.getElementById('bigChart'),arr=liveSeries.get(code)||[];if(cv)drawIntraday(cv,arr);const msg=document.getElementById('chartMsg');if(msg&&arr.length>=2)msg.textContent=`今日盤中走勢｜${arr[0].date||''}～${arr.at(-1).date||''}｜${arr.length} 個盤中點`;}catch{}
  }

  async function refreshLive(){
    if(busy)return;busy=true;
    try{const codes=watchCodes();if(codes.some(c=>!seeded.has(c)))seedAll(codes);const items=await fetchMis(codes),map=latestMap(items);for(const [code,q] of map){rememberTrade(code,q);try{quoteCache[code]=q}catch{}}persist();patchRows(map);patchDetail(map);const pill=document.getElementById('refreshPill');if(pill)pill.textContent=`盤中即時：15 秒｜v${VERSION}`;const badge=document.getElementById('liveBadge');if(badge){badge.textContent=`盤中即時 v${VERSION}`;badge.className='liveBadge ok'}window.__TW_LIVE_V081__={ok:true,version:VERSION,count:map.size,at:Date.now()};}
    catch(e){window.__TW_LIVE_V081__={ok:false,version:VERSION,error:String(e),at:Date.now()}}finally{busy=false}
  }

  function boot(){loadPersisted();const pill=document.getElementById('refreshPill');if(pill)pill.textContent=`盤中即時：15 秒｜v${VERSION}`;const codes=watchCodes();seedAll(codes);refreshLive();setInterval(refreshLive,INTERVAL);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
