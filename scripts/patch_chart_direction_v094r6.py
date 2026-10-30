from pathlib import Path
import re

p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')

old="""  async function yahooTodayIntraday(code){
    let market='';try{market=String(universeMap?.get?.(String(code))?.market||'')}catch{}
    const symbols=market==='TPEx'?[`${code}.TWO`]:market==='TWSE'?[`${code}.TW`]:[`${code}.TW`,`${code}.TWO`];
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
    for(const symbol of symbols){
      const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false&_=${Date.now()}`;
      for(const url of [`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`]){
        try{const j=await fetchJson(url,7000),r=j?.chart?.result?.[0],ts=r?.timestamp||[],q=r?.indicators?.quote?.[0]||{},out=[];for(let i=0;i<ts.length;i++){const close=Number(q.close?.[i]);if(!Number.isFinite(close))continue;const d=new Date(Number(ts[i])*1000),day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});if(day!==today)continue;out.push({time:d,close});}if(out.length>=2)return out;}catch{}
      }
    }
    return [];
  }

  const todayFallbackCache=new Map();
  async function ensureTodayChartFor(code){
    const key=String(code);if(mainLivePoints(key)>=2)return [];
    if(todayFallbackCache.has(key))return await todayFallbackCache.get(key);
    const p=yahooTodayIntraday(key).then(points=>{const r=rowFor(key),c=r?.querySelector('canvas.spark');if(c&&points.length>=2&&typeof draw==='function')draw(c,points.map(x=>({date:x.time,close:x.close})),true,priceFor(key));return points}).catch(()=>[]);
    todayFallbackCache.set(key,p);return await p;
  }
  async function refreshTodayFallbackCharts(){
    if(typeof watchlist!=='function')return false;const codes=[...new Set(watchlist().map(String))];await Promise.allSettled(codes.map(ensureTodayChartFor));return true;
  }
"""
assert old in s, 'today fallback block changed unexpectedly'
new="""  function chartStamp(v){
    if(v instanceof Date)return v.getTime();
    if(typeof v==='number'&&Number.isFinite(v))return v;
    const raw=String(v||'').trim();if(!raw)return null;
    const ms=Date.parse(raw.replaceAll('/','-'));return Number.isFinite(ms)?ms:null;
  }
  function chronologicalPoints(data){
    return (Array.isArray(data)?data:[]).map((x,i)=>({x,i,t:chartStamp(x?.date??x?.time??x?.stamp)})).sort((a,b)=>{
      if(a.t==null&&b.t==null)return a.i-b.i;if(a.t==null)return 1;if(b.t==null)return -1;return a.t-b.t||a.i-b.i;
    }).map(o=>o.x);
  }
  function installChronologicalDraw(){
    if(typeof draw!=='function')return false;if(draw.__chronologicalV094r6)return true;
    const base=draw,wrapped=function(canvas,data,compact=false,currentPrice=null){return base(canvas,chronologicalPoints(data),compact,currentPrice)};
    wrapped.__chronologicalV094r6=true;draw=wrapped;return true;
  }
  function mainCanvasFor(code){
    const r=rowFor(code);if(!r)return null;let c=r.querySelector('canvas.spark');if(c)return c;
    const f=r.querySelector('.sparkFallback');if(!f)return null;c=document.createElement('canvas');c.className='spark';f.replaceWith(c);return c;
  }
  function liveTodayPrice(code){
    try{const x=window.__TW_LIVE_V091__?.stocks?.[String(code)];return x?.date===new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}).replaceAll('-','')&&Number.isFinite(Number(x?.price))?Number(x.price):null}catch{return null}
  }
  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas||!Array.isArray(points)||points.length<2||typeof draw!=='function')return false;
    draw(canvas,chronologicalPoints(points).map(x=>({date:x.time,close:x.close})),compact,liveTodayPrice(code));return true;
  }

  async function yahooTodayIntraday(code){
    let market='';try{market=String(universeMap?.get?.(String(code))?.market||'')}catch{}
    const symbols=market==='TPEx'?[`${code}.TWO`]:market==='TWSE'?[`${code}.TW`]:[`${code}.TW`,`${code}.TWO`];
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
    for(const symbol of symbols){
      const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false&_=${Date.now()}`;
      for(const url of [`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`]){
        try{
          const j=await fetchJson(url,7000),r=j?.chart?.result?.[0],ts=r?.timestamp||[],q=r?.indicators?.quote?.[0]||{},byTime=new Map();
          for(let i=0;i<ts.length;i++){const close=Number(q.close?.[i]);if(!Number.isFinite(close))continue;const d=new Date(Number(ts[i])*1000),day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});if(day!==today)continue;byTime.set(d.getTime(),{time:d,close})}
          const out=[...byTime.values()].sort((a,b)=>a.time-b.time);if(out.length>=2)return out;
        }catch{}
      }
    }
    return [];
  }

  const todayFallbackCache=new Map(),todayFallbackResolved=new Map();
  async function ensureTodayChartFor(code,force=false){
    const key=String(code),cached=todayFallbackResolved.get(key),now=Date.now();
    if(!force&&cached?.points?.length>=2&&now-cached.fetchedAt<300000){drawTodayPoints(key,cached.points,mainCanvasFor(key),true);return cached.points}
    if(todayFallbackCache.has(key))return await todayFallbackCache.get(key);
    const p=yahooTodayIntraday(key).then(points=>{
      todayFallbackCache.delete(key);
      if(points.length>=2){todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});drawTodayPoints(key,points,mainCanvasFor(key),true)}
      return points;
    }).catch(()=>{todayFallbackCache.delete(key);return []});
    todayFallbackCache.set(key,p);return await p;
  }
  async function refreshTodayFallbackCharts(force=false){
    if(typeof watchlist!=='function')return false;const codes=[...new Set(watchlist().map(String))];await Promise.allSettled(codes.map(code=>ensureTodayChartFor(code,force)));return true;
  }
"""
s=s.replace(old,new,1)

old2="""  function enforceTodayOnlyMainCharts(){
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
assert old2 in s, 'main chart enforcement block changed unexpectedly'
new2="""  function enforceTodayOnlyMainCharts(){
    if(typeof watchlist!=='function')return false;
    for(const code of [...new Set(watchlist().map(String))]){
      const cached=todayFallbackResolved.get(String(code));
      if(cached?.points?.length>=2)drawTodayPoints(String(code),cached.points,mainCanvasFor(String(code)),true);
      else ensureTodayChartFor(String(code)).catch(()=>{});
    }
    return true;
  }
  function startTodayOnlyMainCharts(){
    let timer=null;const run=()=>enforceTodayOnlyMainCharts(),watch=document.getElementById('watch');
    if(watch)new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80)}).observe(watch,{childList:true,subtree:true});
    setTimeout(run,150);setTimeout(run,900);setTimeout(run,2500);setInterval(run,15000);setInterval(()=>refreshTodayFallbackCharts(true).catch(()=>{}),300000);return true;
  }
"""
s=s.replace(old2,new2,1)

oldboot="""  function boot(){
    if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
    if(!installNews())setTimeout(installNews,0);
    if(!installDetailChartTabs())setTimeout(installDetailChartTabs,0);
    refreshWatchHistoryAndScores().then(()=>refreshTodayFallbackCharts()).catch(()=>{});
"""
assert oldboot in s, 'boot block changed unexpectedly'
newboot="""  function boot(){
    if(!installChronologicalDraw())setTimeout(installChronologicalDraw,0);
    if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
    if(!installNews())setTimeout(installNews,0);
    if(!installDetailChartTabs())setTimeout(installDetailChartTabs,0);
    refreshWatchHistoryAndScores().then(()=>refreshTodayFallbackCharts(true)).catch(()=>{});
"""
s=s.replace(oldboot,newboot,1)
p.write_text(s,encoding='utf-8')

p=Path('index.html')
s=p.read_text(encoding='utf-8')
s=re.sub(r'./extras-v090\.js\?v=[^\"\']+', './extras-v090.js?v=094r6', s)
p.write_text(s,encoding='utf-8')

p=Path('sw.js')
s=p.read_text(encoding='utf-8')
s=re.sub(r"const CACHE='[^']+';", "const CACHE='tw-ai-monitor-v094r6';", s, count=1)
p.write_text(s,encoding='utf-8')
