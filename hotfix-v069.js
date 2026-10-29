(() => {
  let taiexTimer=null;

  function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
  function taipeiTodayKey(){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const g=t=>p.find(x=>x.type===t)?.value||'';
    return `${g('year')}${g('month')}${g('day')}`;
  }
  function paintTaiex(value,prev,date,time,source){
    const z=num(value),y=num(prev);if(z==null)return false;
    const ch=y==null?null:z-y;
    const taiex=document.getElementById('taiex'),taiexChg=document.getElementById('taiexChg');
    if(taiex)taiex.textContent=z.toLocaleString('zh-TW',{maximumFractionDigits:2});
    if(taiexChg){
      const chText=ch==null?'—':`${ch>0?'+':''}${ch.toLocaleString('zh-TW',{maximumFractionDigits:2})}`;
      const d=String(date||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1/$2/$3');
      taiexChg.textContent=`${chText}｜${source}${time?` ${time}`:''}${!time&&d?` ${d}`:''}`;
      taiexChg.className='s '+(ch==null?'muted':ch>0?'up':ch<0?'down':'flat');
    }
    return true;
  }

  async function loadLatestExtras(){
    try{
      const r=await fetch(`./data/latest.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`latest ${r.status}`);
      const j=await r.json(),t=j?.taiex;
      if(t&&t.close!=null)paintTaiex(t.close,(num(t.close)!=null&&num(t.change)!=null)?num(t.close)-num(t.change):null,String(t.date||j.tradeDate||'').replaceAll('-',''),'','最近交易日');
    }catch(err){console.error('[taiex snapshot]',err);}
  }

  async function loadLiveTaiex(){
    const url=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0&_=${Date.now()}`;
    try{
      let j=null;
      if(typeof jsonPublic==='function')j=await jsonPublic(url,5000);
      else{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`MIS ${r.status}`);j=await r.json();
      }
      const m=(j?.msgArray||[]).find(x=>String(x?.c||'')==='t00'||String(x?.ch||'')==='t00.tw')||j?.msgArray?.[0];
      if(!m)throw new Error('TAIEX payload missing');
      const z=num(m.z),y=num(m.y);if(z==null)throw new Error('TAIEX value missing');
      const today=taipeiTodayKey(),d=String(m.d||'');
      const source=d===today?'盤中即時':'最近交易日';
      paintTaiex(z,y,d,String(m.t||m['%']||''),source);
      window.__TW_TAIEX_LIVE__={ok:true,date:d,time:String(m.t||m['%']||''),price:z,updatedAt:Date.now()};
      return true;
    }catch(err){
      console.error('[taiex live]',err);
      window.__TW_TAIEX_LIVE__={ok:false,error:String(err?.message||err),updatedAt:Date.now()};
      return false;
    }
  }

  function startTaiexPolling(){
    loadLatestExtras().finally(()=>loadLiveTaiex());
    if(taiexTimer)clearInterval(taiexTimer);
    taiexTimer=setInterval(loadLiveTaiex,15000);
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
    const codes=[],text=String(raw||'').toLowerCase();
    const hasJapan=text.includes('日本')||needle.includes('日本');
    const hasRealEstate=['地產','房地產','不動產','reit','reits'].some(k=>text.includes(k)||needle.includes(k));
    if(hasJapan&&hasRealEstate)codes.push('009817');
    const exact={'日本地產':'009817','日本房地產':'009817','日本不動產':'009817','日本reit':'009817','日本reits':'009817','日reit':'009817','日reits':'009817','日本地產etf':'009817','日本房地產etf':'009817','日本不動產etf':'009817'};
    const k=String(needle||'');if(exact[k])codes.push(exact[k]);
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
          if(seen.has(x.code))continue;const n=normalizeSearchText(x.name);if(!n)continue;
          const d=editDistance(needle,n,maxDist);if(d<=maxDist){extra.push({...x,_fuzzyReason:'名稱近似',_fuzzyRank:20+d});seen.add(x.code)}
        }
      }
      extra.sort((a,b)=>(a._fuzzyRank||99)-(b._fuzzyRank||99)||a.code.localeCompare(b.code));
      return [...normal,...extra].slice(0,30);
    };
    window.__TW_FUZZY_SEARCH__={enabled:true,version:'074'};return true;
  }

  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function safeUrl(u){try{const x=new URL(String(u||''));return /^https?:$/.test(x.protocol)?x.href:'#';}catch{return '#';}}
  function renderNewsItems(items,state,box){
    box.innerHTML='';if(!items.length){state.textContent='最近一個月暫無可讀取新聞。';return false;}state.textContent='';
    for(const it of items.slice(0,4)){
      const d=document.createElement('div');d.className='event';const publisher=it.publisher?`｜${esc(it.publisher)}`:'',date=it.time?new Date(it.time).toLocaleString('zh-TW'):'';
      d.innerHTML=`<div class="tag">新聞${publisher}</div><a target="_blank" rel="noopener" href="${esc(safeUrl(it.link))}">${esc(it.title||'新聞')}</a>${date?`<div class="date">${esc(date)}</div>`:''}`;box.appendChild(d);
    }
    return true;
  }

  async function yahooStockNews(code,name){
    const queries=[String(name||'').trim(),String(code||'').trim()].filter(Boolean),seen=new Set(),out=[];
    for(const q of queries){
      const upstream=`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=10&enableFuzzyQuery=false`,url=`https://proxy.cors.dev/${upstream}`;
      try{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;const j=await r.json();
        for(const n of (j?.news||[])){
          const title=String(n?.title||'').trim(),link=String(n?.link||'').trim(),ts=Number(n?.providerPublishTime||0)*1000;
          if(!title||!link||!Number.isFinite(ts)||ts<=0||Date.now()-ts>30*24*60*60*1000)continue;
          const key=title.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({title,link,publisher:String(n?.publisher||''),time:ts});
        }
      }catch{}
      if(out.length>=4)break;
    }
    return out.sort((a,b)=>b.time-a.time).slice(0,4);
  }

  async function googleRssNews(code,name){
    const query=encodeURIComponent(`${name||code} ${code} 股票 when:30d`),rss=`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
    const proxies=[`https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`,`https://api.allorigins.win/get?url=${encodeURIComponent(rss)}`];
    for(const url of proxies){
      try{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)continue;let text=await r.text();
        if(url.includes('/get?')){try{text=JSON.parse(text)?.contents||'';}catch{text='';}}if(!text)continue;
        const xml=new DOMParser().parseFromString(text,'text/xml'),cutoff=Date.now()-30*24*60*60*1000,out=[];
        for(const it of [...xml.querySelectorAll('item')]){
          const title=it.querySelector('title')?.textContent?.trim()||'',link=it.querySelector('link')?.textContent?.trim()||'',ts=Date.parse(it.querySelector('pubDate')?.textContent||'');
          if(!title||!link||!Number.isFinite(ts)||ts<cutoff)continue;out.push({title,link,publisher:'Google News',time:ts});if(out.length>=4)break;
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
      box.innerHTML='';state.textContent='載入最近一個月新聞…';let items=[];
      try{items=await yahooStockNews(code,name);}catch{}if(!items.length){try{items=await googleRssNews(code,name);}catch{}}
      if(renderNewsItems(items,state,box))return;
      const q=encodeURIComponent(`${name||code} ${code} 股票`);state.innerHTML=`新聞來源暫時無法直接讀取。<br><a style="color:#a9cbff" target="_blank" rel="noopener" href="https://news.google.com/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant">開啟 Google 新聞搜尋</a>`;
    };
    window.__TW_NEWS_FIX__={enabled:true,version:'074',primary:'Yahoo Finance search',fallback:'Google News RSS'};return true;
  }

  function boot(){startTaiexPolling();if(!installFuzzySearch())setTimeout(installFuzzySearch,0);if(!installNewsFix())setTimeout(installNewsFix,0);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__TW_MONITOR_V069__={taiexLive:true,fuzzySearch:true,newsFix:true,version:'074'};
})();
