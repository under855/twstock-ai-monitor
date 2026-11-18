(() => {
  'use strict';
  const VERSION='0.9.8.17';
  const INTERVAL=6000; // Primary quote channel, exchange timestamps determine freshness.
  const SECONDARY_INTERVAL=INTERVAL; // Both MIS relay paths use the same six-second cycle.
  const SECONDARY_OFFSET=4000; // User rule: second MIS relay exactly four seconds after the first.
  const MIS_REQUEST_TIMEOUT=9000; // Verified production browser aborted at 3.4 seconds despite the proxy returning HTTP 200.
  const BACKUP_INTERVAL=60000;
  const INTRADAY_BACKUP_INTERVAL=30000;
  const INTRADAY_BACKUP_URL='https://raw.githubusercontent.com/under855/twstock-ai-monitor/market-data/data/intraday/latest.json';
  const MAX_POINTS=600;
  const QKEY='tw_live091_quotes_';
  const SKEY='tw_live091_series_';
  const IKEY='tw_live091_index_';
  const INTRADAY_LOCAL_PREFIXES=[QKEY,SKEY,IKEY,'tw_taiex_mis_series_'];
  let activeQuoteDay=null;
  const quotes=new Map();
  let verifiedClose=null,verifiedCloseCheckedAt=0,verifiedCloseBusy=false,verifiedCloseError='';
  // A masked quote may reappear only after its exchange timestamp advances.
  const resumeAfter=new Map();
  // A recent MIS response can confirm an unchanged last-trade price; exchange timestamp is not the HTTP receipt time.
  const lastConfirmedByCode=new Map();
  const series=new Map();
  const seeded=new Set();
  const seeding=new Set();
  let taiex=null;
  let lastIndexSnapshot=null, indexSnapshotBusy=false, lastIndexSnapshotPoll=0;
  let busy=false,secondaryBusy=false,secondaryCycles=0,secondaryLastPollAt=0,secondaryLastSuccessAt=0,secondaryLastError='',secondaryFailureCount=0,secondaryNextAllowedAt=0;
  let cycle=0;
  let lastPollAt=0;
  let lastSuccessAt=0;
  let lastBackupAt=0;
  let backupBusy=false;
  let lastError='';
  let lastMisReceivedAt=0,lastIndexMisReceivedAt=0,lastIndexMisStamp=0;
  let primaryLastSuccessAt=0,primaryLastFailureAt=0,secondaryLastFailureAt=0;
  let intradayBackupBusy=false,lastIntradayBackupAttempt=0,lastIntradayBackupReceivedAt=0,lastIntradayBackupError='',lastIntradayBackupStamp=0;
  let lastVisibleAt=Date.now();

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
  // TWSE announced non-trading dates (ROC 115 / 116). Update each year from the official calendar.
  const NON_TRADING_DATES=new Set([
    '20260101','20260212','20260213','20260216','20260217','20260218','20260219','20260220',
    '20260227','20260403','20260406','20260501','20260619','20260925','20260928',
    '20261009','20261026','20261225',
    '20270101','20270202','20270203','20270204','20270205','20270208','20270209','20270210',
    '20270301','20270405','20270406','20270430','20270609','20270915','20270928',
    '20271011','20271025','20271224','20271231'
  ]);
  function tradingDay(){const p=tp();return !['Sat','Sun'].includes(p.wd)&&!NON_TRADING_DATES.has(today());}
  function marketOpen(){const p=tp(),mins=p.h*60+p.min;return tradingDay()&&mins>=8*60+55&&mins<=13*60+35;}
  function postCloseWindow(){const p=tp(),mins=p.h*60+p.min;return tradingDay()&&mins>13*60+35&&mins<20*60;}
  function officialCloseComplete(){return taiex?.date===today()&&taiex?.officialClose===true&&watchCodes().every(code=>quotes.get(code)?.date===today()&&quotes.get(code)?.officialClose===true)}
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
  let misFailureCount=0,nextMisAttemptAt=0;
  async function fetchMis(codes,channel='primary'){
    const secondary=channel==='secondary';
    const now=Date.now();// Next six-second cycle retries; no long backoff after a source failure.
    const u=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channelList(codes).join('|'))}&json=1&delay=0&_=${now}`;
    const endpoints=[`https://proxy.cors.dev/${u}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`];
    let last=null;
    for(let attempt=0;attempt<1;attempt++){
      const index=secondary?1:0; // Distinct staggered scheduler handles endpoint 1, never poison the reliable primary with a failed secondary.
      try{
        const j=await getJson(endpoints[index],MIS_REQUEST_TIMEOUT);
        if(!Array.isArray(j?.msgArray))throw Error('MIS payload missing');
        let usable=j.msgArray;
        if(marketOpen()){
          // Use the same price/date parser as rendering; a placeholder trade.z must not hide a valid top-level z.
          usable=j.msgArray.filter(m=>{
            const isIndex=String(m?.c||'')==='t00'||String(m?.ch||'')==='t00.tw';
            const q=isIndex?parseTaiex(m):parseStock(m);
            return q!=null&&Number.isFinite(Number(q.stamp))&&sameDay(q.stamp)&&Number(q.stamp)<=Date.now()+30000;
          });
          if(!usable.length)throw Error('MIS quote payload has no today prices');
        }
        if(!secondary){misFailureCount=0;nextMisAttemptAt=0;lastError='';primaryLastSuccessAt=Date.now()}
        else{secondaryLastError='';secondaryLastSuccessAt=Date.now();secondaryFailureCount=0;secondaryNextAllowedAt=0}
        lastMisReceivedAt=Math.max(primaryLastSuccessAt,secondaryLastSuccessAt);
        const indexRecord=usable.map(m=>String(m?.c||'')==='t00'||String(m?.ch||'')==='t00.tw'?parseTaiex(m):null).filter(Boolean).sort((a,b)=>b.stamp-a.stamp)[0];
        if(indexRecord&&indexRecord.stamp>=lastIndexMisStamp){lastIndexMisStamp=indexRecord.stamp;lastIndexMisReceivedAt=Date.now()}
        window.__TW_UPDATE_HEALTH__?.(secondary?'台股第二通道':'台股行情',true);return usable;
      }catch(e){last=e}
    }
    if(secondary){secondaryLastError=String(last?.message||last||'第二通道無法存取');secondaryFailureCount++;secondaryLastFailureAt=Date.now();secondaryNextAllowedAt=0;window.__TW_UPDATE_HEALTH__?.('台股第二通道',false)}
    else{misFailureCount++;primaryLastFailureAt=Date.now();nextMisAttemptAt=0;lastError=String(last?.message||last||'來源無法存取');window.__TW_UPDATE_HEALTH__?.('台股行情',false)}
    throw last||Error('MIS unavailable');
  }

  function isoCompact(v){return String(v||'').replaceAll('-','').replaceAll('/','');}
  function eligibleIndexDate(d){
    if(!/^20\d{6}$/.test(String(d||'')))return false;
    const now=today();
    if(String(d)>now)return false;
    if(marketOpen())return String(d)===now;
    const then=Date.parse(String(d).slice(0,4)+'-'+String(d).slice(4,6)+'-'+String(d).slice(6,8)+'T00:00:00+08:00');
    return Number.isFinite(then)&&Date.now()-then<=14*86400000;
  }
  function sourcePriority(src){return /GitHub 官方盤中快照/.test(String(src||''))?1:/MIS/.test(String(src||''))?2:1;}
  function newerOrEqual(oldv,newv){
    if(!oldv)return true;
    const os=Number(oldv.stamp)||0,ns=Number(newv.stamp)||0;
    // Old versions incorrectly stamped midday backups at 13:30 before that time.
    // Never let a future-dated cached quote block a genuinely newer incoming tick.
    if(os>Date.now()+30000)return true;
    if(ns>Date.now()+30000)return false;
    if(newv.date!==oldv.date)return ns>os;
    if(Boolean(oldv.officialClose)!==Boolean(newv.officialClose))return Boolean(newv.officialClose);
    if(newv.officialClose)return ['price','change','prev','open','high','low','volume','turnover'].some(key=>num(oldv[key])!==num(newv[key]));
    if(ns>os)return true;if(ns<os)return false;
    return sourcePriority(newv.source)>sourcePriority(oldv.source);
  }
  async function fetchBackup(){
    return await window.__TW_LATEST_JSON__();
  }
  function parseBackup(j,codes){
    const map=new Map();let idx=null;const wanted=new Set((codes||[]).map(String));
    // latest.json is a daily snapshot, not an intraday tick feed. During trading it must not
    // fabricate a future 13:30 timestamp and overwrite real MIS quotes or prices.
    const p=tp();if(p.h*60+p.min<13*60+30&&isoCompact(j?.taiex?.date)===today())return {map,idx};
    const ti=j?.taiex||{},td=isoCompact(ti?.date);
    if(eligibleIndexDate(td)&&ti.source==='TWSE MI_INDEX'&&num(ti?.close)!=null){
      const tt=/^\d{2}:\d{2}:\d{2}$/.test(String(ti?.time||''))?String(ti.time):'13:33:00';
      const ms=stamp(td,tt);if(ms!=null)idx={date:td,price:num(ti.close),prev:num(ti.previousClose),change:num(ti.change),high:num(ti.high),low:num(ti.low),turnover:num(ti.turnover),time:tt,stamp:ms,officialClose:ti.source==='TWSE MI_INDEX',source:ti.source==='TWSE MI_INDEX'?'TWSE 官方收盤':'官方備援資料'};
    }
    const obj=j?.symbols||{};
    for(const code of wanted){
      const x=obj?.[code];if(!x)continue;const d=isoCompact(x.tradeDate);
      // Only the exchange's finalized post-close report may mark a quote as official close.
      const finalized=x?.source==='TWSE MI_INDEX'||x?.source==='TPEx dailyQuotes';
      if(!finalized||d!==today()||num(x.close)==null)continue;
      const tt='13:30:00',ms=stamp(d,tt);if(ms==null)continue;
      map.set(code,{code,date:d,price:num(x.close),prev:num(x.change)==null?null:num(x.close)-num(x.change),change:num(x.change),open:num(x.open),high:num(x.high),low:num(x.low),volume:num(x.volume),tradeTime:tt,stamp:ms,volumeUnit:'shares',source:'官方收盤資料',officialClose:true,live:true});
    }
    return {map,idx};
  }

  function parseIntradaySnapshot(j,codes){
    const map=new Map();let idx=null;
    if(!j||j.date!==today().replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')||j.source!=='TWSE MIS official snapshots')throw Error('備援資料日期或來源驗證失敗');
    const wanted=new Set((codes||[]).map(String)),now=Date.now();
    const latest=arr=>Array.isArray(arr)?arr.reduce((best,p)=>Number.isFinite(Number(p?.stamp))&&(!best||Number(p.stamp)>Number(best.stamp))?p:best,null):null;
    function validPoint(p){
      const ms=Number(p?.stamp),price=num(p?.close);
      return p?.source==='TWSE MIS'&&price!=null&&price>0&&Number.isFinite(ms)&&sameDay(ms)&&ms<=now+30000;
    }
    for(const code of wanted){
      const p=latest(j.stocks?.[code]);if(!validPoint(p))continue;
      // Do not infer day change from an unrelated daily cached quote.
      const prev=null; // Snapshot only has the trade price, not a verified previous close.
      const ms=Number(p.stamp),price=num(p.close);
      map.set(code,{code,date:today(),price,prev,change:prev==null?null:price-prev,open:null,high:null,low:null,volume:null,tradeTime:hhmmss(ms),stamp:ms,volumeUnit:'unknown',source:'GitHub 官方盤中快照（延遲行情）',live:true});
    }
    const p=latest(j.taiex);
    if(validPoint(p)){
      const prior=null; // Backup snapshot does not carry a verified previous close.
      const ms=Number(p.stamp),price=num(p.close);
      idx={date:today(),price,prev:prior,change:prior==null?null:price-prior,time:hhmmss(ms),stamp:ms,source:'GitHub 官方盤中快照（可能延遲）'};
    }
    return {map,idx};
  }
  async function pollIntradayBackup(force=false){
    if((!marketOpen()&&!postCloseWindow())||intradayBackupBusy||document.visibilityState==='hidden'||(!force&&Date.now()-lastIntradayBackupAttempt<INTRADAY_BACKUP_INTERVAL)||!needsIntradayBackup())return false;
    intradayBackupBusy=true;lastIntradayBackupAttempt=Date.now();
    try{
      const data=await getJson(INTRADAY_BACKUP_URL+'?ts='+Date.now(),8000);
      const {map,idx}=parseIntradaySnapshot(data,requestedCodes());let accepted=0;
      if(acceptIndex(idx))accepted++;
      for(const q of map.values())if(acceptQuote(q))accepted++;
      const latestStamp=Math.max(Number(idx?.stamp)||0,...[...map.values()].map(q=>Number(q.stamp)||0));
      if(latestStamp){lastIntradayBackupStamp=latestStamp;lastIntradayBackupReceivedAt=Date.now();lastIntradayBackupError='';window.__TW_UPDATE_HEALTH__?.('台股備援行情',true)}
      else{lastIntradayBackupError='今日備援快照無法使用（缺少有效日期、價格或來源逾時）';window.__TW_UPDATE_HEALTH__?.('台股備援行情',false)}
      if(accepted){lastSuccessAt=Date.now();saveToday()}
      paintAll();return latestStamp>0;
    }catch(e){lastIntradayBackupError=String(e?.message||e);window.__TW_UPDATE_HEALTH__?.('台股備援行情',false);paintAll();return false}
    finally{intradayBackupBusy=false}
  }

  function parseStock(m){
    const code=String(m?.c||'').trim(),date=String(m?.d||'');if(!code||date!==today())return null;
    const tr=m?.trade||{},tradePrice=num(tr?.z),price=tradePrice??num(m?.z);if(price==null)return null;
    const time=String((tradePrice!=null?tr?.t:m?.t)||m?.t||tr?.t||''),ms=stamp(date,time);if(ms==null)return null;
    const prev=num(m?.y);
    return {code,date,price,prev,change:prev==null?null:price-prev,open:num(m?.o),high:num(m?.h),low:num(m?.l),volume:num(m?.v),tradeTime:time,stamp:ms,volumeUnit:'lots',source:'TWSE MIS 盤中最新成交',live:true};
  }
  function parseTaiex(m){
    if(String(m?.d||'')!==today())return null;
    const price=num(m?.z)??num(m?.trade?.z);if(price==null)return null;
    const time=String(m?.t||m?.trade?.t||''),ms=stamp(m.d,time)??num(m?.tlong);if(ms==null||!sameDay(ms))return null;
    const prev=num(m?.y);return {date:String(m.d),price,prev,change:prev==null?null:price-prev,high:num(m?.h),low:num(m?.l),time,stamp:ms,source:'TWSE MIS 盤中即時'};
  }
  function parse(items){
    const map=new Map();let idx=null;
    for(const m of items){
      const c=String(m?.c||'');if(c==='t00'||String(m?.ch||'')==='t00.tw'){const x=parseTaiex(m);if(x&&(!idx||x.stamp>=idx.stamp))idx=x;continue;}
      const q=parseStock(m);if(!q)continue;const old=map.get(q.code);if(!old||q.stamp>=old.stamp)map.set(q.code,q);
    }
    return {map,idx};
  }

  function discardPreviousDayIntraday(){
    const d=today();
    // Delete only intraday quotes/charts. Keep exchange daily history for scoring,
    // official closing data, user watchlists and simulated portfolio intact.
    try{
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i);
        const prefix=INTRADAY_LOCAL_PREFIXES.find(p=>key?.startsWith(p));
        if(prefix&&key!==prefix+d)localStorage.removeItem(key);
      }
    }catch{}
    if(activeQuoteDay===null){activeQuoteDay=d;return false}
    if(activeQuoteDay===d)return false;
    activeQuoteDay=d;
    quotes.clear();series.clear();lastConfirmedByCode.clear();resumeAfter.clear();
    seeded.clear();seeding.clear();taiex=null;lastIndexSnapshot=null;
    lastIntradayBackupStamp=0;lastIntradayBackupReceivedAt=0;lastIntradayBackupError='';
    primaryLastSuccessAt=0;secondaryLastSuccessAt=0;lastMisReceivedAt=0;lastIndexMisReceivedAt=0;lastIndexMisStamp=0;
    try{quoteCache={}}catch{}
    for(const r of document.querySelectorAll('#watch article.row')){
      const code=r.querySelector('.sym')?.textContent?.trim();
      if(code)maskRow(code,'新交易日資料尚未取得');
    }
    return true;
  }
  function loadToday(){
    discardPreviousDayIntraday();
    const d=today();
    const validTimestamp=ms=>Number.isFinite(Number(ms))&&Number(ms)<=Date.now()+30000&&sameDay(Number(ms));
    try{const x=JSON.parse(localStorage.getItem(IKEY+d)||'null');if(x?.date===d&&validTimestamp(x.stamp)&&num(x.price)!=null)taiex={...x,source:'本日最後盤中指數（重新連線中）'}}catch{}
    try{const obj=JSON.parse(localStorage.getItem(QKEY+d)||'{}');for(const [code,q] of Object.entries(obj)){if(q?.date===d&&validTimestamp(q.stamp)&&num(q.price)!=null&&!q.officialClose&&!/官方備援收盤資料/.test(String(q.source||'')))quotes.set(code,{...q,source:'本日最後盤中成交（重新連線中）',live:true})}}catch{}
    try{const obj=JSON.parse(localStorage.getItem(SKEY+d)||'{}');for(const [code,a] of Object.entries(obj)){if(!Array.isArray(a))continue;const clean=a.filter(p=>validTimestamp(p?.stamp)&&num(p?.close)!=null&&!/官方備援收盤/.test(String(p.source||''))).sort((x,y)=>x.stamp-y.stamp).slice(-MAX_POINTS);if(clean.length)series.set(code,clean)}}catch{}
  }
  function saveToday(){
    discardPreviousDayIntraday();
    const d=today(),qo={},so={};for(const [c,q] of quotes)if(q?.date===d&&sameDay(q.stamp))qo[c]=q;for(const [c,a] of series)so[c]=a.slice(-MAX_POINTS);
    try{localStorage.setItem(QKEY+d,JSON.stringify(qo));localStorage.setItem(SKEY+d,JSON.stringify(so));if(taiex?.date===d&&sameDay(taiex.stamp))localStorage.setItem(IKEY+d,JSON.stringify(taiex))}catch{}
  }
  function isLiveMis(q){return /^TWSE MIS 盤中/.test(String(q?.source||''))}
  function isSnapshot(q){return /GitHub 官方盤中快照/.test(String(q?.source||''))}
  // Backup eligibility is per instrument, not based on an unrelated symbol's HTTP success.
  function liveStockHealthy(code){const q=quotes.get(String(code));return q?.date===today()&&isLiveMis(q)&&Date.now()-(lastConfirmedByCode.get(String(code))||0)<=30000}
  function needsIntradayBackup(){return !marketOpen()||intradayIndexState(taiex)!=='fresh'||requestedCodes().some(code=>!liveStockHealthy(code))}
  function acceptQuote(q){
    if(!q||!sameDay(q.stamp)||Number(q.stamp)>Date.now()+30000)return false;
    const old=quotes.get(q.code);
    if(marketOpen()&&isSnapshot(q)&&liveStockHealthy(q.code))return false;
    // Recover MIS provenance at an equal timestamp; never roll back a later verified trade.
    if(!newerOrEqual(old,q))return false;quotes.set(q.code,q);
    if(q.officialClose)return true;
    const a=series.get(q.code)||[],last=a.at(-1);if(!last||Number(last.stamp)<q.stamp)a.push({stamp:q.stamp,close:q.price,source:q.source||'行情'});else if(Number(last.stamp)===q.stamp)last.close=q.price;
    a.sort((x,y)=>x.stamp-y.stamp);if(a.length>MAX_POINTS)a.splice(0,a.length-MAX_POINTS);series.set(q.code,a);return true;
  }
  function acceptIndex(x){
    if(!x||!eligibleIndexDate(x.date)||Number(x.stamp)>Date.now()+30000)return false;
    if(marketOpen()&&isSnapshot(x)&&intradayIndexState(taiex)==='fresh')return false;
    if(!newerOrEqual(taiex,x))return false;
    if(taiex?.date===x.date){
      // Preserve same-day verified intraday range when the official close has no range fields.
      if(num(x.high)==null&&num(taiex.high)!=null)x.high=taiex.high;
      if(num(x.low)==null&&num(taiex.low)!=null)x.low=taiex.low;
      if(num(x.turnover)==null&&num(taiex.turnover)!=null)x.turnover=taiex.turnover;
    }
    taiex=x;return true;
  }

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
  function maskRow(code,reason='行情暫時無法確認'){
    const r=row(code);if(!r)return;
    const q=quotes.get(code);
    if(marketOpen()&&!resumeAfter.has(code))resumeAfter.set(code,Number(q?.stamp)||0);
    r.dataset.liveState='invalid';r.dataset.livePrice='';delete r.dataset.quoteSignature;
    setText(r.querySelector('.price'),'—');
    const ch=r.querySelector('.chg');if(ch){setText(ch,'—');setClass(ch,'chg flat')}
    setText(r.querySelector('.dayline'),'—');
    setText(r.querySelector('.meta'),reason+'｜等待新有效行情');
    setText(r.querySelector('.scoreNum'),'—');
    setText(r.querySelector('.scoreLabel'),'行情無效，暫停即時評分');
  }
  function verifiedUnchangedTrade(code,q,now=Date.now()){
    // Old last trade stays *visible* even if the source is unreachable;
    // update receipt status independently from the exchange's last trade time.
    return (q?.source==='TWSE MIS 盤中最新成交'||q?.source==='本日最後盤中成交（重新連線中）')&&q?.date===today()&&
      Number.isFinite(Number(q.stamp))&&Number(q.stamp)<=now&&
      (q?.source==='本日最後盤中成交（重新連線中）'||(primaryLastFailureAt>primaryLastSuccessAt&&secondaryLastFailureAt>secondaryLastSuccessAt)||now-(lastConfirmedByCode.get(String(code))||0)>30000);
  }
  function confirmMisQuotes(map){for(const q of map.values())if(q?.date===today()&&q?.source==='TWSE MIS 盤中最新成交'&&Number(q.stamp)<=Date.now()+30000&&Number(q.stamp)>=(Number(quotes.get(q.code)?.stamp)||0))lastConfirmedByCode.set(String(q.code),Date.now());}
  function quoteProblem(code,q){
    if(!marketOpen())return '';
    // Primary gateway failure does not invalidate independently verified backup quotes.
    if(!q?.live||q.date!==today()||num(q.price)==null)return '尚未取得今日有效行情';
    const age=Date.now()-Number(q.stamp);
    if(!Number.isFinite(age)||age < -30000)return '行情時間戳記異常';
    if(/GitHub 官方盤中快照/.test(String(q.source||'')))return '';
    // No elapsed-time rejection. An exchange can legitimately repeat the last trade
    // while both relay channels continue receiving valid same-day market records.
    // Receipt failures are reported separately; never turn an unchanged trade into an invalid price.
    return '';
  }
  function paintRow(code,q){
    const r=row(code);if(!r)return;
    const problem=quoteProblem(code,q);
    if(problem){maskRow(code,problem);return}
    resumeAfter.delete(code);
    const backupDelayed=/GitHub 官方盤中快照/.test(String(q.source||''));
    const delayedTrade=backupDelayed||verifiedUnchangedTrade(code,q);
    const signature=JSON.stringify([q.stamp,q.price,q.change,q.open,q.high,q.low,q.volume,q.source,delayedTrade]);
    if((r.dataset.liveState==='live'||r.dataset.liveState==='delayed')&&r.dataset.quoteSignature===signature)return;
    r.dataset.quoteSignature=signature;
    r.dataset.liveState=delayedTrade?'delayed':'live';r.dataset.liveDate=q.date;r.dataset.liveStamp=String(q.stamp);r.dataset.livePrice=String(q.price);
    const p=r.querySelector('.price'),ch=r.querySelector('.chg'),d=r.querySelector('.dayline'),m=r.querySelector('.meta');
    setText(p,fmt(q.price));
    if(ch){setText(ch,(q.change>0?'+':'')+fmt(q.change));setClass(ch,'chg '+cls(q.change))}
    setText(d,(delayedTrade?'最後成交 ':q.officialClose?'收盤 ': '')+q.tradeTime+'　開 '+fmt(q.open)+'　高 '+fmt(q.high)+'　低 '+fmt(q.low)+(delayedTrade?'　最後成交價 ':'　最新 ')+fmt(q.price)+'　量 '+fmt(q.volume,0)+(q.volumeUnit==='lots'?' 張':q.volumeUnit==='shares'?' 股':'（單位未確認）'));
    setText(m,q.source+(delayedTrade?'｜最後成交 ':'｜成交 ')+q.tradeTime+(backupDelayed?'｜非最新資料・僅供歷史參考':delayedTrade?'｜非最新資料・來源尚未再次確認':''));
    const c=canvasFor(r);if(!(typeof window.__TW_DRAW_MAIN_TODAY__==='function'&&window.__TW_DRAW_MAIN_TODAY__(code,c)))drawLine(c,series.get(code)||[]);
    if(delayedTrade){setText(r.querySelector('.scoreNum'),'—');setText(r.querySelector('.scoreLabel'),backupDelayed?'GitHub 延遲快照，不進行即時評分':'來源暫未確認，暫停即時評分');return}
    if(/GitHub 官方盤中快照/.test(String(q.source))){setText(r.querySelector('.scoreNum'),'—');setText(r.querySelector('.scoreLabel'),'備援僅提供成交價，暫停即時評分');return}
    try{const base=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{},hist=historyCache?.[code]||[],s=scoreStock(base,val,hist,q),sn=r.querySelector('.scoreNum'),sl=r.querySelector('.scoreLabel');if(sn){setText(sn,s.total==null?'—':String(s.total));setClass(sn,'scoreNum '+scoreCls(s.total))}if(sl)setText(sl,s.total==null?'資料不足':s.mode)}catch{}
  }
  function intradayIndexState(x,now=Date.now()){
    if(!x||x.date!==today()||!Number.isFinite(Number(x.stamp)))return 'missing';
    if(x.officialClose)return 'official-close';
    const age=now-Number(x.stamp);
    if(age < -30000)return 'future';
    // Exchange's last index publication time is not the gateway's last success time.
    // Keep the last verified index visible, but do not label an old publication as current.
    if(/GitHub 官方盤中快照|重新連線中/.test(String(x.source||'')))return 'stale';
    return age<=30000&&Number(x.stamp)===lastIndexMisStamp&&now-lastIndexMisReceivedAt<=30000?'fresh':'stale';
  }
  function paintIndexExtras(x,usable){
    const p=document.getElementById('taiexPercent');
    const h=document.getElementById('taiexHigh'),l=document.getElementById('taiexLow'),t=document.getElementById('taiexTurnover');
    const prev=num(x?.prev)??(num(x?.price)!=null&&num(x?.change)!=null?num(x.price)-num(x.change):null);
    const pct=usable&&prev>0&&num(x?.change)!=null?100*num(x.change)/prev:null;
    if(p){setText(p,pct==null?'':(pct>0?'+':'')+pct.toFixed(2)+'%');setClass(p,'s '+(pct==null?'muted':cls(x.change)))}
    const validRange=usable&&num(x?.high)!=null&&num(x?.low)!=null&&num(x.high)>=num(x.low);
    setText(h,validRange?fmt(x.high,2):'—');setText(l,validRange?fmt(x.low,2):'—');
    const turnover=usable?num(x?.turnover):null;
    setText(t,turnover!=null&&turnover>=0?(turnover/100000000).toLocaleString('zh-TW',{maximumFractionDigits:2})+' 億':'—');
  }
  function latestIndexForDisplay(){
    const live=taiex?.date===today()&&num(taiex.price)!=null?taiex:null;
    if(live&&intradayIndexState(live)==='fresh')return live;
    const backup=lastIndexSnapshot?.date===today()&&num(lastIndexSnapshot.price)!=null?lastIndexSnapshot:null;
    if(!live)return backup;
    if(!backup)return live;
    return Number(backup.stamp)>Number(live.stamp)?backup:live;
  }
  async function pollIndexSnapshot(){
    if(!marketOpen()||intradayIndexState(taiex)==='fresh'||indexSnapshotBusy||document.visibilityState==='hidden'||Date.now()-lastIndexSnapshotPoll<60000)return;
    indexSnapshotBusy=true;lastIndexSnapshotPoll=Date.now();
    try{
      // Same versioned official-data file already used by the app, not a new data provider.
      const j=await fetchBackup(),x=j?.taiex||{},d=isoCompact(x.date);
      const t=String(x.time||''),ms=stamp(d,t),now=Date.now();
      if(d!==today()||num(x.close)==null||ms==null||ms>now+30000||now-ms>6*3600000)return;
      // MI_INDEX is official close; MIS live is time-stamped but NOT a verified fresh tick.
      if(x.source!=='TWSE MIS live'&&x.source!=='TWSE MI_INDEX')return;
      const previous=num(x.previousClose)??(num(x.change)!=null?num(x.close)-num(x.change):null);
      const item={date:d,price:num(x.close),change:num(x.change),prev:previous,
        time:t,stamp:ms,turnover:num(x.turnover),source:x.source,officialClose:x.source==='TWSE MI_INDEX'};
      if(!lastIndexSnapshot||ms>=Number(lastIndexSnapshot.stamp))lastIndexSnapshot=item;
      paintIndex();
    }catch{/* Preserve last known dated value; never turn a fetch error into a fake tick. */}
    finally{indexSnapshotBusy=false}
  }
  function paintIndex(){
    const v=document.getElementById('taiex'),c=document.getElementById('taiexChg');
    if(marketOpen()){
      const state=intradayIndexState(taiex);
      if(state!=='fresh'){
        // The last known same-day quote is informational, NOT a real-time quote.
        const last=latestIndexForDisplay();
        if(last&&Number(last.stamp)<=Date.now()+30000&&num(last.price)>0){
          paintIndexExtras(null,false);
          setText(v,fmt(last.price,2));
          setClass(v,'v flat');
          if(c){
            const mins=Math.max(0,Math.floor((Date.now()-Number(last.stamp))/60000));
            const source=last.officialClose?'正式收盤':'最後已取得行情';
            setText(c,'今日最後已驗證指數（非即時）｜'+source+' '+last.time+'｜資料時間差 '+(mins>0?mins+' 分鐘':Math.max(0,Math.floor((Date.now()-Number(last.stamp))/1000))+' 秒'));
            setClass(c,'s muted');
          }
        }else{
          const prior=priorIndexClose();
          paintIndexExtras(null,false);setText(v,prior?fmt(prior.price,2):'—');setClass(v,'v flat');
          if(c){setText(c,prior?'前一交易日官方收盤 '+prior.date.replaceAll('-','/')+'｜非今日行情':'即時行情暫時無法確認｜正在取得最近一筆資料');setClass(c,'s muted')}
        }
        return;
      }
    }
    if(!taiex||!eligibleIndexDate(taiex.date)){const prior=priorIndexClose();paintIndexExtras(null,false);setText(v,prior?fmt(prior.price,2):'—');setClass(v,'v flat');if(c&&prior){setText(c,'前一交易日官方指數 '+prior.date.replaceAll('-','/')+'｜非今日收盤');setClass(c,'s muted')}return}
    paintIndexExtras(taiex,true);
    setText(v,fmt(taiex.price,2));setClass(v,'v '+(num(taiex.change)==null?'flat':cls(taiex.change)));
    if(c){
      const dateLabel=taiex.date===today()?'':('｜最近交易日 '+taiex.date.slice(0,4)+'/'+taiex.date.slice(4,6)+'/'+taiex.date.slice(6,8));
      setText(c,(taiex.change>0?'+':'')+fmt(taiex.change,2)+'｜'+(taiex.officialClose?'TWSE 官方收盤':'TWSE MIS 最後指數')+' '+(taiex.time||'')+dateLabel);
      setClass(c,'s '+cls(taiex.change));
    }
  }
  function paintDetail(){
    try{
      const code=String(active||'');if(!code||!document.getElementById('sheet')?.classList.contains('show'))return;
      const q=quotes.get(code),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v},big=document.getElementById('bigChart'),title=big?.closest('.card')?.querySelector('h3');
      const drawRetained=()=>typeof window.__TW_DRAW_DETAIL_TODAY__==='function'&&window.__TW_DRAW_DETAIL_TODAY__(code,big);
      window.__TW_SYNC_DETAIL_FROM_MAIN__?.(code);
      const problem=quoteProblem(code,q);
      if(problem){
        ['dPrice','dOpen','dRange','dVolume','dChange'].forEach(id=>set(id,'—'));
        const prior=priorCloseFor(code);
        if(prior){set('dPrice',fmt(prior.price));set('dTime','前一交易日官方收盤 '+prior.date.replaceAll('-','/')+'｜非今日成交價｜'+problem)}
        else set('dTime',problem+'｜等待新有效行情');
      }
      if(problem||!q?.live||q.date!==today()){
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
  function quoteFreshness(q){
    if(!q||q.date!==today()||!Number.isFinite(Number(q.stamp)))return 'unknown';
    if(q.officialClose)return 'close';
    const age=Date.now()-Number(q.stamp);
    return age<0?'future':/GitHub 官方盤中快照/.test(String(q.source||''))?'older':Date.now()-(lastConfirmedByCode.get(String(q.code))||0)<=30000?'recent':'older';
  }
  function paintStatus(){
    const b=document.getElementById('liveBadge'),s=document.getElementById('marketStatus'),t=document.getElementById('marketTime'),p=document.getElementById('refreshPill');
    // A successful HTTP request is not proof that the exchange price advanced.
    const indexAge=taiex?.stamp?Date.now()-Number(taiex.stamp):Infinity;
    // Separate exchange timestamp from HTTP response receipt time.
    const fromBackup=/GitHub 官方盤中快照/.test(String(taiex?.source||''));
    const fresh=intradayIndexState(taiex)==='fresh';
    if(marketOpen()){
      const retryDelay=Math.max(0,Math.ceil((nextMisAttemptAt-Date.now())/1000));
      const label=fresh?'盤中來源有效':fromBackup&&indexAge>=-30000?'GitHub 備援延遲行情（非即時）':'行情延遲／來源重試中';
      setText(p,'主要 '+INTERVAL/1000+' 秒／第二通道 '+SECONDARY_INTERVAL/1000+' 秒交錯檢查｜資料時效依交易所｜v'+VERSION);
      if(b){setText(b,label+' v'+VERSION);setClass(b,'liveBadge '+(fresh?'ok':'warn'))}
      setText(s,label);
      setText(t,fresh?(fromBackup?'GitHub 備援快照 '+(taiex?.time||'—')+'｜快照非每6秒更新':'證交所行情 '+(taiex?.time||'—')+'｜本機收到 '+hhmmss(lastIndexMisReceivedAt)):
        '最後行情 '+(taiex?.time||'—')+'｜'+(retryDelay?'下次來源重試約 '+retryDelay+' 秒':'來源尚未更新'));

    }else if(hasTodayData()){
      if(p)p.textContent=`今日收盤／最後成交｜v${VERSION}`;if(b){b.textContent=`今日資料 v${VERSION}`;b.className='liveBadge ok'}if(s)s.textContent='今日收盤／最後成交';if(t)t.textContent=`MIS 最後成交／指數 ${taiex?.time||''}`;
    }
  }
  function paintQuality(){
    const state=document.getElementById('qualityState'),details=document.getElementById('qualityDetails');if(!state||!details)return;
    const indexState=intradayIndexState(taiex),retry=Math.max(0,Math.ceil((nextMisAttemptAt-Date.now())/1000));
    if(marketOpen()){
      const viaBackup=/GitHub 官方盤中快照/.test(String(taiex?.source||''));
      const valid=indexState==='fresh';
      setText(state,valid?'盤中資料有效':'行情延遲／來源重試中');setClass(state,'v '+(valid?'down':'up'));
      setText(details,valid?'指數來源 '+(taiex?.time||'—')+(viaBackup?'｜GitHub 官方快照（可能延遲）':'｜每 6 秒檢查，非保證每次有新成交'): '指數狀態：'+indexState+'｜'+(retry?'約 '+retry+' 秒後重試':'等待來源資料')+'｜不以舊價冒充即時');
    }else{
      const valid=taiex?.officialClose===true;
      setText(state,valid?'官方收盤已確認':'非盤中｜等待官方收盤');setClass(state,'v '+(valid?'down':'flat'));
      setText(details,valid?'交易所日期 '+(taiex?.date||'—')+'｜更新時間 '+(taiex?.time||'—'):'盤後資料可能延後公布；請核對下方各檔來源日期');
    }
  }
  function paintAll(){
    discardPreviousDayIntraday();
    paintQuality();
    if(!marketOpen()&&!hasTodayData()){
      paintIndex();
      for(const code of watchCodes())if(!showPriorCloseRow(code))maskRow(code,'無法確認最近交易日行情');
      paintDetail();paintStatus();debug();return;
    }
    paintIndex();
    for(const code of watchCodes()){
      const q=quotes.get(code);
      if(marketOpen()){
        const problem=quoteProblem(code,q);
        if(problem){if(!showPriorCloseRow(code))maskRow(code,problem);continue}
      }
      if(q?.date===today())paintRow(code,q);
      else if(marketOpen())maskRow(code,'尚未取得今日有效行情');
    }
    paintDetail();paintStatus();debug();
  }

  function verifiedPriorCloseDate(v){
    const d=String(v||'');
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(d))return false;
    const todayIso=today().replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
    const ms=Date.parse(d+'T00:00:00+08:00'),todayMs=Date.parse(todayIso+'T00:00:00+08:00');
    return Number.isFinite(ms)&&Number.isFinite(todayMs)&&new Date(ms).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})===d&&d<todayIso;
  }
  function priorCloseFor(code){
    const x=verifiedClose?.symbols?.[String(code)];
    if(!x||!verifiedPriorCloseDate(x.tradeDate)||!['TWSE STOCK_DAY_ALL','TPEx dailyQuotes','TWSE MI_INDEX'].includes(x.source)||num(x.close)==null||num(x.close)<=0)return null;
    return {code:String(code),date:x.tradeDate,price:num(x.close),source:x.source};
  }
  function priorIndexClose(){
    const x=verifiedClose?.taiex;
    if(!x||!verifiedPriorCloseDate(x.date)||!['TWSE FMTQIK','TWSE MI_INDEX'].includes(x.source)||num(x.close)==null||num(x.close)<=0)return null;
    return {date:x.date,price:num(x.close),source:x.source};
  }
  function showPriorCloseRow(code){
    const r=row(code),q=quotes.get(String(code));
    if(!r)return false;
    // The previously authenticated exchange trade is still a historical fact,
    // but never present it as the current trading price after the source stops updating.
    if(q?.date===today()&&(/TWSE MIS 盤中最新成交/.test(String(q.source))||/GitHub 官方盤中快照/.test(String(q.source)))&&num(q.price)>0&&
       Number.isFinite(Number(q.stamp))&&Number(q.stamp)<=Date.now()+30000&&sameDay(q.stamp)){
      const ts=String(q.tradeTime||hhmmss(q.stamp));
      r.dataset.liveState='stale-today';r.dataset.livePrice=String(q.price);r.dataset.liveDate=q.date;
      delete r.dataset.quoteSignature;
      setText(r.querySelector('.price'),fmt(q.price));
      const ch=r.querySelector('.chg');if(ch){setText(ch,'—');setClass(ch,'chg flat')}
      setText(r.querySelector('.dayline'),'今日最後已驗證成交 '+ts+'｜非目前即時價');
      setText(r.querySelector('.meta'),q.source+'｜最後已驗證成交 '+today().replace(/^(\d{4})(\d{2})(\d{2})$/,'$1/$2/$3')+' '+ts+'｜來源中斷或延遲（非即時）');
      setText(r.querySelector('.scoreNum'),'—');setText(r.querySelector('.scoreLabel'),'行情未更新，暫停即時評分');
      return true;
    }
    const x=priorCloseFor(code);if(!x)return false;
    r.dataset.liveState='previous-close';r.dataset.livePrice=String(x.price);r.dataset.liveDate=x.date.replaceAll('-','');
    delete r.dataset.quoteSignature;
    setText(r.querySelector('.price'),fmt(x.price));
    const ch=r.querySelector('.chg');if(ch){setText(ch,'—');setClass(ch,'chg flat')}
    setText(r.querySelector('.dayline'),'前一交易日官方收盤 '+x.date.replaceAll('-','/')+'｜非今日成交價');
    setText(r.querySelector('.meta'),'官方收盤備援｜'+x.source+'｜'+x.date.replaceAll('-','/')+'｜盤中報價暫無法確認');
    setText(r.querySelector('.scoreNum'),'—');setText(r.querySelector('.scoreLabel'),'僅有前一交易日收盤價，暫停即時評分');
    return true;
  }
  async function loadVerifiedClose(force=false){
    if(verifiedCloseBusy||(!force&&verifiedClose&&Date.now()-verifiedCloseCheckedAt<15*60000))return;
    verifiedCloseBusy=true;verifiedCloseCheckedAt=Date.now();
    try{
      const x=await window.__TW_LATEST_JSON__();
      // Mixed-date public cache can include today's provisional TPEx rows while TWSE quotes remain prior-day official closes.
      // Validate each symbol's exchange source and date individually before displaying.
      if(!x?.symbols||typeof x.symbols!=='object'||Object.keys(x.symbols).length<1)throw Error('官方資料欄位或格式不符');
      verifiedClose=x;verifiedCloseError='';paintAll();
    }catch(e){verifiedCloseError=String(e?.message||e);paintAll()}
    finally{verifiedCloseBusy=false}
  }
  function placeholder(code){return {code:String(code),price:'',change:'',prev:'',open:'',high:'',low:'',volume:'',date:today(),stamp:null,tradeTime:'',source:'今日資料載入中',live:false}}
  if(originalQuote)quote=async function(code,allowNetwork=true){const q=quotes.get(String(code));if(q?.date===today())return q;if(marketOpen())return placeholder(code);return originalQuote(code,allowNetwork)};
  if(originalRender)render=async function(allowNetwork=false){const x=await originalRender(marketOpen()?false:allowNetwork);if(marketOpen()||hasTodayData())paintAll();return x};
  if(originalShow)show=async function(code,opts={}){code=String(code);const q=quotes.get(code);if(q?.date===today()||marketOpen())quoteCache[code]=q||placeholder(code);const x=await originalShow(code,opts);if(q?.date===today()||marketOpen()){paintDetail();if(marketOpen())poll(false)}return x};

  function debug(){const stocks={};for(const code of watchCodes()){const q=quotes.get(code),a=series.get(code)||[],r=row(code);stocks[code]={date:q?.date||null,price:q?.price??null,change:q?.change??null,tradeTime:q?.tradeTime||null,stamp:q?.stamp||null,freshness:quoteFreshness(q),source:q?.source||null,seriesPoints:a.length,seriesLastStamp:a.at(-1)?.stamp||null,domState:r?.dataset?.liveState||null,domDate:r?.dataset?.liveDate||null,domStamp:Number(r?.dataset?.liveStamp||0)||null,domPrice:r?.dataset?.livePrice||null,invalidReason:r?.dataset?.liveState==='invalid'?r.querySelector('.meta')?.textContent:null}}window.__TW_LIVE_V091__={version:VERSION,intervalMs:INTERVAL,marketWindow:marketOpen(),indexFreshness:intradayIndexState(taiex),indexAgeSeconds:taiex?.stamp?Math.round((Date.now()-Number(taiex.stamp))/1000):null,confirmedLastTradeCount:lastConfirmedByCode.size,officialCloseFallback:{loaded:!!verifiedClose,tradeDate:verifiedClose?.tradeDate||null,error:verifiedCloseError},backupSource:{lastReceivedAt:lastIntradayBackupReceivedAt,lastStamp:lastIntradayBackupStamp,lastError:lastIntradayBackupError,busy:intradayBackupBusy},secondarySource:{intervalMs:SECONDARY_INTERVAL,cycles:secondaryCycles,lastPollAt:secondaryLastPollAt,lastSuccessAt:secondaryLastSuccessAt,lastFailureAt:secondaryLastFailureAt,lastError:secondaryLastError},primarySource:{intervalMs:INTERVAL,lastPollAt,lastSuccessAt:primaryLastSuccessAt,lastFailureAt:primaryLastFailureAt,lastError},cycle,lastPollAt,lastSuccessAt,lastMisReceivedAt,lastIndexMisReceivedAt,lastIndexMisStamp,nextMisAttemptAt,failures:misFailureCount,lastError,taiex:taiex?{date:taiex.date,price:taiex.price,change:taiex.change,high:taiex.high,low:taiex.low,turnover:taiex.turnover,time:taiex.time,stamp:taiex.stamp,source:taiex.source}:null,stocks}}

  async function pollBackup(force=false){
    if(!postCloseWindow()||officialCloseComplete()||backupBusy||(!force&&Date.now()-lastBackupAt<BACKUP_INTERVAL))return false; // No off-hours stock requests; retry only today's unfinished official close.
    backupBusy=true;lastBackupAt=Date.now();
    try{const codes=requestedCodes(),{map,idx}=parseBackup(await fetchBackup(),codes);let accepted=0;if(acceptIndex(idx))accepted++;for(const q of map.values())if(acceptQuote(q))accepted++;if(accepted){lastSuccessAt=Date.now();saveToday();}paintAll();window.__TW_UPDATE_HEALTH__?.('盤後行情',!!idx);return accepted>0}catch{window.__TW_UPDATE_HEALTH__?.('盤後行情',false);return false}finally{backupBusy=false}
  }
  async function poll(force=false){
    if(!marketOpen()||busy||document.visibilityState==='hidden')return; // Force never bypasses market hours.
    // Every six seconds poll primary; the backup has an independent cadence.
    busy=true;cycle++;lastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes));confirmMisQuotes(map);let accepted=0;if(acceptIndex(idx))accepted++;for(const q of map.values()){if(acceptQuote(q))accepted++}if(accepted)lastSuccessAt=Date.now();saveToday();paintAll();
    }catch(e){lastError=String(e?.message||e);if(marketOpen())void pollIntradayBackup(false);else void pollBackup(false);paintAll();debug()}finally{busy=false}
  }
  async function pollSecondary(){
    if(!marketOpen()||secondaryBusy||document.visibilityState==='hidden')return false;
    secondaryBusy=true;secondaryCycles++;secondaryLastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes,'secondary'));
      confirmMisQuotes(map);let accepted=0;if(acceptIndex(idx))accepted++;
      for(const q of map.values())if(acceptQuote(q))accepted++;
      if(accepted){lastSuccessAt=Date.now();saveToday()}
      paintAll();return accepted>0;
    }catch(e){secondaryLastError=String(e?.message||e);paintAll();return false}
    finally{secondaryBusy=false}
  }
  window.__TW_STOCK_MARKET_OPEN__=marketOpen;
  window.__TW_STOCK_POST_CLOSE_WINDOW__=postCloseWindow;
  window.__TW_LIVE_REFRESH__=()=>poll(false);
  window.__TW_SECONDARY_REFRESH__=()=>pollSecondary();
  window.__TW_BACKUP_REFRESH__=()=>pollBackup(true);
  window.__TW_SCHEDULER_STATE__=()=>({marketOpen:marketOpen(),postCloseWindow:postCloseWindow(),officialCloseComplete:officialCloseComplete(),primaryInterval:INTERVAL,secondaryInterval:SECONDARY_INTERVAL,secondaryOffset:SECONDARY_OFFSET,backupInterval:INTRADAY_BACKUP_INTERVAL,secondaryCycles,secondaryLastPollAt,secondaryLastSuccessAt,secondaryLastFailureAt,secondaryLastError,secondaryFailureCount,secondaryNextAllowedAt,primaryLastSuccessAt,primaryLastFailureAt});
  function start(){
    loadToday();paintAll();loadVerifiedClose(false);if(marketOpen()){poll(false)}else if(postCloseWindow()){pollBackup(false);pollIntradayBackup(true)}
    // Always schedule polling: a page opened before 09:00 must start updating when trading begins.
    // The poll function itself skips requests outside the TW market window.
    setInterval(()=>{discardPreviousDayIntraday();poll(false)},INTERVAL);
    setInterval(()=>{if(marketOpen()&&!verifiedClose)loadVerifiedClose(true)},5*60000);
    setTimeout(()=>{pollSecondary();setInterval(pollSecondary,SECONDARY_INTERVAL)},SECONDARY_OFFSET);
    setInterval(()=>pollIntradayBackup(false),INTRADAY_BACKUP_INTERVAL);
    setInterval(()=>{if(postCloseWindow()&&!officialCloseComplete())pollBackup(false)},BACKUP_INTERVAL);
    setInterval(pollIndexSnapshot,60000);
    if(!marketOpen()){const p=document.getElementById('refreshPill');if(p&&!hasTodayData())setText(p,`休市／檢查今日最終資料｜v${VERSION}`);debug()}
    const resume=()=>{if(document.visibilityState==='hidden')return;if(Date.now()-lastVisibleAt<2000)return;lastVisibleAt=Date.now();if(marketOpen()){poll(false);pollSecondary();pollIntradayBackup(true);pollIndexSnapshot()}else if(postCloseWindow())pollBackup(false)};
    addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();