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

  async function yahooTodayIntraday(code){
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

  async function yahooDailyHistory(code){
    let market='';try{market=String(universeMap?.get?.(String(code))?.market||'')}catch{}
    const symbols=market==='TPEx'?[`${code}.TWO`]:market==='TWSE'?[`${code}.TW`]:[`${code}.TW`,`${code}.TWO`];
    for(const symbol of symbols){
      const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false&_=${Date.now()}`;
      for(const url of [`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`]){
        try{
          const j=await fetchJson(url,7000),r=j?.chart?.result?.[0],ts=r?.timestamp||[],q=r?.indicators?.quote?.[0]||{},out=[];
          for(let i=0;i<ts.length;i++){
            const close=Number(q.close?.[i]);if(!Number.isFinite(close))continue;
            const d=new Date(Number(ts[i])*1000),date=d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}).replaceAll('-','/');
            const n=v=>Number.isFinite(Number(v))?Number(v):null;
            out.push({date,open:n(q.open?.[i]),high:n(q.high?.[i]),low:n(q.low?.[i]),close,change:null,volume:n(q.volume?.[i])});
          }
          if(out.length>=2)return out;
        }catch{}
      }
    }
    return [];
  }
  async function loadHistoryFor(code){
    try{
      const key=String(code),cached=typeof historyCache!=='undefined'?historyCache[key]:null;
      if(Array.isArray(cached)&&cached.length>=2)return cached;
      if(typeof history==='function'){
        const h=await history(key);
        if(Array.isArray(h)&&h.length>=2)return h;
      }
      const yh=await yahooDailyHistory(key);
      if(yh.length>=2){try{historyCache[key]=yh}catch{}return yh}
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
      if(mode==='today'){live.style.display='block';hist.style.display='none';if(msg)msg.style.display='';histMsg.style.display='none';displayTitle.textContent='今日盤中即時走勢';return}
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
          draw(live,points.map(x=>({date:x.time,close:x.close})),false,priceFor(key));
          const msg=document.getElementById('chartMsg');if(msg)msg.textContent=`今日 ${points.length} 個 5 分鐘資料點｜分時備援走勢`;
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
    if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
    if(!installNews())setTimeout(installNews,0);
    if(!installDetailChartTabs())setTimeout(installDetailChartTabs,0);
    refreshWatchHistoryAndScores().then(()=>refreshTodayFallbackCharts()).catch(()=>{});
    if(!startDividendLimit()){const t=setInterval(()=>{if(startDividendLimit())clearInterval(t)},250);setTimeout(()=>clearInterval(t),10000)}
    window.__TW_EXTRAS_V090__={ok:true,version:VERSION};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
