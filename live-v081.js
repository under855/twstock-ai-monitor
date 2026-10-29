(() => {
  'use strict';
  const VERSION='0.8.1';
  const INTERVAL=15000;
  const liveSeries=new Map();
  let busy=false;

  const n=v=>{if(v==null)return null;const s=String(v).trim().replaceAll(',','').replaceAll('+','');if(!s||s==='-'||s==='--'||s==='---')return null;const x=Number(s);return Number.isFinite(x)?x:null};
  const f=(v,d=2)=>n(v)==null?'—':n(v).toLocaleString('zh-TW',{maximumFractionDigits:d});
  const cclass=v=>n(v)==null?'flat':n(v)>0?'up':n(v)<0?'down':'flat';
  const taipeiDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');

  async function getJson(url,timeout=7000){
    const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);
    try{const r=await fetch(url,{cache:'no-store',signal:ac.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
    finally{clearTimeout(t)}
  }

  function watchCodes(){
    try{return [...new Set((typeof watchlist==='function'?watchlist():[]).map(String))].slice(0,20)}catch{return[]}
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

  function parse(m){
    const code=String(m?.c||'').trim();if(!code||String(m?.d||'')!==taipeiDate())return null;
    const trade=n(m?.trade?.z);
    const direct=n(m?.z);
    const ask=n(String(m?.a||'').split('_')[0]);
    const bid=n(String(m?.b||'').split('_')[0]);
    const price=trade??direct??ask??bid;
    if(price==null)return null;
    const prev=n(m?.y);
    const tlong=n(m?.tlong);
    const time=tlong?new Date(tlong):new Date();
    const tradeTime=String(m?.trade?.t||m?.t||'');
    return {code,price,prev,change:prev==null?null:price-prev,open:n(m?.o),high:n(m?.h),low:n(m?.l),volume:n(m?.v),time,tradeTime,source:trade!=null?'TWSE MIS 最新成交':'TWSE MIS 即時報價'};
  }

  function latestMap(items){
    const map=new Map();
    for(const m of items){const q=parse(m);if(!q)continue;const old=map.get(q.code);if(!old||q.time>=old.time)map.set(q.code,q)}
    return map;
  }

  function remember(code,q){
    const arr=liveSeries.get(code)||[];
    const last=arr.at(-1);
    const stamp=q.time?.getTime?.()||Date.now();
    if(!last||last.stamp!==stamp||last.close!==q.price){arr.push({date:q.tradeTime||'',close:q.price,stamp});if(arr.length>80)arr.splice(0,arr.length-80)}
    liveSeries.set(code,arr);
  }

  function patchRow(row,code,q){
    if(!row||!q)return;
    const p=row.querySelector('.price'),chg=row.querySelector('.chg'),day=row.querySelector('.dayline'),meta=row.querySelector('.meta');
    if(p)p.textContent=f(q.price);
    if(chg){chg.textContent=`${q.change>0?'+':''}${f(q.change)}`;chg.className=`chg ${cclass(q.change)}`}
    if(day)day.textContent=`${q.tradeTime||q.time.toLocaleTimeString('zh-TW')}　開 ${f(q.open)}　高 ${f(q.high)}　低 ${f(q.low)}　最新 ${f(q.price)}　量 ${f(q.volume,0)}`;
    if(meta)meta.innerHTML=`<span>${q.source}</span><span>漲跌 ${q.change>0?'+':''}${f(q.change)}</span>`;
    try{
      const cv=row.querySelector('canvas.spark');const arr=liveSeries.get(code)||[];
      if(cv&&typeof draw==='function')draw(cv,arr.length>=2?arr:(historyCache?.[code]||[]),true,arr.length>=2?null:q.price);
    }catch{}
    try{
      const base=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{},hist=historyCache?.[code]||[],s=scoreStock(base,val,hist,q);
      const sn=row.querySelector('.scoreNum'),sl=row.querySelector('.scoreLabel');
      if(sn){sn.textContent=s.total==null?'—':String(s.total);sn.className=`scoreNum ${scoreCls(s.total)}`}
      if(sl)sl.textContent=s.total==null?'資料不足':s.mode;
    }catch{}
  }

  function patchRows(map){
    document.querySelectorAll('#watch article.row').forEach(row=>{const code=row.querySelector('.sym')?.textContent?.trim();if(code&&map.has(code))patchRow(row,code,map.get(code))});
  }

  function patchDetail(map){
    try{
      const code=String(active||'');if(!code||!map.has(code)||!document.getElementById('sheet')?.classList.contains('show'))return;
      const q=map.get(code),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
      set('dPrice',f(q.price));set('dOpen',f(q.open));set('dRange',`${f(q.high)} / ${f(q.low)}`);set('dVolume',f(q.volume,0));set('dTime',`${q.source}｜${q.tradeTime||q.time.toLocaleTimeString('zh-TW')}`);
      const ch=document.getElementById('dChange');if(ch){ch.textContent=`${q.change>0?'+':''}${f(q.change)}`;ch.className='v '+cclass(q.change)}
      const cv=document.getElementById('bigChart');if(cv&&typeof draw==='function')draw(cv,historyCache?.[code]||[],false,q.price);
    }catch{}
  }

  async function refreshLive(){
    if(busy)return;busy=true;
    try{
      const items=await fetchMis(watchCodes());const map=latestMap(items);
      for(const [code,q] of map){remember(code,q);try{quoteCache[code]=q}catch{}}
      patchRows(map);patchDetail(map);
      const pill=document.getElementById('refreshPill');if(pill)pill.textContent=`盤中即時：15 秒｜v${VERSION}`;
      const badge=document.getElementById('liveBadge');if(badge){badge.textContent=`盤中即時 v${VERSION}`;badge.className='liveBadge ok'}
      window.__TW_LIVE_V081__={ok:true,version:VERSION,count:map.size,at:Date.now()};
    }catch(e){window.__TW_LIVE_V081__={ok:false,version:VERSION,error:String(e),at:Date.now()}}
    finally{busy=false}
  }

  function boot(){
    const pill=document.getElementById('refreshPill');if(pill)pill.textContent=`盤中即時：15 秒｜v${VERSION}`;
    refreshLive();setInterval(refreshLive,INTERVAL);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
