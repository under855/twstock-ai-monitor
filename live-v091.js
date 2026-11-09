(() => {
  'use strict';
  const VERSION='0.9.5';
  const INTERVAL=2000;
  const BACKUP_INTERVAL=60000;
  const MAX_POINTS=600;
  const QKEY='tw_live091_quotes_';
  const SKEY='tw_live091_series_';
  const IKEY='tw_live091_index_';
  const quotes=new Map();
  const series=new Map();
  const seeded=new Set();
  const seeding=new Set();
  let taiex=null;
  let busy=false;
  let cycle=0;
  let lastPollAt=0;
  let lastSuccessAt=0;
  let lastBackupAt=0;
  let backupBusy=false;

  const originalQuote=typeof quote==='function'?quote:null;
  const originalRender=typeof render==='function'?render:null;
  const originalShow=typeof show==='function'?show:null;

  const num=v=>{
    if(v==null)return null;
    const s=String(v).trim().replaceAll(',','').replaceAll('+','');
    if(!s||s==='-'||s==='--'||s==='---')return null;
    const n=Number(s);return Number.isFinite(n)?n:null;
  };
  const fmt=(v,d=2)=>num(v)==null?'—':num(v).toLocaleString('zh-TW',{maximumFractionDigits:d});
  const cls=v=>num(v)==null?'flat':num(v)>0?'up':num(v)<0?'down':'flat';
  const setText=(e,v)=>{if(e&&e.textContent!==String(v))e.textContent=String(v)};
  const setClass=(e,c)=>{if(e&&e.className!==c)e.className=c};

  function tp(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now);
    const g=t=>parts.find(p=>p.type===t)?.value||'';
    return {y:g('year'),m:g('month'),d:g('day'),wd:g('weekday'),h:Number(g('hour')),min:Number(g('minute')),sec:Number(g('second'))};
  }
  function today(){const p=tp();return `${p.y}${p.m}${p.d}`;}
  function marketOpen(){const p=tp(),mins=p.h*60+p.min;return !['Sat','Sun'].includes(p.wd)&&mins>=8*60+55&&mins<=13*60+35;}
  function stamp(date,time){
    if(!/^\d{8}$/.test(String(date||''))||!/^\d{2}:\d{2}:\d{2}$/.test(String(time||'')))return null;
    const d=String(date),ms=Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${time}+08:00`);
    return Number.isFinite(ms)?ms:null;
  }
  function sameDay(ms){if(!Number.isFinite(Number(ms)))return false;const p=tp(new Date(Number(ms)));return `${p.y}${p.m}${p.d}`===today();}
  function hhmm(ms){const p=tp(new Date(Number(ms)));return `${String(p.h).padStart(2,'0')}:${String(p.min).padStart(2,'0')}`;}
  function hhmmss(ms){const p=tp(new Date(Number(ms)));return `${String(p.h).padStart(2,'0')}:${String(p.min).padStart(2,'0')}:${String(p.sec).padStart(2,'0')}`;}

  function watchCodes(){try{return [...new Set(watchlist().map(String))].slice(0,20)}catch{return[]}}
  function requestedCodes(){const a=watchCodes();try{if(active&&!a.includes(String(active)))a.push(String(active))}catch{}return a;}
  function marketOf(code){
    try{const m=String(universeMap?.get?.(String(code))?.market||'');if(m==='TPEx')return 'otc';if(m==='TWSE')return 'tse';}catch{}
    if(String(code)==='3293')return 'otc';
    return null;
  }
  function channelList(codes){
    const out=['tse_t00.tw'];
    for(const code of codes){const m=marketOf(code);if(m)out.push(`${m}_${code}.tw`);else out.push(`tse_${code}.tw`,`otc_${code}.tw`);}
    return [...new Set(out)];
  }

  async function getJson(url,timeout=7000){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
    try{const r=await fetch(url,{cache:'no-store',signal:ac.signal});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}
  }
  // Do not depend on one public CORS gateway. Requests are sequential and the outer poll is single-flight.
  let proxyPreferred=0,misFailureCount=0,nextMisAttemptAt=0;
  async function fetchMis(codes){
    const now=Date.now();if(now<nextMisAttemptAt)throw Error('MIS retry backoff');
    const u=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channelList(codes).join('|'))}&json=1&delay=0&_=${now}`;
    const endpoints=[`https://proxy.cors.dev/${u}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`];
    let last=null;
    for(let attempt=0;attempt<endpoints.length;attempt++){
      const index=(proxyPreferred+attempt)%endpoints.length;
      try{
        const j=await getJson(endpoints[index],5500);
        if(!Array.isArray(j?.msgArray))throw Error('MIS payload missing');
        const ticker=j.msgArray.find(m=>String(m?.c||'')==='t00');
        if(marketOpen()&&ticker){
          const epoch=Number(ticker.tlong),ms=epoch>1e12?epoch:stamp(String(ticker.d||''),String(ticker.t||''));
          if(!Number.isFinite(ms)||ms>Date.now()+30000||Date.now()-ms>90000){
            throw Error('MIS index feed is stale; try next route');
          }
        }
        proxyPreferred=index;misFailureCount=0;nextMisAttemptAt=0;return j.msgArray;
      }catch(e){last=e}
    }
    misFailureCount++;
    nextMisAttemptAt=Date.now()+Math.min(30000,8000*Math.min(misFailureCount,3));
    throw last||Error('MIS unavailable');
  }

  function isoCompact(v){return String(v||'').replaceAll('-','').replaceAll('/','');}
  function sourcePriority(src){return /MIS/.test(String(src||''))?2:1;}
  function newerOrEqual(oldv,newv){
    if(!oldv)return true;
    const os=Number(oldv.stamp)||0,ns=Number(newv.stamp)||0;
    // Old versions incorrectly stamped midday backups at 13:30 before that time.
    // Never let a future-dated cached quote block a genuinely newer incoming tick.
    if(os>Date.now()+30000)return true;
    if(ns>Date.now()+30000)return false;
    if(Boolean(oldv.officialClose)!==Boolean(newv.officialClose))return Boolean(newv.officialClose);
    if(newv.officialClose)return ['price','change','prev','open','high','low','volume'].some(key=>oldv[key]!==newv[key]);
    if(ns>os)return true;if(ns<os)return false;
    return sourcePriority(newv.source)>sourcePriority(oldv.source);
  }
  async function fetchBackup(){
    return await getJson(`./data/latest.json?_=${Date.now()}`,7000);
  }
  function parseBackup(j,codes){
    const map=new Map();let idx=null;const wanted=new Set((codes||[]).map(String));
    // latest.json is a daily snapshot, not an intraday tick feed. During trading it must not
    // fabricate a future 13:30 timestamp and overwrite real MIS quotes or prices.
    const p=tp();if(p.h*60+p.min<13*60+30)return {map,idx};
    const ti=j?.taiex||{},td=isoCompact(ti?.date);
    if(td===today()&&num(ti?.close)!=null){
      const tt=/^\d{2}:\d{2}:\d{2}$/.test(String(ti?.time||''))?String(ti.time):'13:33:00';
      const ms=stamp(td,tt);if(ms!=null)idx={date:td,price:num(ti.close),prev:num(ti.previousClose),change:num(ti.change),time:tt,stamp:ms,officialClose:ti.source==='TWSE MI_INDEX',source:ti.source==='TWSE MI_INDEX'?'TWSE 官方收盤':'官方備援資料'};
    }
    const obj=j?.symbols||{};
    for(const code of wanted){
      const x=obj?.[code];if(!x)continue;const d=isoCompact(x.tradeDate);if(d!==today()||num(x.close)==null)continue;
      const tt='13:30:00',ms=stamp(d,tt);if(ms==null)continue;
      map.set(code,{code,date:d,price:num(x.close),prev:num(x.change)==null?null:num(x.close)-num(x.change),change:num(x.change),open:num(x.open),high:num(x.high),low:num(x.low),volume:num(x.volume),tradeTime:tt,stamp:ms,volumeUnit:'shares',source:'官方收盤資料',officialClose:true,live:true});
    }
    return {map,idx};
  }

  function parseStock(m){
    const code=String(m?.c||'').trim(),date=String(m?.d||'');if(!code||date!==today())return null;
    const tr=m?.trade||{},price=num(tr?.z)??num(m?.z);if(price==null)return null;
    const time=String(tr?.t||m?.t||''),ms=stamp(date,time);if(ms==null)return null;
    const prev=num(m?.y);
    return {code,date,price,prev,change:prev==null?null:price-prev,open:num(m?.o),high:num(m?.h),low:num(m?.l),volume:num(m?.v),tradeTime:time,stamp:ms,volumeUnit:'lots',source:'TWSE MIS 盤中最新成交',live:true};
  }
  function parseTaiex(m){
    if(String(m?.d||'')!==today())return null;
    const price=num(m?.z)??num(m?.trade?.z);if(price==null)return null;
    const time=String(m?.t||m?.trade?.t||''),ms=stamp(m.d,time)??num(m?.tlong);if(ms==null||!sameDay(ms))return null;
    const prev=num(m?.y);return {date:String(m.d),price,prev,change:prev==null?null:price-prev,time,stamp:ms,source:'TWSE MIS 盤中即時'};
  }
  function parse(items){
    const map=new Map();let idx=null;
    for(const m of items){
      const c=String(m?.c||'');if(c==='t00'||String(m?.ch||'')==='t00.tw'){const x=parseTaiex(m);if(x&&(!idx||x.stamp>=idx.stamp))idx=x;continue;}
      const q=parseStock(m);if(!q)continue;const old=map.get(q.code);if(!old||q.stamp>=old.stamp)map.set(q.code,q);
    }
    return {map,idx};
  }

  function loadToday(){
    const d=today();
    const validTimestamp=ms=>Number.isFinite(Number(ms))&&Number(ms)<=Date.now()+30000&&sameDay(Number(ms));
    try{const x=JSON.parse(localStorage.getItem(IKEY+d)||'null');if(x?.date===d&&validTimestamp(x.stamp)&&num(x.price)!=null)taiex={...x,source:'本日最後盤中指數（重新連線中）'}}catch{}
    try{const obj=JSON.parse(localStorage.getItem(QKEY+d)||'{}');for(const [code,q] of Object.entries(obj)){if(q?.date===d&&validTimestamp(q.stamp)&&num(q.price)!=null&&!q.officialClose&&!/官方備援收盤資料/.test(String(q.source||'')))quotes.set(code,{...q,source:'本日最後盤中成交（重新連線中）',live:true})}}catch{}
    try{const obj=JSON.parse(localStorage.getItem(SKEY+d)||'{}');for(const [code,a] of Object.entries(obj)){if(!Array.isArray(a))continue;const clean=a.filter(p=>validTimestamp(p?.stamp)&&num(p?.close)!=null&&!/官方備援收盤/.test(String(p.source||''))).sort((x,y)=>x.stamp-y.stamp).slice(-MAX_POINTS);if(clean.length)series.set(code,clean)}}catch{}
  }
  function saveToday(){
    const d=today(),qo={},so={};for(const [c,q] of quotes)if(q?.date===d&&sameDay(q.stamp))qo[c]=q;for(const [c,a] of series)so[c]=a.slice(-MAX_POINTS);
    try{localStorage.setItem(QKEY+d,JSON.stringify(qo));localStorage.setItem(SKEY+d,JSON.stringify(so));if(taiex?.date===d&&sameDay(taiex.stamp))localStorage.setItem(IKEY+d,JSON.stringify(taiex))}catch{}
  }
  function acceptQuote(q){
    if(!q||!sameDay(q.stamp)||Number(q.stamp)>Date.now()+30000)return false;
    const old=quotes.get(q.code);if(!newerOrEqual(old,q))return false;quotes.set(q.code,q);
    if(q.officialClose)return true;
    const a=series.get(q.code)||[],last=a.at(-1);if(!last||Number(last.stamp)<q.stamp)a.push({stamp:q.stamp,close:q.price,source:q.source||'行情'});else if(Number(last.stamp)===q.stamp)last.close=q.price;
    a.sort((x,y)=>x.stamp-y.stamp);if(a.length>MAX_POINTS)a.splice(0,a.length-MAX_POINTS);series.set(q.code,a);return true;
  }
  function acceptIndex(x){if(!x||!sameDay(x.stamp)||Number(x.stamp)>Date.now()+30000||!newerOrEqual(taiex,x))return false;taiex=x;return true}

  function seedCurrent(){}

  function drawLine(canvas,a){
    if(!canvas)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const data=(a||[]).filter(p=>sameDay(Number(p.stamp))&&num(p.close)!=null).sort((x,y)=>x.stamp-y.stamp);
    if(data.length<2&&canvas.dataset.history==='1')return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,devicePixelRatio||1),w=Math.max(30,Math.round((r.width||320)*dpr)),h=Math.max(24,Math.round((r.height||50)*dpr));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;ctx.clearRect(0,0,w,h);
    if(data.length<2){if(canvas.dataset.sessionDate&&canvas.dataset.todayPoints)return false;ctx.fillStyle='#91a8c2';ctx.font=`${Math.round(11*dpr)}px sans-serif`;ctx.textAlign='center';ctx.fillText('載入最近交易日走勢',w/2,h/2);return false}
    canvas.dataset.history='0';
    const vals=data.map(p=>num(p.close));let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*.08;hi+=pad;lo-=pad;const t0=data[0].stamp,t1=data.at(-1).stamp,span=Math.max(1,t1-t0),X=p=>dpr+(p.stamp-t0)/span*(w-2*dpr),Y=v=>dpr+(hi-v)/(hi-lo)*(h-2*dpr);
    ctx.strokeStyle='rgba(120,173,255,.98)';ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.beginPath();data.forEach((p,i)=>{if(i)ctx.lineTo(X(p),Y(num(p.close)));else ctx.moveTo(X(p),Y(num(p.close)));});ctx.stroke();const last=data.at(-1);ctx.fillStyle='#edf5ff';ctx.beginPath();ctx.arc(X(last),Y(num(last.close)),Math.max(2.2,2.5*dpr),0,Math.PI*2);ctx.fill();return true;
  }
  function row(code){return [...document.querySelectorAll('#watch article.row')].find(x=>x.querySelector('.sym')?.textContent?.trim()===String(code))||null}
  function canvasFor(r){let c=r?.querySelector('canvas.spark');if(c)return c;const f=r?.querySelector('.sparkFallback');if(!f)return null;c=document.createElement('canvas');c.className='spark';f.replaceWith(c);return c}
  function maskRow(code){
    const r=row(code);if(!r)return;
    // A missing tick must not turn the card into a blinking empty placeholder.
    if(r.dataset.liveState==='live'||r.dataset.liveState==='delayed'){
      r.dataset.liveState='delayed';setText(r.querySelector('.meta'),'最後已取得行情｜來源延遲，等待新成交');return;
    }
    if(r.dataset.liveState==='waiting')return;
    r.dataset.liveState='waiting';
    const fallback=universeQuote(code)||snapshotQuote(code);
    setText(r.querySelector('.meta'),fallback?`${fallback.source}｜非即時`:'行情暫時無法讀取');
  }
  function paintRow(code,q){
    const r=row(code);if(!r)return;
    if(!q?.live||q.date!==today()){maskRow(code);return}
    const signature=JSON.stringify([q.stamp,q.price,q.change,q.open,q.high,q.low,q.volume,q.source]);
    if(r.dataset.liveState==='live'&&r.dataset.quoteSignature===signature)return;
    r.dataset.quoteSignature=signature;
    r.dataset.liveState='live';r.dataset.liveDate=q.date;r.dataset.liveStamp=String(q.stamp);r.dataset.livePrice=String(q.price);
    const p=r.querySelector('.price'),ch=r.querySelector('.chg'),d=r.querySelector('.dayline'),m=r.querySelector('.meta');
    setText(p,fmt(q.price));
    if(ch){setText(ch,(q.change>0?'+':'')+fmt(q.change));setClass(ch,'chg '+cls(q.change))}
    setText(d,(q.officialClose?'收盤 ': '')+q.tradeTime+'　開 '+fmt(q.open)+'　高 '+fmt(q.high)+'　低 '+fmt(q.low)+'　最新 '+fmt(q.price)+'　量 '+fmt(q.volume,0)+(q.volumeUnit==='lots'?' 張':q.volumeUnit==='shares'?' 股':'（單位未確認）'));
    setText(m,q.source+(q.officialClose?'｜':'｜成交 ')+q.tradeTime);
    const c=canvasFor(r);if(!(typeof window.__TW_DRAW_MAIN_TODAY__==='function'&&window.__TW_DRAW_MAIN_TODAY__(code,c)))drawLine(c,series.get(code)||[]);
    try{const base=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{},hist=historyCache?.[code]||[],s=scoreStock(base,val,hist,q),sn=r.querySelector('.scoreNum'),sl=r.querySelector('.scoreLabel');if(sn){setText(sn,s.total==null?'—':String(s.total));setClass(sn,'scoreNum '+scoreCls(s.total))}if(sl)setText(sl,s.total==null?'資料不足':s.mode)}catch{}
  }
  function paintIndex(){
    const v=document.getElementById('taiex'),c=document.getElementById('taiexChg');
    if(!taiex||taiex.date!==today()){
      if(marketOpen()&&v&&(!v.textContent||v.textContent==='讀取中'))setText(v,'—');
      return;
    }
    setText(v,fmt(taiex.price,2));
    if(c){setText(c,(taiex.change>0?'+':'')+fmt(taiex.change,2)+'｜'+(taiex.officialClose?'TWSE 官方收盤':'TWSE 指數時間')+' '+taiex.time);setClass(c,'s '+cls(taiex.change))}
  }
  function paintDetail(){
    try{
      const code=String(active||'');if(!code||!document.getElementById('sheet')?.classList.contains('show'))return;
      const q=quotes.get(code),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v},big=document.getElementById('bigChart'),title=big?.closest('.card')?.querySelector('h3');
      const drawRetained=()=>typeof window.__TW_DRAW_DETAIL_TODAY__==='function'&&window.__TW_DRAW_DETAIL_TODAY__(code,big);
      window.__TW_SYNC_DETAIL_FROM_MAIN__?.(code);
      if(!q?.live||q.date!==today()){
        if(title)title.textContent='盤中／最近交易日走勢';
        if(drawRetained()){
          const sd=window.__TW_DETAIL_SESSION_DATE__?.(code)||'';set('chartMsg',sd?`${sd.replaceAll('-','/')} 最近交易日走勢`:'最近交易日走勢');
        }else set('chartMsg','最近交易日走勢載入中');
        return;
      }
      set('dPrice',fmt(q.price));set('dOpen',fmt(q.open));set('dRange',`${fmt(q.high)} / ${fmt(q.low)}`);set('dVolume',fmt(q.volume,0)+(q.volumeUnit==='lots'?' 張':q.volumeUnit==='shares'?' 股':'（單位未確認）'));set('dTime',`${q.source}｜${q.tradeTime}`);
      const ch=document.getElementById('dChange');if(ch){ch.textContent=`${q.change>0?'+':''}${fmt(q.change)}`;ch.className=`v ${cls(q.change)}`}
      if(title)title.textContent=q.officialClose?'今日交易走勢':'今日盤中即時走勢';
      const a=series.get(code)||[];
      if(!drawRetained())drawLine(big,a);
      if(a.length>=2)set('chartMsg',`今日盤中即時走勢｜${hhmm(a[0].stamp)}～${hhmm(a.at(-1).stamp)}｜最新端為 TWSE MIS 成交`);
    }catch{}
  }
  function hasTodayData(){if(taiex?.date===today())return true;for(const q of quotes.values())if(q?.date===today()&&num(q.price)!=null)return true;return false}
  function paintStatus(){
    const b=document.getElementById('liveBadge'),s=document.getElementById('marketStatus'),t=document.getElementById('marketTime'),p=document.getElementById('refreshPill');
    // A successful HTTP request is not proof that the exchange price advanced.
    const indexAge=taiex?.stamp?Date.now()-Number(taiex.stamp):Infinity;
    const fresh=lastSuccessAt>0&&Date.now()-lastSuccessAt<=30000&&indexAge<=90000;
    if(marketOpen()){
      if(p)p.textContent=`行情每 ${INTERVAL/1000} 秒檢查（資料可能延遲）｜v${VERSION}`;if(b){b.textContent=fresh?`盤中資料已接收 v${VERSION}`:`即時行情延遲／重試中 v${VERSION}`;b.className=fresh?'liveBadge ok':'liveBadge warn'}if(s)s.textContent=fresh?'盤中資料已接收':'即時行情延遲／重試';if(t)t.textContent=fresh?`指數來源時間 ${taiex?.time||'—'}｜最近接收 ${hhmmss(lastSuccessAt)}`:`最近嘗試 ${hhmmss(lastPollAt||Date.now())}｜等待有效資料`;
    }else if(hasTodayData()){
      if(p)p.textContent=`今日收盤／最後成交｜v${VERSION}`;if(b){b.textContent=`今日資料 v${VERSION}`;b.className='liveBadge ok'}if(s)s.textContent='今日收盤／最後成交';if(t)t.textContent=`MIS 最後成交／指數 ${taiex?.time||''}`;
    }
  }
  function paintAll(){if(!marketOpen()&&!hasTodayData()){debug();return}paintIndex();for(const code of watchCodes()){const q=quotes.get(code);if(q?.date===today())paintRow(code,q);else if(marketOpen())maskRow(code)}paintDetail();paintStatus();debug()}

  function placeholder(code){return {code:String(code),price:'',change:'',prev:'',open:'',high:'',low:'',volume:'',date:today(),stamp:null,tradeTime:'',source:'今日資料載入中',live:false}}
  if(originalQuote)quote=async function(code,allowNetwork=true){const q=quotes.get(String(code));if(q?.date===today())return q;if(marketOpen())return universeQuote(code)||snapshotQuote(code)||placeholder(code);return originalQuote(code,allowNetwork)};
  if(originalRender)render=async function(allowNetwork=false){const x=await originalRender(marketOpen()?false:allowNetwork);if(marketOpen()||hasTodayData())paintAll();return x};
  if(originalShow)show=async function(code,opts={}){code=String(code);const q=quotes.get(code);if(q?.date===today()||marketOpen())quoteCache[code]=q||universeQuote(code)||snapshotQuote(code)||placeholder(code);const x=await originalShow(code,opts);if(q?.date===today()||marketOpen()){paintDetail();poll(true)}return x};

  function debug(){const stocks={};for(const code of watchCodes()){const q=quotes.get(code),a=series.get(code)||[],r=row(code);stocks[code]={date:q?.date||null,price:q?.price??null,tradeTime:q?.tradeTime||null,stamp:q?.stamp||null,source:q?.source||null,seriesPoints:a.length,seriesLastStamp:a.at(-1)?.stamp||null,domState:r?.dataset?.liveState||null,domDate:r?.dataset?.liveDate||null,domStamp:Number(r?.dataset?.liveStamp||0)||null,domPrice:r?.dataset?.livePrice||null}}window.__TW_LIVE_V091__={version:VERSION,intervalMs:INTERVAL,marketWindow:marketOpen(),cycle,lastPollAt,lastSuccessAt,taiex:taiex?{date:taiex.date,price:taiex.price,change:taiex.change,time:taiex.time,stamp:taiex.stamp,source:taiex.source}:null,stocks}}

  async function pollBackup(force=false){
    if(backupBusy||(!force&&Date.now()-lastBackupAt<BACKUP_INTERVAL))return false;backupBusy=true;lastBackupAt=Date.now();
    try{const codes=requestedCodes(),{map,idx}=parseBackup(await fetchBackup(),codes);let accepted=0;if(acceptIndex(idx))accepted++;for(const q of map.values())if(acceptQuote(q))accepted++;if(accepted){lastSuccessAt=Date.now();saveToday();paintAll();}return accepted>0}catch{return false}finally{backupBusy=false}
  }
  async function poll(force=false){
    if((!marketOpen()&&!force)||busy)return;busy=true;cycle++;lastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes));let accepted=0;if(acceptIndex(idx))accepted++;for(const q of map.values()){if(acceptQuote(q))accepted++}if(accepted)lastSuccessAt=Date.now();saveToday();paintAll();
    }catch(e){await pollBackup(true);paintAll();debug();if(window.__TW_LIVE_V091__)window.__TW_LIVE_V091__.error=String(e?.message||e)}finally{busy=false}
  }
  function start(){
    loadToday();paintAll();poll(true);pollBackup(false);
    // Always schedule polling: a page opened before 09:00 must start updating when trading begins.
    // The poll function itself skips requests outside the TW market window.
    setInterval(()=>poll(false),INTERVAL);
    setInterval(()=>pollBackup(false),BACKUP_INTERVAL);
    if(!marketOpen()){const p=document.getElementById('refreshPill');if(p&&!hasTodayData())setText(p,`休市／檢查今日最終資料｜v${VERSION}`);debug()}
    addEventListener('focus',()=>{poll(true);pollBackup(true)});document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll(true);pollBackup(true)}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();