(() => {
  'use strict';
  const VERSION='0.9.0';
  const INTERVAL=15000;
  const MAX_POINTS=600;
  const QUOTE_KEY_PREFIX='tw_v090_quotes_';
  const SERIES_KEY_PREFIX='tw_v090_series_';
  const liveQuotes=new Map();
  const liveSeries=new Map();
  const seedStarted=new Set();
  const seedDone=new Set();
  let lastTaiex=null;
  let pollBusy=false;
  let cycle=0;
  let lastPollAt=0;
  let lastPollOkAt=0;
  let observer=null;

  const baseQuote=typeof quote==='function'?quote:null;
  const baseRender=typeof render==='function'?render:null;
  const baseShow=typeof show==='function'?show:null;
  const baseHistory=typeof history==='function'?history:null;

  const num=v=>{
    if(v==null)return null;
    const s=String(v).trim().replaceAll(',','').replaceAll('+','');
    if(!s||s==='-'||s==='--'||s==='---')return null;
    const x=Number(s);return Number.isFinite(x)?x:null;
  };
  const fmt=(v,d=2)=>num(v)==null?'—':num(v).toLocaleString('zh-TW',{maximumFractionDigits:d});
  const cssClass=v=>num(v)==null?'flat':num(v)>0?'up':num(v)<0?'down':'flat';

  function taipeiParts(now=new Date()){
    const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now);
    const get=t=>p.find(x=>x.type===t)?.value||'';
    return {year:get('year'),month:get('month'),day:get('day'),weekday:get('weekday'),hour:Number(get('hour')),minute:Number(get('minute')),second:Number(get('second'))};
  }
  function todayKey(){const p=taipeiParts();return `${p.year}${p.month}${p.day}`;}
  function inMarketWindow(){
    const p=taipeiParts(),wd=p.weekday,mins=p.hour*60+p.minute;
    return !['Sat','Sun'].includes(wd)&&mins>=8*60+55&&mins<=13*60+35;
  }
  function dateTimeStamp(d,t){
    if(!/^\d{8}$/.test(String(d||''))||!/^\d{2}:\d{2}:\d{2}$/.test(String(t||'')))return null;
    const s=String(d),iso=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${t}+08:00`,ms=Date.parse(iso);
    return Number.isFinite(ms)?ms:null;
  }
  function sameTaipeiDay(ms){
    if(!Number.isFinite(Number(ms)))return false;
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(ms))).replaceAll('-','');
    return p===todayKey();
  }
  function marketForCode(code){
    try{
      const m=String(universeMap?.get?.(String(code))?.market||'');
      if(m==='TPEx')return 'otc';if(m==='TWSE')return 'tse';
    }catch{}
    if(String(code)==='3293')return 'otc';
    return null;
  }
  function watchCodes(){try{return [...new Set(watchlist().map(String))].slice(0,20)}catch{return[]}}

  async function fetchJson(url,timeout=7000){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
    try{const r=await fetch(url,{cache:'no-store',signal:ac.signal,headers:{Accept:'application/json','Cache-Control':'no-cache'}});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}
  }
  async function fetchWithCors(upstream,timeout=7500){
    const urls=[upstream,`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`];
    let lastErr=null;
    for(const url of urls){try{return await fetchJson(url,timeout)}catch(e){lastErr=e}}
    throw lastErr||Error('live source unavailable');
  }

  function channels(codes){
    const out=['tse_t00.tw'];
    for(const code of codes){
      const ex=marketForCode(code);
      if(ex)out.push(`${ex}_${code}.tw`);
      else out.push(`tse_${code}.tw`,`otc_${code}.tw`);
    }
    return [...new Set(out)];
  }
  async function fetchMis(codes){
    const upstream=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels(codes).join('|'))}&json=1&delay=0&_=${Date.now()}`;
    const j=await fetchWithCors(upstream,7500);
    if(!Array.isArray(j?.msgArray))throw Error('MIS payload missing');
    return j.msgArray;
  }

  function parseStock(m){
    const code=String(m?.c||'').trim(),d=String(m?.d||'');
    if(!code||d!==todayKey())return null;
    const trade=m?.trade||{};
    const tradePrice=num(trade?.z),directPrice=num(m?.z),price=tradePrice??directPrice;
    if(price==null)return null;
    const tradeTime=String(trade?.t||m?.t||'');
    let stamp=dateTimeStamp(d,tradeTime);
    const tlong=num(m?.tlong);
    if(stamp==null&&tlong!=null&&sameTaipeiDay(tlong))stamp=tlong;
    if(stamp==null)return null;
    const prev=num(m?.y);
    return {
      code,date:d,price,prev,change:prev==null?null:price-prev,
      open:num(m?.o),high:num(m?.h),low:num(m?.l),volume:num(m?.v),
      time:new Date(stamp),tradeTime,stamp,
      source:'TWSE MIS 盤中最新成交',live:true
    };
  }
  function parseTaiex(m){
    const d=String(m?.d||'');if(d!==todayKey())return null;
    const trade=m?.trade||{},price=num(m?.z)??num(trade?.z);if(price==null)return null;
    const timeText=String(m?.t||trade?.t||''),tlong=num(m?.tlong);
    let stamp=dateTimeStamp(d,timeText);if(stamp==null&&tlong!=null&&sameTaipeiDay(tlong))stamp=tlong;if(stamp==null)return null;
    const prev=num(m?.y);return {date:d,price,prev,change:prev==null?null:price-prev,time:new Date(stamp),timeText,stamp,source:'TWSE MIS 盤中即時'};
  }
  function parsePayload(items){
    const map=new Map();let taiex=null;
    for(const m of items){
      const code=String(m?.c||'');
      if(code==='t00'||String(m?.ch||'')==='t00.tw'){const t=parseTaiex(m);if(t&&(!taiex||t.stamp>=taiex.stamp))taiex=t;continue;}
      const q=parseStock(m);if(!q)continue;
      const old=map.get(q.code);if(!old||q.stamp>=old.stamp)map.set(q.code,q);
    }
    return {map,taiex};
  }

  function placeholder(code){
    return {code:String(code),price:'',change:'',prev:'',open:'',high:'',low:'',volume:'',time:new Date(),source:'盤中即時資料載入中',live:false,unavailable:true};
  }
  function loadState(){
    const day=todayKey();
    try{
      const q=JSON.parse(localStorage.getItem(QUOTE_KEY_PREFIX+day)||'{}');
      for(const [code,x] of Object.entries(q)){
        if(!sameTaipeiDay(Number(x?.stamp))||num(x?.price)==null)continue;
        liveQuotes.set(code,{...x,time:new Date(Number(x.stamp)),source:'本日最後即時成交（更新中）',live:true,persisted:true});
      }
    }catch{}
    try{
      const s=JSON.parse(localStorage.getItem(SERIES_KEY_PREFIX+day)||'{}');
      for(const [code,arr] of Object.entries(s)){
        if(!Array.isArray(arr))continue;
        const clean=arr.filter(p=>sameTaipeiDay(Number(p?.stamp))&&num(p?.close)!=null).sort((a,b)=>a.stamp-b.stamp).slice(-MAX_POINTS);
        if(clean.length)liveSeries.set(code,clean);
      }
    }catch{}
    for(let i=localStorage.length-1;i>=0;i--){
      const k=localStorage.key(i);if(!k)continue;
      if((k.startsWith(QUOTE_KEY_PREFIX)||k.startsWith(SERIES_KEY_PREFIX))&&!k.endsWith(day)){try{localStorage.removeItem(k)}catch{}}
    }
  }
  function persistState(){
    const q={},s={};
    for(const [code,x] of liveQuotes){if(x?.live&&sameTaipeiDay(x.stamp))q[code]={...x,time:undefined};}
    for(const [code,arr] of liveSeries)s[code]=arr.slice(-MAX_POINTS);
    try{localStorage.setItem(QUOTE_KEY_PREFIX+todayKey(),JSON.stringify(q));localStorage.setItem(SERIES_KEY_PREFIX+todayKey(),JSON.stringify(s))}catch{}
  }
  function remember(q){
    const old=liveQuotes.get(q.code);
    if(old&&Number(old.stamp)>Number(q.stamp))return false;
    liveQuotes.set(q.code,q);
    const arr=liveSeries.get(q.code)||[],last=arr.at(-1);
    if(!last||Number(last.stamp)<Number(q.stamp))arr.push({stamp:q.stamp,date:q.tradeTime,close:q.price,source:'mis'});
    else if(Number(last.stamp)===Number(q.stamp)&&num(last.close)!==num(q.price)){last.close=q.price;last.source='mis';}
    arr.sort((a,b)=>a.stamp-b.stamp);if(arr.length>MAX_POINTS)arr.splice(0,arr.length-MAX_POINTS);liveSeries.set(q.code,arr);
    return true;
  }

  async function yahooIntraday(code){
    const ex=marketForCode(code),symbols=ex==='otc'?[`${code}.TWO`]:ex==='tse'?[`${code}.TW`]:[`${code}.TW`,`${code}.TWO`];
    for(const symbol of symbols){
      const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=false&_=${Date.now()}`;
      try{
        const j=await fetchWithCors(upstream,8500),r=j?.chart?.result?.[0],ts=r?.timestamp||[],cl=r?.indicators?.quote?.[0]?.close||[],out=[];
        for(let i=0;i<ts.length;i++){
          const stamp=Number(ts[i])*1000,px=num(cl[i]);if(px==null||!sameTaipeiDay(stamp))continue;
          const p=taipeiParts(new Date(stamp)),mins=p.hour*60+p.minute;if(mins<9*60||mins>13*60+35)continue;
          out.push({stamp,date:`${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`,close:px,source:'history'});
        }
        if(out.length)return out;
      }catch{}
    }
    return [];
  }
  async function seedIntraday(code){
    code=String(code);if(seedStarted.has(code))return;seedStarted.add(code);
    try{
      const seed=await yahooIntraday(code),existing=liveSeries.get(code)||[],map=new Map();
      for(const p of seed)map.set(Number(p.stamp),p);
      for(const p of existing)map.set(Number(p.stamp),p);
      const q=liveQuotes.get(code);if(q?.live)map.set(Number(q.stamp),{stamp:q.stamp,date:q.tradeTime,close:q.price,source:'mis'});
      const merged=[...map.values()].filter(p=>sameTaipeiDay(Number(p.stamp))).sort((a,b)=>a.stamp-b.stamp).slice(-MAX_POINTS);
      if(merged.length)liveSeries.set(code,merged);
    }finally{seedDone.add(code);persistState();paintAll();}
  }
  function seedAll(){for(const code of watchCodes())seedIntraday(code)}

  async function yahooDailyHistory(code){
    const ex=marketForCode(code),symbols=ex==='otc'?[`${code}.TWO`]:ex==='tse'?[`${code}.TW`]:[`${code}.TW`,`${code}.TWO`];
    for(const symbol of symbols){
      const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false&_=${Date.now()}`;
      try{
        const j=await fetchWithCors(upstream,8500),r=j?.chart?.result?.[0],ts=r?.timestamp||[],qq=r?.indicators?.quote?.[0]||{},out=[];
        for(let i=0;i<ts.length;i++){
          const close=num(qq.close?.[i]);if(close==null)continue;const d=new Date(Number(ts[i])*1000),p=taipeiParts(d);
          out.push({date:`${p.year}/${p.month}/${p.day}`,open:num(qq.open?.[i]),high:num(qq.high?.[i]),low:num(qq.low?.[i]),close,volume:num(qq.volume?.[i])});
        }
        if(out.length)return out;
      }catch{}
    }
    return [];
  }
  if(baseHistory){
    history=async function(code){
      code=String(code);if(historyCache?.[code]?.length)return historyCache[code];
      let out=[];try{out=await baseHistory(code)}catch{}
      if(!out?.length){try{out=await yahooDailyHistory(code)}catch{}}
      if(out?.length)historyCache[code]=out;
      return out||[];
    };
  }

  function drawIntraday(canvas,arr){
    if(!canvas)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const rect=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(20,Math.round((rect.width||canvas.clientWidth||320)*dpr)),h=Math.max(20,Math.round((rect.height||canvas.clientHeight||50)*dpr));
    if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;ctx.clearRect(0,0,w,h);
    const data=(arr||[]).filter(p=>sameTaipeiDay(Number(p.stamp))&&num(p.close)!=null).sort((a,b)=>a.stamp-b.stamp);
    if(data.length<2){ctx.fillStyle='#91a8c2';ctx.font=`${Math.round(11*dpr)}px sans-serif`;ctx.textAlign='center';ctx.fillText(seedDone.size?'即時線累積中':'盤中線載入中',w/2,h/2);ctx.textAlign='left';return false;}
    const vals=data.map(p=>num(p.close)),minStamp=data[0].stamp,maxStamp=data.at(-1).stamp,spanT=Math.max(1,maxStamp-minStamp);let lo=Math.min(...vals),hi=Math.max(...vals);if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*.08;hi+=pad;lo-=pad;
    const x=p=>dpr+(Number(p.stamp)-minStamp)/spanT*(w-2*dpr),y=v=>dpr+(hi-v)/(hi-lo)*(h-2*dpr);
    ctx.strokeStyle='rgba(120,173,255,.98)';ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.beginPath();data.forEach((p,i)=>{const xx=x(p),yy=y(num(p.close));if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});ctx.stroke();
    const last=data.at(-1);ctx.fillStyle='rgba(237,245,255,.98)';ctx.beginPath();ctx.arc(x(last),y(num(last.close)),Math.max(2.2,2.4*dpr),0,Math.PI*2);ctx.fill();return true;
  }

  function rowForDom(code){return [...document.querySelectorAll('#watch article.row')].find(r=>r.querySelector('.sym')?.textContent?.trim()===String(code))||null;}
  function ensureCanvas(row){
    let cv=row?.querySelector('canvas.spark');if(cv)return cv;
    const f=row?.querySelector('.sparkFallback');if(!f)return null;cv=document.createElement('canvas');cv.className='spark';f.replaceWith(cv);return cv;
  }
  function maskRow(code){
    const row=rowForDom(code);if(!row)return;row.dataset.liveState='loading';row.dataset.liveDate=todayKey();
    const p=row.querySelector('.price'),c=row.querySelector('.chg'),day=row.querySelector('.dayline'),meta=row.querySelector('.meta'),sn=row.querySelector('.scoreNum'),sl=row.querySelector('.scoreLabel');
    if(p)p.textContent='—';if(c){c.textContent='盤中載入中';c.className='chg flat'}
    if(day)day.textContent=`${todayKey().slice(0,4)}/${todayKey().slice(4,6)}/${todayKey().slice(6,8)}　盤中即時資料載入中`;
    if(meta)meta.innerHTML='<span>不使用昨日收盤冒充盤中</span><span>15 秒重試</span>';
    if(sn)sn.textContent='—';if(sl)sl.textContent='盤中資料待更新';
    const cv=ensureCanvas(row);if(cv)drawIntraday(cv,liveSeries.get(String(code))||[]);
  }
  function scoreAndPaint(row,code,q){
    try{
      const base=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{},hist=historyCache?.[code]||[],s=scoreStock(base,val,hist,q),sn=row.querySelector('.scoreNum'),sl=row.querySelector('.scoreLabel');
      if(sn){sn.textContent=s.total==null?'—':String(s.total);sn.className=`scoreNum ${scoreCls(s.total)}`}
      if(sl)sl.textContent=s.total==null?'資料不足':s.mode;
    }catch{}
  }
  function paintRow(code,q){
    const row=rowForDom(code);if(!row)return;if(!q?.live||!sameTaipeiDay(q.stamp)){maskRow(code);return;}
    row.dataset.liveState='live';row.dataset.liveDate=q.date;row.dataset.liveStamp=String(q.stamp);row.dataset.livePrice=String(q.price);
    const p=row.querySelector('.price'),chg=row.querySelector('.chg'),day=row.querySelector('.dayline'),meta=row.querySelector('.meta');
    if(p)p.textContent=fmt(q.price);if(chg){chg.textContent=`${q.change>0?'+':''}${fmt(q.change)}`;chg.className=`chg ${cssClass(q.change)}`}
    if(day)day.textContent=`${q.tradeTime||q.time.toLocaleTimeString('zh-TW')}　開 ${fmt(q.open)}　高 ${fmt(q.high)}　低 ${fmt(q.low)}　最新 ${fmt(q.price)}　量 ${fmt(q.volume,0)}`;
    if(meta)meta.innerHTML=`<span>${q.source}</span><span>成交 ${q.tradeTime||q.time.toLocaleTimeString('zh-TW')}</span>`;
    const cv=ensureCanvas(row);if(cv)drawIntraday(cv,liveSeries.get(String(code))||[]);scoreAndPaint(row,code,q);
  }
  function paintTaiex(){
    const v=document.getElementById('taiex'),c=document.getElementById('taiexChg');
    if(!lastTaiex||!sameTaipeiDay(lastTaiex.stamp)){if(inMarketWindow()){if(v)v.textContent='—';if(c){c.textContent='盤中即時指數載入中';c.className='s muted'}}return;}
    if(v)v.textContent=fmt(lastTaiex.price,2);if(c){c.textContent=`${lastTaiex.change>0?'+':''}${fmt(lastTaiex.change,2)}｜TWSE 盤中即時 ${lastTaiex.timeText||lastTaiex.time.toLocaleTimeString('zh-TW')}`;c.className=`s ${cssClass(lastTaiex.change)}`}
  }
  function paintDetail(){
    try{
      const code=String(active||'');if(!code||!document.getElementById('sheet')?.classList.contains('show'))return;const q=liveQuotes.get(code),set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
      const title=document.querySelector('#bigChart')?.closest('.card')?.querySelector('h3');if(title)title.textContent='今日盤中即時走勢';
      if(!q?.live||!sameTaipeiDay(q.stamp)){
        set('dTime','盤中即時資料載入中｜不顯示昨日收盤');set('dPrice','—');set('dOpen','—');set('dChange','—');set('dRange','— / —');set('dVolume','—');
        const cv=document.getElementById('bigChart');if(cv)drawIntraday(cv,liveSeries.get(code)||[]);set('chartMsg','今日盤中即時線載入中；不使用昨日收盤線。');return;
      }
      set('dTime',`${q.source}｜${q.tradeTime}`);set('dPrice',fmt(q.price));set('dOpen',fmt(q.open));set('dRange',`${fmt(q.high)} / ${fmt(q.low)}`);set('dVolume',fmt(q.volume,0));
      const ch=document.getElementById('dChange');if(ch){ch.textContent=`${q.change>0?'+':''}${fmt(q.change)}`;ch.className=`v ${cssClass(q.change)}`}
      const arr=liveSeries.get(code)||[],cv=document.getElementById('bigChart');if(cv)drawIntraday(cv,arr);
      if(arr.length>=2){const first=taipeiParts(new Date(arr[0].stamp)),last=taipeiParts(new Date(arr.at(-1).stamp));set('chartMsg',`今日盤中即時走勢｜${String(first.hour).padStart(2,'0')}:${String(first.minute).padStart(2,'0')}～${String(last.hour).padStart(2,'0')}:${String(last.minute).padStart(2,'0')}｜最新端為 TWSE MIS 即時成交`)}
    }catch{}
  }
  function paintStatus(ok){
    const badge=document.getElementById('liveBadge'),status=document.getElementById('marketStatus'),time=document.getElementById('marketTime'),pill=document.getElementById('refreshPill');
    if(pill)pill.textContent=`盤中即時：15 秒｜v${VERSION}`;
    if(!inMarketWindow())return;
    if(badge){badge.textContent=ok?`盤中即時 v${VERSION}`:`即時來源重試中 v${VERSION}`;badge.className=ok?'liveBadge ok':'liveBadge warn'}
    if(status)status.textContent=ok?'盤中即時':'即時來源重試';
    if(time)time.textContent=`輪詢 ${new Date(lastPollAt||Date.now()).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
  }
  function paintAll(){
    if(!inMarketWindow())return;paintTaiex();for(const code of watchCodes()){const q=liveQuotes.get(code);if(q)paintRow(code,q);else maskRow(code)}paintDetail();paintStatus(lastPollOkAt>0);
  }

  if(baseQuote){
    quote=async function(code,allowNetwork=true){
      code=String(code);if(inMarketWindow())return liveQuotes.get(code)||placeholder(code);
      return baseQuote(code,allowNetwork);
    };
  }
  if(baseRender){
    render=async function(allowNetwork=false){const out=await baseRender(inMarketWindow()?false:allowNetwork);if(inMarketWindow())paintAll();return out;};
  }
  if(baseShow){
    show=async function(code,opts={}){
      code=String(code);if(inMarketWindow())quoteCache[code]=liveQuotes.get(code)||placeholder(code);
      const out=await baseShow(code,opts);if(inMarketWindow())paintDetail();return out;
    };
  }

  function installObserver(){
    const watch=document.getElementById('watch');if(!watch||observer)return;
    observer=new MutationObserver(()=>{if(inMarketWindow())queueMicrotask(paintAll)});observer.observe(watch,{childList:true,subtree:false});
  }
  function debugState(){
    const stocks={};for(const code of watchCodes()){const q=liveQuotes.get(code),arr=liveSeries.get(code)||[];stocks[code]={price:q?.price??null,date:q?.date??null,tradeTime:q?.tradeTime??null,stamp:q?.stamp??null,source:q?.source??null,seriesPoints:arr.length,seriesLastStamp:arr.at(-1)?.stamp??null,domState:rowForDom(code)?.dataset?.liveState||null,domPrice:rowForDom(code)?.dataset?.livePrice||null};}
    window.__TW_LIVE_V090__={version:VERSION,marketWindow:inMarketWindow(),cycle,lastPollAt,lastPollOkAt,taiex:lastTaiex?{price:lastTaiex.price,date:lastTaiex.date,time:lastTaiex.timeText,stamp:lastTaiex.stamp}:null,stocks};
  }
  async function poll(){
    if(pollBusy)return;pollBusy=true;lastPollAt=Date.now();cycle++;
    try{
      const codes=watchCodes(),items=await fetchMis(codes),parsed=parsePayload(items);let accepted=0;
      if(parsed.taiex&&(!lastTaiex||parsed.taiex.stamp>=lastTaiex.stamp)){lastTaiex=parsed.taiex;accepted++}
      for(const [code,q] of parsed.map){if(remember(q))accepted++}
      if(accepted>0)lastPollOkAt=Date.now();persistState();seedAll();paintAll();debugState();
    }catch(e){paintAll();debugState();window.__TW_LIVE_V090__.error=String(e?.message||e)}finally{pollBusy=false}
  }
  function start(){
    loadState();installObserver();
    if(inMarketWindow()){
      const t=document.querySelector('#bigChart')?.closest('.card')?.querySelector('h3');if(t)t.textContent='今日盤中即時走勢';
      paintAll();seedAll();poll();setInterval(poll,INTERVAL);
    }else{
      const pill=document.getElementById('refreshPill');if(pill)pill.textContent=`休市｜v${VERSION}`;
    }
    window.addEventListener('focus',()=>{if(inMarketWindow())poll()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&inMarketWindow())poll()});debugState();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
