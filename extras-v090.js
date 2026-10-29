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
  async function yahooStockNews(code,name){
    const queries=[String(name||'').trim(),String(code||'').trim()].filter(Boolean),seen=new Set(),out=[];
    for(const q of queries){
      const upstream=`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=10&enableFuzzyQuery=false&_=${Date.now()}`;
      for(const url of [`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`]){
        try{
          const j=await fetchJson(url);
          for(const x of (j?.news||[])){
            const title=String(x?.title||'').trim(),link=String(x?.link||'').trim(),ts=Number(x?.providerPublishTime||0)*1000;
            if(!title||!link||!Number.isFinite(ts)||ts<=0||Date.now()-ts>30*86400000)continue;
            const key=title.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({title,link,publisher:String(x?.publisher||''),time:ts});
          }
          if(out.length>=4)break;
        }catch{}
      }
      if(out.length>=4)break;
    }
    return out.sort((a,b)=>b.time-a.time).slice(0,4);
  }
  async function googleRssNews(code,name){
    const query=encodeURIComponent(`${name||code} ${code} 股票 when:30d`),rss=`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    for(const url of [`https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`,`https://proxy.cors.dev/${rss}`]){
      try{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;const text=await r.text();
        const xml=new DOMParser().parseFromString(text,'text/xml'),cutoff=Date.now()-30*86400000,out=[];
        for(const it of [...xml.querySelectorAll('item')]){
          const title=it.querySelector('title')?.textContent?.trim()||'',link=it.querySelector('link')?.textContent?.trim()||'',ts=Date.parse(it.querySelector('pubDate')?.textContent||'');
          if(!title||!link||!Number.isFinite(ts)||ts<cutoff)continue;out.push({title,link,publisher:'Google News',time:ts});if(out.length>=4)break;
        }
        if(out.length)return out;
      }catch{}
    }
    return [];
  }
  function installNews(){
    if(typeof news!=='function')return false;
    news=async function(code,name){
      const box=document.getElementById('news'),state=document.getElementById('newsState');if(!box||!state)return;
      box.innerHTML='';state.textContent='載入最近一個月新聞…';let items=[];
      try{items=await yahooStockNews(code,name)}catch{}if(!items.length){try{items=await googleRssNews(code,name)}catch{}}
      if(renderNewsItems(items,state,box))return;
      const q=encodeURIComponent(`${name||code} ${code} 股票`);state.innerHTML=`新聞來源暫時無法直接讀取。<br><a style="color:#a9cbff" target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant">開啟 Google 新聞搜尋</a>`;
    };
    return true;
  }

  function limitDividendCards(){
    const box=document.getElementById('dividendEvents');if(!box)return;
    [...box.querySelectorAll(':scope > .event')].slice(3).forEach(x=>x.remove());
  }
  const observer=new MutationObserver(limitDividendCards);
  function startDividendLimit(){const box=document.getElementById('dividendEvents');if(!box)return false;observer.observe(box,{childList:true});limitDividendCards();return true;}

  function boot(){
    if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
    if(!installNews())setTimeout(installNews,0);
    if(!startDividendLimit()){const t=setInterval(()=>{if(startDividendLimit())clearInterval(t)},250);setTimeout(()=>clearInterval(t),10000)}
    window.__TW_EXTRAS_V090__={ok:true,version:VERSION};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
