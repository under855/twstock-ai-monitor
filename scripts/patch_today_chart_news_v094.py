from pathlib import Path
import re

p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')

news_new=r'''  const NEWS_FEEDS=[
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
  function installNews(){
    if(typeof news!=='function')return false;
    news=async function(code,name){
      const box=document.getElementById('news'),state=document.getElementById('newsState');if(!box||!state)return;
      box.innerHTML='';state.textContent='載入可信來源近期新聞…';
      const settled=await Promise.allSettled(NEWS_FEEDS.map(fetchPublisherFeed)),seen=new Set(),items=[];
      for(const r of settled){if(r.status!=='fulfilled')continue;for(const it of r.value){if(!relevantHeadline(it.title,code,name))continue;const k=normNews(it.title);if(!k||seen.has(k))continue;seen.add(k);items.push(it)}}
      if(items.length<4){for(const it of await trustedGoogleFallback(code,name)){const k=normNews(it.title);if(!k||seen.has(k))continue;seen.add(k);items.push(it)}}
      items.sort((a,b)=>(b.time||0)-(a.time||0));
      if(renderNewsItems(items,state,box))return;
      const q=encodeURIComponent(`${name||code} ${code} 股票`);state.innerHTML=`鉅亨網、MoneyDJ、中央社目前沒有讀到近一個月直接相關標題。<br><a style="color:#a9cbff" target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant">開啟可信來源新聞搜尋</a>`;
    };
    return true;
  }

'''
pat_news=re.compile(r"  async function yahooStockNews\(code,name\)\{.*?(?=  async function yahooDailyHistory\(code\))",re.S)
s,n=pat_news.subn(lambda m: news_new,s)
if n!=1: raise SystemExit(f'news block replace count={n}')

charts_new=r'''  function mainLivePoints(code){return Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.seriesPoints||0)}
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
    const modes=[['today','今日'],['5','5日'],['20','20日'],['60','60日']];
    tabs.innerHTML=modes.map(([m,l])=>`<button type="button" class="tab" data-chart-mode="${m}">${l}</button>`).join('');
    const apply=mode=>{
      detailModeByCode.set(key,mode);for(const b of tabs.querySelectorAll('.tab'))b.classList.toggle('active',b.dataset.chartMode===mode);
      const msg=document.getElementById('chartMsg');
      if(mode==='today'){live.style.display='block';hist.style.display='none';displayTitle.textContent='今日盤中即時走勢';return}
      const count=Number(mode),h=(historyCache?.[key]||[]).slice(-count);live.style.display='none';hist.style.display='block';displayTitle.textContent=`近 ${count} 個交易日走勢`;
      if(h.length>=2){draw(hist,h,false,priceFor(key));if(msg)msg.textContent=`近 ${Math.min(count,h.length)} 個交易日｜歷史分析圖`}
      else if(msg)msg.textContent='歷史資料不足，暫時無法繪製這個區間。';
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
      return out;
    };
    return true;
  }

'''
pat_charts=re.compile(r"  function paintHistoryCanvas\(code,h\)\{.*?(?=  function limitDividendCards\(\))",re.S)
s,n=pat_charts.subn(lambda m: charts_new,s)
if n!=1: raise SystemExit(f'chart block replace count={n}')

s=s.replace("    if(!installDetailHistory())setTimeout(installDetailHistory,0);\n    startHistoryCharts();", "    if(!installDetailChartTabs())setTimeout(installDetailChartTabs,0);\n    startTodayOnlyMainCharts();")
if 'installDetailHistory' in s or 'startHistoryCharts' in s: raise SystemExit('old history UI hooks remain')
if 'yahooStockNews' in s or 'googleRssNews' in s: raise SystemExit('old news hooks remain')

p.write_text(s,encoding='utf-8')
print('patched extras-v090.js safely')
