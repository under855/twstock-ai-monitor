(() => {
  const originalRender = render;
  const originalDraw = draw;
  const originalHistory = history;
  const historyLoading = new Map();

  async function fetchTextFallback(url,ms=4500){
    const targets=[
      url,
      'https://api.allorigins.win/raw?url='+encodeURIComponent(url),
      'https://corsproxy.io/?'+encodeURIComponent(url)
    ];
    let lastErr=null;
    for(const t of targets){
      const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);
      try{
        const r=await fetch(t,{cache:'no-store',signal:c.signal});
        if(!r.ok) throw Error('HTTP '+r.status);
        const text=await r.text();
        clearTimeout(timer);
        return text;
      }catch(e){lastErr=e;clearTimeout(timer)}
    }
    throw lastErr||Error('fetch failed');
  }

  async function yahooHistory3m(symbol){
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    const text=await fetchTextFallback(url,4000);
    const j=JSON.parse(text),r=j?.chart?.result?.[0];
    if(!r) return [];
    const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{},out=[];
    for(let i=0;i<ts.length;i++){
      const close=N(q.close?.[i]);
      if(close==null) continue;
      const d=new Date(ts[i]*1000);
      out.push({
        date:`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`,
        open:N(q.open?.[i]),high:N(q.high?.[i]),low:N(q.low?.[i]),close,volume:N(q.volume?.[i])
      });
    }
    return out;
  }

  history = async function(code){
    if(historyCache[code]?.length) return historyCache[code];
    if(historyLoading.has(code)) return historyLoading.get(code);
    const task=(async()=>{
      const u=universeMap.get(String(code));
      let out=[];
      if(u?.market==='TPEx' || String(code)==='3293'){
        try{out=await yahooHistory3m(`${code}.TWO`)}catch{}
      }else{
        try{out=await originalHistory(code)}catch{}
        if(!out.length){try{out=await yahooHistory3m(`${code}.TW`)}catch{}}
      }
      out=[...new Map((out||[]).map(x=>[x.date,x])).values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      if(out.length) historyCache[code]=out;
      return out;
    })().finally(()=>historyLoading.delete(code));
    historyLoading.set(code,task);
    return task;
  };

  function sameDay(a,b){
    if(!a||!b) return false;
    const da=dateObj(a),db=b instanceof Date?b:dateObj(b);
    return !!(da&&db&&da.getFullYear()===db.getFullYear()&&da.getMonth()===db.getMonth()&&da.getDate()===db.getDate());
  }

  function chartDataWithLatest(data,q){
    const d=[...(data||[])];
    if(q?.price==null) return d;
    const last=d.at(-1);
    if(last&&sameDay(last.date,q.time)) d[d.length-1]={...last,close:q.price,open:q.open??last.open,high:q.high??last.high,low:q.low??last.low,volume:q.volume??last.volume};
    else d.push({date:q.time?.toLocaleDateString?.('zh-TW')||'最新',close:q.price,open:q.open,high:q.high,low:q.low,volume:q.volume});
    return d;
  }

  function rowElementForCode(code){
    return [...$('watch').querySelectorAll('.row')].find(el=>el.querySelector('.sym')?.textContent?.trim()===String(code))||null;
  }

  function ensureSpark(el){
    let cv=el?.querySelector('canvas.spark');
    if(cv) return cv;
    const fallback=el?.querySelector('.sparkFallback');
    if(!fallback) return null;
    cv=document.createElement('canvas');cv.className='spark';cv.width=420;cv.height=50;
    fallback.replaceWith(cv);return cv;
  }

  function paintChartWhenReady(code,el,q){
    const cached=historyCache[code]||[];
    if(cached.length){
      const cv=ensureSpark(el),merged=chartDataWithLatest(cached,q);
      if(cv&&merged.length) originalDraw(cv,merged,true,null);
      if(active===code&&$('sheet').classList.contains('show')&&merged.length) originalDraw($('bigChart'),merged,false,null);
      return;
    }
    history(code).then(h=>{
      if(!h?.length) return;
      const currentEl=rowElementForCode(code);if(!currentEl) return;
      const currentQ=quoteCache[code]||q||universeQuote(code)||snapshotQuote(code);
      const merged=chartDataWithLatest(h,currentQ),cv=ensureSpark(currentEl);
      if(cv&&merged.length) originalDraw(cv,merged,true,null);
      if(active===code&&$('sheet').classList.contains('show')&&merged.length) originalDraw($('bigChart'),merged,false,null);
    }).catch(()=>{});
  }

  async function updateOneQuote(code){
    const el=rowElementForCode(code);if(!el) return false;
    const row=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{};
    let q;
    try{q=await quote(code,true)}catch{q=universeQuote(code)||snapshotQuote(code)||{price:null,change:null,open:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'}}
    const h=historyCache[code]||[],merged=chartDataWithLatest(h,q),s=scoreStock(row,val,merged,q),ch=q.change??N(row.Change)??0;
    const priceEl=el.querySelector('.price'),chgEl=el.querySelector('.chg'),scoreEl=el.querySelector('.scoreNum'),scoreLabel=el.querySelector('.scoreLabel'),dayline=el.querySelector('.dayline'),meta=el.querySelector('.meta');
    if(priceEl)priceEl.textContent=F(q.price);
    if(chgEl){chgEl.textContent=`${ch>0?'+':''}${F(ch)}`;chgEl.className=`chg ${cls(ch)}`;}
    if(scoreEl){scoreEl.textContent=scoreValue(s.total);scoreEl.className=`scoreNum ${scoreCls(s.total)}`;}
    if(scoreLabel)scoreLabel.textContent=s.total==null?'資料不足':s.mode;
    if(dayline)dayline.textContent=`${q.time?.toLocaleDateString('zh-TW')||SNAPSHOT_DATE}　開 ${F(q.open??row.OpeningPrice)}　高 ${F(q.high??row.HighestPrice)}　低 ${F(q.low??row.LowestPrice)}　收 ${F(q.price??row.ClosingPrice)}　量 ${F(q.volume??row.TradeVolume,0)}`;
    if(meta){const spans=meta.querySelectorAll('span');if(spans[0])spans[0].textContent=q.source||'可用資料';if(spans[1])spans[1].textContent=`漲跌 ${ch>0?'+':''}${F(ch)}`;}
    if(active===code&&$('sheet').classList.contains('show')){
      $('dTime').textContent=`${q.source||'可用資料'}｜${q.time?.toLocaleString?.('zh-TW')||'—'}`;
      $('dPrice').textContent=F(q.price);$('dOpen').textContent=F(q.open??row.OpeningPrice);$('dChange').textContent=`${ch>0?'+':''}${F(ch)}`;$('dChange').className='v '+cls(ch);$('dRange').textContent=`${F(q.high??row.HighestPrice)} / ${F(q.low??row.LowestPrice)}`;$('dVolume').textContent=F(q.volume??row.TradeVolume,0);
    }
    paintChartWhenReady(code,el,q);
    return true;
  }

  async function silentRender(allowNetwork=false){
    if(!allowNetwork) return originalRender(false);
    const list=watchlist();$('watchCount').textContent=list.length;
    // 行情更新彼此獨立並行；任何一檔歷史資料失敗都不能阻塞其他股票。
    const results=await Promise.allSettled(list.map(code=>updateOneQuote(code)));
    return results.filter(x=>x.status==='fulfilled'&&x.value).length;
  }

  render=silentRender;
  const p=$('refreshPill');if(p)p.textContent='自動更新：15 秒（行情優先）';

  // 等主畫面股票列建立後，立即更新行情，不等 15 秒。
  let tries=0,busy=false;
  const startupTimer=setInterval(async()=>{
    if(busy)return;tries++;
    const rows=$('watch')?.querySelectorAll('.row')?.length||0;
    if(!rows){if(tries>=40)clearInterval(startupTimer);return;}
    busy=true;
    try{quoteCache={};const n=await silentRender(true);if(n>0)clearInterval(startupTimer);}finally{busy=false;}
    if(tries>=40)clearInterval(startupTimer);
  },500);
})();
