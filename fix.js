(() => {
  const originalRender = render;
  const originalDraw = draw;
  const originalHistory = history;

  async function fetchTextFallback(url,ms=5000){
    const targets=[
      url,
      'https://api.allorigins.win/raw?url='+encodeURIComponent(url),
      'https://corsproxy.io/?'+encodeURIComponent(url),
      'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(url)
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

  async function fetchJsonFallback(url,ms=7000){
    const text=await fetchTextFallback(url,ms);
    return JSON.parse(text);
  }

  async function yahooHistory3m(symbol){
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false&events=div%2Csplits`;
    const j=await fetchJsonFallback(url,6500);
    const r=j?.chart?.result?.[0];
    if(!r) return [];
    const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{},out=[];
    for(let i=0;i<ts.length;i++){
      const close=N(q.close?.[i]);
      if(close==null) continue;
      const d=new Date(ts[i]*1000);
      const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      out.push({date,open:N(q.open?.[i]),high:N(q.high?.[i]),low:N(q.low?.[i]),close,volume:N(q.volume?.[i])});
    }
    return out;
  }

  function rocDate(d){
    return `${d.getFullYear()-1911}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }

  function parseTpexDailyHtml(html,code,date){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const rows=[...doc.querySelectorAll('tr')];
    for(const tr of rows){
      const td=[...tr.querySelectorAll('td')].map(x=>x.textContent.trim().replace(/,/g,''));
      if(td[0]!==String(code)) continue;
      const close=N(td[2]),open=N(td[4]),high=N(td[5]),low=N(td[6]),volume=N(td[8]);
      if(close==null) return null;
      return {date:`${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}`,open,high,low,close,volume};
    }
    return null;
  }

  async function tpexSampleHistory(code){
    const dates=[];
    const now=new Date();
    for(let days=0;days<=90;days+=4){
      const d=new Date(now);d.setDate(now.getDate()-days);
      if(d.getDay()===0||d.getDay()===6) continue;
      dates.push(d);
    }
    const out=[];
    const batchSize=4;
    for(let i=0;i<dates.length;i+=batchSize){
      const batch=dates.slice(i,i+batchSize);
      const rows=await Promise.all(batch.map(async d=>{
        const u=`https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?d=${encodeURIComponent(rocDate(d))}&l=zh-tw&o=htm`;
        try{return parseTpexDailyHtml(await fetchTextFallback(u,3500),code,d)}catch{return null}
      }));
      for(const r of rows) if(r) out.push(r);
      if(out.length>=16) break;
    }
    return [...new Map(out.map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  }

  history = async function(code){
    if(historyCache[code]?.length) return historyCache[code];
    const u=universeMap.get(String(code));
    let out=[];
    if(u?.market==='TPEx' || String(code)==='3293'){
      try{out=await yahooHistory3m(`${code}.TWO`)}catch{}
      if(!out.length){try{out=await tpexSampleHistory(code)}catch{}}
      if(!out.length){try{out=await originalHistory(code)}catch{}}
    }else{
      try{out=await originalHistory(code)}catch{}
      if(!out.length){try{out=await yahooHistory3m(`${code}.TW`)}catch{}}
    }
    out=[...new Map((out||[]).map(x=>[x.date,x])).values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    historyCache[code]=out;
    return out;
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
    if(last&&sameDay(last.date,q.time)) d[d.length-1]={...last,close:q.price,open:q.open??last.open,high:q.high??last.high,low:q.low??last.low,volume:q.volume??last.volume,date:last.date};
    else d.push({date:q.time?.toLocaleDateString?.('zh-TW')||'最新',close:q.price,open:q.open,high:q.high,low:q.low,volume:q.volume});
    return d;
  }

  function rowElementForCode(code){return [...$('watch').querySelectorAll('.row')].find(el=>el.querySelector('.sym')?.textContent?.trim()===String(code))||null;}
  function ensureSpark(el){let cv=el?.querySelector('canvas.spark');if(cv)return cv;const fallback=el?.querySelector('.sparkFallback');if(!fallback)return null;cv=document.createElement('canvas');cv.className='spark';cv.width=420;cv.height=50;fallback.replaceWith(cv);return cv;}

  async function silentRender(allowNetwork=false){
    if(!allowNetwork)return originalRender(false);
    const list=watchlist();$('watchCount').textContent=list.length;
    let touched=0;
    for(const code of list){
      const el=rowElementForCode(code);if(!el)continue;
      touched++;
      const row=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{};
      let h=historyCache[code]||[];if(!h.length){try{h=await history(code)}catch{h=[]}}
      let q;try{q=await quote(code,true)}catch{q=universeQuote(code)||snapshotQuote(code)||{price:null,change:null,open:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'}}
      const merged=chartDataWithLatest(h,q),s=scoreStock(row,val,merged,q),ch=q.change??N(row.Change)??0;
      const priceEl=el.querySelector('.price'),chgEl=el.querySelector('.chg'),scoreEl=el.querySelector('.scoreNum'),scoreLabel=el.querySelector('.scoreLabel'),dayline=el.querySelector('.dayline'),meta=el.querySelector('.meta');
      if(priceEl)priceEl.textContent=F(q.price);if(chgEl){chgEl.textContent=`${ch>0?'+':''}${F(ch)}`;chgEl.className=`chg ${cls(ch)}`;}if(scoreEl){scoreEl.textContent=scoreValue(s.total);scoreEl.className=`scoreNum ${scoreCls(s.total)}`;}if(scoreLabel)scoreLabel.textContent=s.total==null?'資料不足':s.mode;
      if(dayline)dayline.textContent=`${q.time?.toLocaleDateString('zh-TW')||SNAPSHOT_DATE}　開 ${F(q.open??row.OpeningPrice)}　高 ${F(q.high??row.HighestPrice)}　低 ${F(q.low??row.LowestPrice)}　收 ${F(q.price??row.ClosingPrice)}　量 ${F(q.volume??row.TradeVolume,0)}`;
      if(meta){const spans=meta.querySelectorAll('span');if(spans[0])spans[0].textContent=q.source||'可用資料';if(spans[1])spans[1].textContent=`漲跌 ${ch>0?'+':''}${F(ch)}`;}
      const cv=ensureSpark(el);if(cv&&merged.length)originalDraw(cv,merged,true,null);
      if(active===code&&$('sheet').classList.contains('show')){$('dTime').textContent=`${q.source||'可用資料'}｜${q.time?.toLocaleString?.('zh-TW')||'—'}`;$('dPrice').textContent=F(q.price);$('dOpen').textContent=F(q.open??row.OpeningPrice);$('dChange').textContent=`${ch>0?'+':''}${F(ch)}`;$('dChange').className='v '+cls(ch);$('dRange').textContent=`${F(q.high??row.HighestPrice)} / ${F(q.low??row.LowestPrice)}`;$('dVolume').textContent=F(q.volume??row.TradeVolume,0);if(merged.length)originalDraw($('bigChart'),merged,false,null);}
    }
    return touched;
  }

  render=silentRender;
  const p=$('refreshPill');if(p)p.textContent='自動更新：15 秒（靜默）';

  // 啟動時等監控列真正建立後立刻載入，不再等第一個 15 秒。
  let tries=0,startupBusy=false;
  const startupTimer=setInterval(async()=>{
    if(startupBusy)return;
    tries++;
    const rows=$('watch')?.querySelectorAll('.row')?.length||0;
    if(!rows){if(tries>=30)clearInterval(startupTimer);return;}
    startupBusy=true;
    try{
      const touched=await silentRender(true);
      const haveCharts=[...$('watch').querySelectorAll('canvas.spark')].length;
      if(touched>0&&haveCharts>0) clearInterval(startupTimer);
    }finally{startupBusy=false;}
    if(tries>=30)clearInterval(startupTimer);
  },500);
})();
