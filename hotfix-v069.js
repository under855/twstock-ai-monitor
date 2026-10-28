(() => {
  async function loadLatestExtras(){
    try{
      const r=await fetch(`./data/latest.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`latest ${r.status}`);
      const j=await r.json();
      const t=j?.taiex;
      if(t&&t.close!=null){
        const ch=Number(t.change||0);
        const taiex=document.getElementById('taiex');
        const taiexChg=document.getElementById('taiexChg');
        if(taiex)taiex.textContent=Number(t.close).toLocaleString('zh-TW',{maximumFractionDigits:2});
        if(taiexChg){
          taiexChg.textContent=`${ch>0?'+':''}${Number(ch).toLocaleString('zh-TW',{maximumFractionDigits:2})}｜最近交易日 ${String(t.date||j.tradeDate||'').replaceAll('-','/')}`;
          taiexChg.className='s '+(ch>0?'up':ch<0?'down':'flat');
        }
      }
    }catch(err){console.error('[v069 taiex]',err);}
  }

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
    const codes=[];
    const text=String(raw||'').toLowerCase();
    const hasJapan=text.includes('日本')||needle.includes('日本');
    const hasRealEstate=['地產','房地產','不動產','reit','reits'].some(k=>text.includes(k)||needle.includes(k));
    if(hasJapan&&hasRealEstate)codes.push('009817');
    const exact={
      '日本地產':'009817','日本房地產':'009817','日本不動產':'009817','日本reit':'009817','日本reits':'009817',
      '日reit':'009817','日reits':'009817','日本地產etf':'009817','日本房地產etf':'009817','日本不動產etf':'009817'
    };
    const k=String(needle||'');if(exact[k])codes.push(exact[k]);
    return [...new Set(codes)];
  }

  function installFuzzySearch(){
    if(typeof searchUniverse!=='function'||typeof normalizeSearchText!=='function'||typeof universeMap==='undefined')return false;
    const baseSearch=searchUniverse;
    searchUniverse=function(term){
      const t=String(term||'').trim();if(!t)return [];
      const needle=normalizeSearchText(t);
      const normal=baseSearch(t);
      const seen=new Set(normal.map(x=>x.code));
      const extra=[];

      for(const code of semanticCodes(t,needle)){
        const x=universeMap.get(code);
        if(x&&!seen.has(code)){extra.push({...x,_fuzzyReason:'概念相符',_fuzzyRank:10});seen.add(code)}
      }

      // 純數字代號不做猜測，避免把真實證券代號誤導到別檔。
      if(needle&&!/^\d+$/.test(needle)){
        const maxDist=needle.length<=4?1:2;
        for(const x of universeMap.values()){
          if(seen.has(x.code))continue;
          const n=normalizeSearchText(x.name);
          if(!n)continue;
          const d=editDistance(needle,n,maxDist);
          if(d<=maxDist){extra.push({...x,_fuzzyReason:'名稱近似',_fuzzyRank:20+d});seen.add(x.code)}
        }
      }

      extra.sort((a,b)=>(a._fuzzyRank||99)-(b._fuzzyRank||99)||a.code.localeCompare(b.code));
      return [...normal,...extra].slice(0,30);
    };
    window.__TW_FUZZY_SEARCH__={enabled:true,version:'071'};
    return true;
  }

  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function safeUrl(u){try{const x=new URL(String(u||''));return /^https?:$/.test(x.protocol)?x.href:'#';}catch{return '#';}}
  function renderNewsItems(items,state,box){
    box.innerHTML='';
    if(!items.length){state.textContent='最近一個月暫無可讀取新聞。';return false;}
    state.textContent='';
    for(const it of items.slice(0,4)){
      const d=document.createElement('div');d.className='event';
      const publisher=it.publisher?`｜${esc(it.publisher)}`:'';
      const date=it.time?new Date(it.time).toLocaleString('zh-TW'):'';
      d.innerHTML=`<div class="tag">新聞${publisher}</div><a target="_blank" rel="noopener" href="${esc(safeUrl(it.link))}">${esc(it.title||'新聞')}</a>${date?`<div class="date">${esc(date)}</div>`:''}`;
      box.appendChild(d);
    }
    return true;
  }

  async function yahooStockNews(code,name){
    const queries=[String(name||'').trim(),String(code||'').trim()].filter(Boolean);
    const seen=new Set(),out=[];
    for(const q of queries){
      const upstream=`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=10&enableFuzzyQuery=false`;
      const url=`https://proxy.cors.dev/${upstream}`;
      try{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;
        const j=await r.json();
        for(const n of (j?.news||[])){
          const title=String(n?.title||'').trim(),link=String(n?.link||'').trim(),ts=Number(n?.providerPublishTime||0)*1000;
          if(!title||!link||!Number.isFinite(ts)||ts<=0||Date.now()-ts>30*24*60*60*1000)continue;
          const key=title.toLowerCase();if(seen.has(key))continue;seen.add(key);
          out.push({title,link,publisher:String(n?.publisher||''),time:ts});
        }
      }catch{}
      if(out.length>=4)break;
    }
    return out.sort((a,b)=>b.time-a.time).slice(0,4);
  }

  async function googleRssNews(code,name){
    const query=encodeURIComponent(`${name||code} ${code} 股票 when:30d`);
    const rss=`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    const proxies=[
      `https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`,
      `https://api.allorigins.win/get?url=${encodeURIComponent(rss)}`
    ];
    for(const url of proxies){
      try{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;
        let text=await r.text();
        if(url.includes('/get?')){try{text=JSON.parse(text)?.contents||'';}catch{text='';}}
        if(!text)continue;
        const xml=new DOMParser().parseFromString(text,'text/xml'),cutoff=Date.now()-30*24*60*60*1000,out=[];
        for(const it of [...xml.querySelectorAll('item')]){
          const title=it.querySelector('title')?.textContent?.trim()||'',link=it.querySelector('link')?.textContent?.trim()||'',rawDate=it.querySelector('pubDate')?.textContent||'',ts=Date.parse(rawDate);
          if(!title||!link||!Number.isFinite(ts)||ts<cutoff)continue;
          out.push({title,link,publisher:'Google News',time:ts});if(out.length>=4)break;
        }
        if(out.length)return out;
      }catch{}
    }
    return [];
  }

  function installNewsFix(){
    if(typeof news!=='function')return false;
    news=async function(code,name){
      const box=document.getElementById('news'),state=document.getElementById('newsState');if(!box||!state)return;
      box.innerHTML='';state.textContent='載入最近一個月新聞…';
      let items=[];
      try{items=await yahooStockNews(code,name);}catch{}
      if(!items.length){try{items=await googleRssNews(code,name);}catch{}}
      if(renderNewsItems(items,state,box))return;
      const q=encodeURIComponent(`${name||code} ${code} 股票`);
      state.innerHTML=`新聞來源暫時無法直接讀取。<br><a style="color:#a9cbff" target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant">開啟 Google 新聞搜尋</a>`;
    };
    window.__TW_NEWS_FIX__={enabled:true,version:'073',primary:'Yahoo Finance search',fallback:'Google News RSS'};
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadLatestExtras,{once:true});
  else loadLatestExtras();
  if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
  if(!installNewsFix())setTimeout(installNewsFix,0);
  window.__TW_MONITOR_V069__={taiex:true,fuzzySearch:true,newsFix:true};
})();
