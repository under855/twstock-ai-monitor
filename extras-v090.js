(() => {
  'use strict';
  const VERSION='0.9.4';

  function editDistance(a,b,max=2){
    a=String(a||'');b=String(b||'');
    if(Math.abs(a.length-b.length)>max)return max+1;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const cur=[i];let rowMin=i;
      for(let j=1;j<=b.length;j++){
        const v=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
        cur[j]=v;rowMin=Math.min(rowMin,v);
      }
      if(rowMin>max)return max+1;
      prev=cur;
    }
    return prev[b.length];
  }

  function semanticCodes(raw,needle){
    const codes=[],text=String(raw||'').toLowerCase();
    const hasJapan=text.includes('日本')||needle.includes('日本');
    const hasRealEstate=['地產','房地產','不動產','reit','reits'].some(k=>text.includes(k)||needle.includes(k));
    if(hasJapan&&hasRealEstate)codes.push('009817');
    const exact={'日本地產':'009817','日本房地產':'009817','日本不動產':'009817','日本reit':'009817','日本reits':'009817','日reit':'009817','日reits':'009817','日本地產etf':'009817','日本房地產etf':'009817','日本不動產etf':'009817'};
    if(exact[String(needle||'')])codes.push(exact[String(needle||'')]);
    return [...new Set(codes)];
  }

  function installFuzzySearch(){
    if(typeof searchUniverse!=='function'||typeof normalizeSearchText!=='function'||typeof universeMap==='undefined')return false;
    const baseSearch=searchUniverse;
    searchUniverse=function(term){
      const t=String(term||'').trim();if(!t)return [];
      const needle=normalizeSearchText(t),normal=baseSearch(t),seen=new Set(normal.map(x=>x.code)),extra=[];
      for(const code of semanticCodes(t,needle)){
        const x=universeMap.get(code);if(x&&!seen.has(code)){extra.push({...x,_fuzzyReason:'概念相符',_fuzzyRank:10});seen.add(code)}
      }
      if(needle&&!/^\d+$/.test(needle)){
        const maxDist=needle.length<=4?1:2;
        for(const x of universeMap.values()){
          if(seen.has(x.code))continue;const name=normalizeSearchText(x.name);if(!name)continue;
          const d=editDistance(needle,name,maxDist);if(d<=maxDist){extra.push({...x,_fuzzyReason:'名稱近似',_fuzzyRank:20+d});seen.add(x.code)}
        }
      }
      extra.sort((a,b)=>(a._fuzzyRank||99)-(b._fuzzyRank||99)||a.code.localeCompare(b.code));
      return [...normal,...extra].slice(0,30);
    };
    return true;
  }

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeUrl(u){try{const x=new URL(String(u||''));return /^https?:$/.test(x.protocol)?x.href:'#';}catch{return '#';}}
  function renderNewsItems(items,state,box){
    box.innerHTML='';if(!items.length){state.textContent='最近一個月暫無可讀取新聞。';return false;}state.textContent='';
    for(const it of items.slice(0,4)){
      const d=document.createElement('div');d.className='event';const publisher=it.publisher?`｜${esc(it.publisher)}`:'',date=it.time?new Date(it.time).toLocaleString('zh-TW'):'';
      d.innerHTML=`<div class="tag">新聞${publisher}</div><a target="_blank" rel="noopener" href="${esc(safeUrl(it.link))}">${esc(it.title||'新聞')}</a>${date?`<div class="date">${esc(date)}</div>`:''}`;box.appendChild(d);
    }
    return true;
  }
  async function fetchJson(url,timeout=8000){
    const ac=new AbortController(),t=setTimeout(()=>ac.abort(),timeout);
    try{const r=await fetch(url,{cache:'no-store',signal:ac.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}
  }
  const NEWS_FEEDS=[
    {publisher:'鉅亨網',url:'https://news.cnyes.com/rss/v1/news/category/tw_stock'},
    {publisher:'MoneyDJ',url:'https://www.moneydj.com/KMDJ/RssCenter.aspx?svc=NR&fno=1&arg=MB06'},
    {publisher:'中央社',url:'https://feeds.feedburner.com/rsscna/finance'}
  ];
  const TRUSTED_GOOGLE_PUBLISHERS=['鉅亨網','MoneyDJ','中央社','經濟日報','工商時報','自由財經','聯合新聞網'];
  const normNews=s=>String(s||'').toLowerCase().replace(/[\s　()（）\-—_·,，.。:：/／]/g,'');
  function relevantHeadline(title,code,name){
    const t=normNews(title),c=normNews(code),n=normNews(name);
    return (!!c&&t.includes(c))||((n&&n.length>=2)&&t.includes(n));
  }
  function parseXmlFeed(text,publisher){
    const xml=new DOMParser().parseFromString(text,'text/xml'),cutoff=Date.now()-30*86400000,out=[];
    for(const it of [...xml.querySelectorAll('item')]){
      const title=it.querySelector('title')?.textContent?.trim()||'',link=it.querySelector('link')?.textContent?.trim()||'',raw=it.querySelector('pubDate')?.textContent||it.querySelector('date')?.textContent||'',ts=Date.parse(raw);
      if(!title||!link)continue;if(Number.isFinite(ts)&&ts<cutoff)continue;
      out.push({title,link,publisher,time:Number.isFinite(ts)?ts:null});
    }
    return out;
  }
  async function fetchPublisherFeed(feed){
    const proxied=`https://proxy.cors.dev/${feed.url}`;
    try{
      const ac=new AbortController(),t=setTimeout(()=>ac.abort(),7000);
      try{const r=await fetch(proxied,{cache:'no-store',signal:ac.signal});if(r.ok){const text=await r.text(),items=parseXmlFeed(text,feed.publisher);if(items.length)return items}}finally{clearTimeout(t)}
    }catch{}
    try{
      const j=await fetchJson(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`,7000);
      if(j?.status==='ok')return (j.items||[]).map(x=>({title:String(x?.title||'').trim(),link:String(x?.link||'').trim(),publisher:feed.publisher,time:Date.parse(x?.pubDate||'')})).filter(x=>x.title&&x.link);
    }catch{}
    return [];
  }
  async function trustedGoogleFallback(code,name){
    const query=encodeURIComponent(`${name||code} ${code} 股票 when:30d`),rss=`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    try{
      const j=await fetchJson(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`,8000);if(j?.status!=='ok')return [];
      const out=[];
      for(const x of (j.items||[])){
        let title=String(x?.title||'').trim(),publisher='';const m=title.match(/\s+-\s+([^\-]+)$/);if(m){publisher=m[1].trim();title=title.slice(0,m.index).trim()}
        if(!TRUSTED_GOOGLE_PUBLISHERS.some(n=>publisher.includes(n)))continue;
        const ts=Date.parse(x?.pubDate||'');if(Number.isFinite(ts)&&Date.now()-ts>30*86400000)continue;
        if(!title||!x?.link)continue;out.push({title,link:String(x.link),publisher,time:Number.isFinite(ts)?ts:null});
      }
      return out;
    }catch{return []}
  }
  async function cachedSiteNews(code){
    try{
      const j=await fetchJson(`./data/news.json?_=${Date.now()}`,5000);
      const xs=j?.stocks?.[String(code)];
      return Array.isArray(xs)?xs.filter(x=>x&&x.title&&x.link):[];
    }catch{return []}
  }

  function installNews(){
    if(typeof news!=='function')return false;
    news=async function(code,name){
      const box=document.getElementById('news'),state=document.getElementById('newsState');if(!box||!state)return;
      box.innerHTML='';state.textContent='載入可信來源近期新聞…';
      const cached=await cachedSiteNews(code);
      if(cached.length){cached.sort((a,b)=>(b.time||0)-(a.time||0));renderNewsItems(cached,state,box);return}
      const settled=await Promise.allSettled(NEWS_FEEDS.map(fetchPublisherFeed)),seen=new Set(),items=[];
      for(const r of settled){if(r.status!=='fulfilled')continue;for(const it of r.value){if(!relevantHeadline(it.title,code,name))continue;const k=normNews(it.title);if(!k||seen.has(k))continue;seen.add(k);items.push(it)}}
      if(items.length<4){for(const it of await googleTrustedDirect(code,name)){const k=normNews(it.title);if(!k||seen.has(k))continue;seen.add(k);items.push(it)}}
      if(items.length<4){for(const it of await trustedGoogleFallback(code,name)){const k=normNews(it.title);if(!k||seen.has(k))continue;seen.add(k);items.push(it)}}
      items.sort((a,b)=>(b.time||0)-(a.time||0));
      if(renderNewsItems(items,state,box))return;
      const q=encodeURIComponent(`${name||code} ${code} 股票`);state.innerHTML=`鉅亨網、MoneyDJ、中央社目前沒有讀到近一個月直接相關標題。<br><a style="color:#a9cbff" target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant">開啟可信來源新聞搜尋</a>`;
    };
    return true;
  }

  function stockAliases(code,name){
    const out=[String(code||''),String(name||'').trim()].filter(Boolean);
    const n=String(name||'').trim();
    for(const suffix of ['投控','控股','股份有限公司','公司'])if(n.endsWith(suffix)&&n.length>suffix.length+1)out.push(n.slice(0,-suffix.length));
    return [...new Set(out.filter(x=>x.length>=2||/^\d+$/.test(x)))];
  }

  async function googleTrustedDirect(code,name){
    const aliases=stockAliases(code,name),query=encodeURIComponent(`${aliases.join(' OR ')} 股票 when:30d`),rss=`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    for(const url of [`https://proxy.cors.dev/${rss}`,`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`]){
      try{
        if(url.includes('rss2json')){
          const j=await fetchJson(url,8000);if(j?.status!=='ok')continue;
          return (j.items||[]).map(x=>{let title=String(x?.title||'').trim(),publisher='';const m=title.match(/\s+-\s+([^\-]+)$/);if(m){publisher=m[1].trim();title=title.slice(0,m.index).trim()}return {title,link:String(x?.link||''),publisher,time:Date.parse(x?.pubDate||'')}}).filter(x=>x.title&&x.link&&TRUSTED_GOOGLE_PUBLISHERS.some(n=>x.publisher.includes(n)));
        }
        const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
        try{const r=await fetch(url,{cache:'no-store',signal:ac.signal});if(!r.ok)continue;const text=await r.text(),xml=new DOMParser().parseFromString(text,'text/xml'),out=[];for(const it of [...xml.querySelectorAll('item')]){let title=it.querySelector('title')?.textContent?.trim()||'',publisher=it.querySelector('source')?.textContent?.trim()||'';const link=it.querySelector('link')?.textContent?.trim()||'',ts=Date.parse(it.querySelector('pubDate')?.textContent||'');if(!publisher){const m=title.match(/\s+-\s+([^\-]+)$/);if(m){publisher=m[1].trim();title=title.slice(0,m.index).trim()}}if(title&&link&&TRUSTED_GOOGLE_PUBLISHERS.some(n=>publisher.includes(n)))out.push({title,link,publisher,time:Number.isFinite(ts)?ts:null});}if(out.length)return out;}finally{clearTimeout(t)}
      }catch{}
    }
    return [];
  }

  function chartStamp(v){
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
  function hmTw(v){return new Date(v).toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false})}
  function twIsoDay(){return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})}
  function livePointFor(code){
    try{
      const x=window.__TW_LIVE_V091__?.stocks?.[String(code)],today=twIsoDay().replaceAll('-','');
      if(!x||x.date!==today||!Number.isFinite(Number(x.price)))return null;
      const raw=String(x.tradeTime||'').slice(0,8),hm=raw.slice(0,5);if(hm<'09:00'||hm>'13:30')return null;
      const ms=Date.parse(`${twIsoDay()}T${raw||hm+':00'}+08:00`);if(!Number.isFinite(ms))return null;
      return {time:new Date(ms),close:Number(x.price)};
    }catch{return null}
  }
  function misSeriesFor(code){
    try{
      const day=twIsoDay().replaceAll('-',''),obj=JSON.parse(localStorage.getItem(`tw_live091_series_${day}`)||'{}'),raw=Array.isArray(obj?.[String(code)])?obj[String(code)]:[],byStamp=new Map();
      for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS')})}
      return [...byStamp.values()].sort((a,b)=>a.time-b.time);
    }catch{return []}
  }
  function mergedTodayPoints(code,points){
    const base=chronologicalPoints(points),baseDay=base.length?new Date(base[0]?.time??base[0]?.stamp).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):'',today=twIsoDay(),byStamp=new Map();
    for(const x of base){const d=new Date(x?.time??x?.stamp),stamp=d.getTime(),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS 官方留存')})}
    if(!baseDay||baseDay===today){for(const x of misSeriesFor(code))byStamp.set(x.time.getTime(),x);const lp=livePointFor(code);if(lp)byStamp.set(lp.time.getTime(),{...lp,official:true,source:'TWSE MIS 最新成交'})}
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
  function drawFixedIntraday(canvas,points,compact=false,change=null){
    if(!canvas||!Array.isArray(points)||points.length<2)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),W=Math.max(40,Math.round((r.width||620)*dpr)),H=Math.max(28,Math.round((r.height||(compact?50:220))*dpr));if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;ctx.clearRect(0,0,W,H);
    const d=chronologicalPoints(points).filter(x=>Number.isFinite(Number(x.close)));if(d.length<2)return false;
    let lo=Math.min(...d.map(x=>Number(x.close))),hi=Math.max(...d.map(x=>Number(x.close)));if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*.08;hi+=pad;lo-=pad;
    const p={l:compact?4*dpr:44*dpr,r:compact?4*dpr:12*dpr,t:6*dpr,b:compact?4*dpr:24*dpr};
    const firstDate=d[0]?.time instanceof Date?d[0].time:new Date(d[0]?.time);const day=Number.isFinite(firstDate?.getTime?.())?firstDate.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):twIsoDay(),t0=Date.parse(`${day}T09:00:00+08:00`),t1=Date.parse(`${day}T13:30:00+08:00`),span=t1-t0;
    const X=x=>p.l+Math.max(0,Math.min(1,(new Date(x.time).getTime()-t0)/span))*(W-p.l-p.r),Y=v=>p.t+(H-p.t-p.b)*(hi-Number(v))/(hi-lo);
    if(!compact){ctx.strokeStyle='#1e3550';ctx.fillStyle='#91a8c2';ctx.font=`${11*dpr}px sans-serif`;ctx.lineWidth=Math.max(1,dpr);for(let k=0;k<4;k++){const y=p.t+(H-p.t-p.b)*k/3;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();ctx.fillText((hi-(hi-lo)*k/3).toFixed(2),3*dpr,y+4*dpr)}for(const [label,ratio] of [['09:00',0],['11:15',.5],['13:30',1]]){const x=p.l+(W-p.l-p.r)*ratio;ctx.fillText(label,Math.max(2*dpr,Math.min(W-42*dpr,x-14*dpr)),H-6*dpr)}}
    const delta=Number.isFinite(Number(change))?Number(change):0,trend=delta>0?'up':delta<0?'down':'flat';ctx.strokeStyle=trend==='up'?'#ff7272':trend==='down'?'#64d69a':'#d2dceb';canvas.dataset.trendColor=trend;canvas.dataset.trendChange=String(delta);ctx.lineWidth=Math.max(1.5*dpr,compact?1.8*dpr:2.2*dpr);ctx.beginPath();d.forEach((x,i)=>{const xx=X(x),yy=Y(x.close);if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)});ctx.stroke();return true;
  }
  function sessionChangeFor(code){
    try{
      const row=rowFor(String(code)),txt=row?.querySelector('.chg')?.textContent?.trim()||'';
      const m=txt.match(/[-+]?\d+(?:\.\d+)?/);if(m){const n=Number(m[0]);if(Number.isFinite(n))return n}
    }catch{}
    try{const n=Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.change);if(Number.isFinite(n))return n}catch{}
    return 0;
  }
  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas)return false;const merged=mergedTodayPoints(code,Array.isArray(points)?points:[]),change=sessionChangeFor(code);
    if(merged.length<2||!drawFixedIntraday(canvas,merged,compact,change))return false;
    const vals=merged.map(x=>Number(x.close)),min=Math.min(...vals),max=Math.max(...vals),minI=vals.indexOf(min),maxI=vals.indexOf(max),firstHm=hmTw(merged[0].time),lastHm=hmTw(merged.at(-1).time);
    const fullStart=firstHm<='09:05';
    const sessionDate=new Date(merged[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});canvas.dataset.sessionDate=sessionDate;canvas.dataset.todayFull=fullStart?'1':'0';canvas.dataset.todayPoints=String(merged.length);canvas.dataset.todayOfficialPoints=String(merged.length);canvas.dataset.todayOfficialFirst=String(merged[0].time.getTime());canvas.dataset.todayOfficialLast=String(merged.at(-1).time.getTime());canvas.dataset.todayStart=firstHm;canvas.dataset.todayEnd=lastHm;canvas.dataset.todayMinTime=hmTw(merged[minI].time);canvas.dataset.todayMaxTime=hmTw(merged[maxI].time);return true;
  }

  const OFFICIAL_INTRADAY_URL='https://raw.githubusercontent.com/under855/twstock-ai-monitor/market-data/data/intraday/latest.json';
  let officialIntradayPayload=null,officialIntradayFetchedAt=0,officialIntradayPending=null;
  async function officialIntradayPayloadNow(force=false){
    if(!force&&officialIntradayPayload&&Date.now()-officialIntradayFetchedAt<60000)return officialIntradayPayload;
    if(officialIntradayPending)return await officialIntradayPending;
    officialIntradayPending=fetchJson(`${OFFICIAL_INTRADAY_URL}?_=${Date.now()}`,7000).then(j=>{officialIntradayPending=null;officialIntradayFetchedAt=Date.now();officialIntradayPayload=j;return j}).catch(()=>{officialIntradayPending=null;return null});
    return await officialIntradayPending;
  }
  async function officialLatestIntraday(code,force=false){
    const out=[],today=twIsoDay(),j=await officialIntradayPayloadNow(force),session=String(j?.date||''),raw=Array.isArray(j?.stocks?.[String(code)])?j.stocks[String(code)]:[];
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;out.push({time:d,close,official:true,source:'TWSE MIS 官方留存',sessionDate:session})}
    const local=misSeriesFor(code);
    if(session===today&&local.length){const by=new Map(out.map(x=>[x.time.getTime(),x]));for(const x of local)by.set(x.time.getTime(),x);return [...by.values()].sort((a,b)=>a.time-b.time)}
    if(out.length)return chronologicalPoints(out);
    return local;
  }

  const todayFallbackCache=new Map(),todayFallbackResolved=new Map();
  async function ensureTodayChartFor(code,force=false){
    const key=String(code),cached=todayFallbackResolved.get(key),now=Date.now();
    if(!force&&cached?.points&&now-cached.fetchedAt<60000){drawTodayPoints(key,cached.points,mainCanvasFor(key),true);return cached.points}
    if(todayFallbackCache.has(key))return await todayFallbackCache.get(key);
    const p=officialLatestIntraday(key,force).then(points=>{
      todayFallbackCache.delete(key);todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});const c=mainCanvasFor(key);drawTodayPoints(key,points,c,true);const r=rowFor(key),f=r?.querySelector('.sparkFallback');if(f&&c)f.replaceWith(c);return points;
    }).catch(()=>{todayFallbackCache.delete(key);const points=misSeriesFor(key);todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});drawTodayPoints(key,points,mainCanvasFor(key),true);return points});
    todayFallbackCache.set(key,p);return await p;
  }
  async function refreshTodayFallbackCharts(force=false){
    if(typeof watchlist!=='function')return false;const codes=[...new Set(watchlist().map(String))];await Promise.allSettled(codes.map(code=>ensureTodayChartFor(code,force)));return true;
  }

  function drawResolvedMainToday(code,canvas=null){
    const key=String(code),cached=todayFallbackResolved.get(key),points=cached?.points||misSeriesFor(key);
    return drawTodayPoints(key,points,canvas||mainCanvasFor(key),true);
  }
  window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);window.__TW_MAIN_SESSION_DATE__=(code)=>todayFallbackResolved.get(String(code))?.points?.length?new Date(todayFallbackResolved.get(String(code)).points[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):null;
  function drawResolvedDetailToday(code,canvas=null){
    const key=String(code),cached=todayFallbackResolved.get(key),points=cached?.points||misSeriesFor(key);
    return drawTodayPoints(key,points,canvas||document.getElementById('bigChart'),false);
  }
  function syncDetailFromMainRow(code){
    try{
      const r=rowFor(String(code));if(!r)return false;
      const set=(id,v)=>{const e=document.getElementById(id);if(e&&v!=null&&String(v).trim()!=='')e.textContent=String(v).trim()};
      const price=r.querySelector('.price')?.textContent?.trim(),chg=r.querySelector('.chg')?.textContent?.trim(),day=r.querySelector('.dayline')?.textContent?.trim()||'',meta=r.querySelector('.meta')?.textContent?.trim()||'';
      if(price&&price!=='—')set('dPrice',price);if(chg&&chg!=='行情載入中'){const e=document.getElementById('dChange');if(e){e.textContent=chg;e.className='v '+(chg.startsWith('+')?'up':chg.startsWith('-')?'down':'flat')}}
      const m=day.match(/開\s*([^\s]+)\s*高\s*([^\s]+)\s*低\s*([^\s]+)\s*(?:最新|收盤)\s*([^\s]+)\s*量\s*([^\s]+)/);
      if(m){set('dOpen',m[1]);set('dRange',`${m[2]} / ${m[3]}`);set('dPrice',m[4]);set('dVolume',m[5])}
      if(meta)set('dTime',meta.replace(/\s+/g,' '));
      return !!price;
    }catch{return false}
  }
  window.__TW_DRAW_DETAIL_TODAY__=(code,canvas)=>drawResolvedDetailToday(code,canvas);
  window.__TW_DETAIL_SESSION_DATE__=(code)=>todayFallbackResolved.get(String(code))?.points?.length?new Date(todayFallbackResolved.get(String(code)).points[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):null;
  window.__TW_SYNC_DETAIL_FROM_MAIN__=(code)=>syncDetailFromMainRow(code);

  let taiexTodayCache=null,taiexTodayFetchedAt=0;
  const TAIEX_MIS_KEY=()=>`tw_taiex_mis_series_${twIsoDay().replaceAll('-','')}`;
  let taiexMisSeries=[];
  function loadTaiexMisSeries(){
    try{const a=JSON.parse(localStorage.getItem(TAIEX_MIS_KEY())||'[]');taiexMisSeries=(Array.isArray(a)?a:[]).filter(x=>Number.isFinite(Number(x?.stamp))&&Number.isFinite(Number(x?.close))&&hmTw(Number(x.stamp))>='09:00'&&hmTw(Number(x.stamp))<='13:30').map(x=>({stamp:Number(x.stamp),close:Number(x.close)})).sort((a,b)=>a.stamp-b.stamp)}catch{taiexMisSeries=[]}
  }
  function captureTaiexMis(){
    try{const x=window.__TW_LIVE_V091__?.taiex,stamp=Number(x?.stamp),close=Number(x?.price);if(!Number.isFinite(stamp)||!Number.isFinite(close))return false;const hm=hmTw(stamp);if(hm<'09:00'||hm>'13:30')return false;const last=taiexMisSeries.at(-1);if(last&&stamp<=last.stamp)return false;taiexMisSeries.push({stamp,close});if(taiexMisSeries.length>1200)taiexMisSeries.splice(0,taiexMisSeries.length-1200);localStorage.setItem(TAIEX_MIS_KEY(),JSON.stringify(taiexMisSeries));return true}catch{return false}
  }
  function mergedTaiexPoints(points){
    const base=chronologicalPoints(points).map(x=>({time:new Date(x.time),close:Number(x.close),official:false})).filter(x=>Number.isFinite(x.close)&&hmTw(x.time)>='09:00'&&hmTw(x.time)<='13:30');
    if(!taiexMisSeries.length)return base;const first=taiexMisSeries[0].stamp,out=base.filter(x=>x.time.getTime()<first);out.push(...taiexMisSeries.map(x=>({time:new Date(x.stamp),close:x.close,official:true})));return chronologicalPoints(out)
  }
  loadTaiexMisSeries();
  async function latestOfficialTradeDate(){
    try{const j=await fetchJson(`./data/latest.json?_=${Date.now()}`,5000),d=String(j?.taiex?.date||'').replaceAll('/','-');if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d}catch{}return twIsoDay();
  }
  async function twseIndexFullSession(dateIso){
    try{const compact=String(dateIso||'').replaceAll('-',''),j=await officialJson(`https://www.twse.com.tw/exchangeReport/MI_5MINS_INDEX?response=json&date=${compact}`,12000),date=String(j?.date||compact),rows=Array.isArray(j?.data)?j.data:[],day=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,out=[];for(const r of rows){const hm=String(r?.[0]||'');const close=offNum(r?.[1]);if(!/^\d{2}:\d{2}:\d{2}$/.test(hm)||close==null||hm<'09:00:00'||hm>'13:30:00')continue;const ms=Date.parse(`${day}T${hm}+08:00`);if(Number.isFinite(ms))out.push({time:new Date(ms),close,official:true,source:'TWSE 每5秒指數官方資料'})}return out}catch{return []}
  }
  async function officialTaiexIntraday(force=false){
    const today=twIsoDay(),j=await officialIntradayPayloadNow(force),session=String(j?.date||''),raw=Array.isArray(j?.taiex)?j.taiex:[],byStamp=new Map();
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:'TWSE MIS 指數官方留存'})}
    if(session===today){for(const x of taiexMisSeries)byStamp.set(Number(x.stamp),{time:new Date(Number(x.stamp)),close:Number(x.close),official:true,source:'TWSE MIS 指數'})}
    let out=[...byStamp.values()].sort((a,b)=>a.time-b.time);
    if(out.length>=2)return out;
    const tradeDate=await latestOfficialTradeDate(),full=await twseIndexFullSession(tradeDate);return full.length>=2?full:out;
  }
  function drawTaiexTop(points){const c=document.getElementById('taiexChart'),merged=mergedTaiexPoints(points);if(!c||merged.length<2)return false;const txt=document.getElementById('taiexChg')?.textContent||'',m=txt.replaceAll(',','').match(/[+-]?\d+(?:\.\d+)?/),chg=m?Number(m[0]):null;if(!drawFixedIntraday(c,merged,true,chg))return false;const official=merged.filter(x=>x.official);c.dataset.todayFull='1';c.dataset.todayPoints=String(merged.length);c.dataset.todayOfficialPoints=String(official.length);c.dataset.todayOfficialFirst=official.length?String(official[0].time.getTime()):'';c.dataset.todayOfficialLast=official.length?String(official.at(-1).time.getTime()):'';c.dataset.todayStart=hmTw(merged[0].time);c.dataset.todayEnd=hmTw(merged.at(-1).time);const msg=document.getElementById('taiexChartMsg'),sessionDate=new Date(merged[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});c.dataset.sessionDate=sessionDate;if(msg)msg.textContent=sessionDate===twIsoDay()?`今日｜TWSE 官方 ${official.length||merged.length} 點`:`${sessionDate.replaceAll('-','/')} 最近交易日｜TWSE 官方`;return true}
  async function ensureTaiexTop(force=false){if(!force&&taiexTodayCache?.length>=2&&Date.now()-taiexTodayFetchedAt<300000)return drawTaiexTop(taiexTodayCache);const p=await officialTaiexIntraday(force);if(p.length>=2){taiexTodayCache=p;taiexTodayFetchedAt=Date.now();return drawTaiexTop(p)}const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent='最近交易日分時資料暫時無法取得';return false}
  function startTaiexTop(){setTimeout(()=>ensureTaiexTop(false),250);setTimeout(()=>ensureTaiexTop(false),1400);setInterval(()=>{captureTaiexMis();if(taiexTodayCache?.length>=2)drawTaiexTop(taiexTodayCache)},15000);setInterval(()=>ensureTaiexTop(true),300000);addEventListener('resize',()=>{if(taiexTodayCache?.length>=2)drawTaiexTop(taiexTodayCache)});return true}


  const offNum=v=>{if(v==null)return null;const n=Number(String(v).replaceAll(',','').replace('+','').trim());return Number.isFinite(n)?n:null};
  function rocYmd(v){const p=String(v||'').trim().replaceAll('-','/').split('/');if(p.length!==3)return '';const y=Number(p[0]);if(!Number.isFinite(y))return '';return `${y<1911?y+1911:y}/${String(Number(p[1])).padStart(2,'0')}/${String(Number(p[2])).padStart(2,'0')}`}
  function recentMonths(n=4){const [y0,m0]=twIsoDay().split('-').map(Number),out=[];let y=y0,m=m0;for(let i=0;i<n;i++){out.push([y,m]);m--;if(m<1){m=12;y--}}return out}
  async function officialJson(upstream,timeout=7000){
    try{return await fetchJson(upstream,timeout)}catch{}
    return await fetchJson(`https://proxy.cors.dev/${upstream}`,timeout);
  }
  async function officialDailyHistory(code){
    let market='';try{market=String(universeMap?.get?.(String(code))?.market||'')}catch{}const out=[];
    for(const [y,m] of recentMonths(4)){
      try{
        if(market==='TPEx'){
          const date=`${y}/${String(m).padStart(2,'0')}/01`,u=`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${encodeURIComponent(code)}&date=${encodeURIComponent(date)}&response=json`,j=await officialJson(u),rows=j?.tables?.[0]?.data||[];
          for(const x of rows){const close=offNum(x?.[6]);if(close==null)continue;out.push({date:rocYmd(x[0]),open:offNum(x[3]),high:offNum(x[4]),low:offNum(x[5]),close,change:offNum(x[7]),volume:offNum(x[1])});}
        }else{
          const ym=`${y}${String(m).padStart(2,'0')}01`,u=`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${ym}&stockNo=${encodeURIComponent(code)}`,j=await officialJson(u),rows=j?.data||[];
          for(const x of rows){const close=offNum(x?.[6]);if(close==null)continue;out.push({date:rocYmd(x[0]),open:offNum(x[3]),high:offNum(x[4]),low:offNum(x[5]),close,change:offNum(x[7]),volume:offNum(x[1])});}
        }
      }catch{}
    }
    return [...new Map(out.filter(x=>x.date).map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  async function loadHistoryFor(code){
    try{
      const key=String(code),cached=typeof historyCache!=='undefined'?historyCache[key]:null;
      if(Array.isArray(cached)&&cached.length>=2)return cached;
      const oh=await officialDailyHistory(key);
      if(oh.length>=2){try{historyCache[key]=oh}catch{}return oh}
    }catch{}
    return [];
  }
  function rowFor(code){return [...document.querySelectorAll('#watch article.row')].find(r=>r.querySelector('.sym')?.textContent?.trim()===String(code))||null}
  function priceFor(code){
    try{return quoteCache?.[String(code)]?.price??rowForCode?.(String(code))?.ClosingPrice??null}catch{return null}
  }
  function mainLivePoints(code){return Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.seriesPoints||0)}
  function enforceTodayOnlyMainCharts(){
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
    setTimeout(run,150);setTimeout(run,900);setTimeout(run,2500);setInterval(run,15000);setInterval(()=>refreshTodayFallbackCharts(true).catch(()=>{}),60000);return true;
  }

  const detailModeByCode=new Map();
  function ensureDetailChartTabs(code){
    const key=String(code),live=document.getElementById('bigChart');if(!live||typeof draw!=='function')return false;
    const card=live.closest('.card');if(!card)return false;
    const oldTitle=card.querySelector('h3');if(oldTitle)oldTitle.style.display='none';
    let displayTitle=card.querySelector('#detailChartDisplayTitle');if(!displayTitle){displayTitle=document.createElement('div');displayTitle.id='detailChartDisplayTitle';displayTitle.style.cssText='font-size:13px;font-weight:800;margin:0 0 8px';card.insertBefore(displayTitle,card.firstChild)}
    let tabs=card.querySelector('#detailChartTabs');if(!tabs){tabs=document.createElement('div');tabs.id='detailChartTabs';tabs.className='tabs';displayTitle.insertAdjacentElement('afterend',tabs)}
    let hist=card.querySelector('#historyChart');if(!hist){hist=document.createElement('canvas');hist.id='historyChart';hist.className='big';hist.width=820;hist.height=260;hist.style.display='none';live.insertAdjacentElement('afterend',hist)}
    let histMsg=card.querySelector('#historyChartMsg');if(!histMsg){histMsg=document.createElement('div');histMsg.id='historyChartMsg';histMsg.className='muted small';histMsg.style.display='none';hist.insertAdjacentElement('afterend',histMsg)}
    const modes=[['today','今日'],['5','5日'],['20','20日'],['60','60日']];
    tabs.innerHTML=modes.map(([m,l])=>`<button type="button" class="tab" data-chart-mode="${m}">${l}</button>`).join('');
    const apply=mode=>{
      detailModeByCode.set(key,mode);for(const b of tabs.querySelectorAll('.tab'))b.classList.toggle('active',b.dataset.chartMode===mode);
      const msg=document.getElementById('chartMsg');
      if(mode==='today'){live.style.display='block';hist.style.display='none';if(msg)msg.style.display='';histMsg.style.display='none';displayTitle.textContent='盤中／最近交易日走勢';return}
      const count=Number(mode),h=(historyCache?.[key]||[]).slice(-count);live.style.display='none';hist.style.display='block';if(msg)msg.style.display='none';histMsg.style.display='';displayTitle.textContent=`近 ${count} 個交易日走勢`;
      if(h.length>=2){draw(hist,h,false,priceFor(key));histMsg.textContent=`近 ${Math.min(count,h.length)} 個交易日｜歷史分析圖`}
      else histMsg.textContent='歷史資料不足，暫時無法繪製這個區間。';
    };
    for(const b of tabs.querySelectorAll('.tab'))b.addEventListener('click',()=>apply(b.dataset.chartMode));
    apply(detailModeByCode.get(key)||'today');return true;
  }
  function installDetailChartTabs(){
    if(typeof show!=='function')return false;
    const baseShow=show;
    show=async function(code,opts={}){
      const key=String(code),out=await baseShow(key,opts);ensureDetailChartTabs(key);
      loadHistoryFor(key).then(()=>{try{if(String(active||'')===key&&document.getElementById('sheet')?.classList.contains('show'))ensureDetailChartTabs(key)}catch{}}).catch(()=>{});
      ensureTodayChartFor(key).then(points=>{
        try{
          if(String(active||'')!==key||!document.getElementById('sheet')?.classList.contains('show')||points.length<2)return;
          const live=document.getElementById('bigChart');if(!live||typeof draw!=='function')return;
          if((detailModeByCode.get(key)||'today')!=='today')return;
          drawTodayPoints(key,points,live,false);
          const msg=document.getElementById('chartMsg'),sd=window.__TW_DETAIL_SESSION_DATE__?.(key)||'';window.__TW_SYNC_DETAIL_FROM_MAIN__?.(key);if(msg)msg.textContent=sd===twIsoDay()?`今日官方分時 ${mergedTodayPoints(key,points).length} 點｜TWSE MIS`:`${sd.replaceAll('-','/')} 最近交易日｜${mergedTodayPoints(key,points).length} 點`;
        }catch{}
      }).catch(()=>{});
      return out;
    };
    return true;
  }

  function limitDividendCards(){
    const box=document.getElementById('dividendEvents');if(!box)return;
    [...box.querySelectorAll(':scope > .event')].slice(3).forEach(x=>x.remove());
  }
  const observer=new MutationObserver(limitDividendCards);
  function startDividendLimit(){const box=document.getElementById('dividendEvents');if(!box)return false;observer.observe(box,{childList:true});limitDividendCards();return true;}

  async function refreshWatchHistoryAndScores(){
    if(typeof watchlist!=='function'||typeof render!=='function')return false;
    const codes=[...new Set(watchlist().map(String))];
    await Promise.allSettled(codes.map(loadHistoryFor));
    try{await render(false)}catch{}
    return codes.some(code=>Array.isArray(historyCache?.[code])&&historyCache[code].length>=2);
  }

  function boot(){
    startTaiexTop();
    if(!installChronologicalDraw())setTimeout(installChronologicalDraw,0);
    if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
    if(!installNews())setTimeout(installNews,0);
    if(!installDetailChartTabs())setTimeout(installDetailChartTabs,0);
    refreshWatchHistoryAndScores().then(()=>refreshTodayFallbackCharts(true)).catch(()=>{});
    if(!startDividendLimit()){const t=setInterval(()=>{if(startDividendLimit())clearInterval(t)},250);setTimeout(()=>clearInterval(t),10000)}
    window.__TW_EXTRAS_V090__={ok:true,version:VERSION};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
