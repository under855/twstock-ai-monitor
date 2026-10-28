(() => {
  const originalRender = render;
  const originalDraw = draw;
  const originalHistory = history;
  const historyLoading = new Map();
  let batchBusy = null;

  function marketPrefix(code){
    const u = universeMap.get(String(code));
    if(u?.market === 'TPEx') return 'otc';
    if(u?.market === 'TWSE') return 'tse';
    if(String(code) === '3293') return 'otc';
    return null;
  }

  function buildChannels(list){
    const out=[];
    for(const code of list){
      const p=marketPrefix(code);
      if(p) out.push(`${p}_${code}.tw`);
      else {
        out.push(`tse_${code}.tw`);
        out.push(`otc_${code}.tw`);
      }
    }
    return out.join('|');
  }

  function parseMisQuote(m){
    if(!m?.c) return null;
    const price=N(m.z) ?? N(m.y);
    const prev=N(m.y);
    if(price==null && prev==null) return null;
    const tlong=N(m.tlong);
    return {
      code:String(m.c).trim(),
      price:price ?? prev,
      prev,
      change:(price!=null&&prev!=null)?price-prev:null,
      open:N(m.o),
      high:N(m.h),
      low:N(m.l),
      volume:N(m.v),
      time:tlong?new Date(tlong):(m.d?dateObj(`${String(m.d).slice(0,4)}/${String(m.d).slice(4,6)}/${String(m.d).slice(6,8)}`):new Date()),
      source:'證交所／櫃買盤中整批行情'
    };
  }

  async function fetchBatchQuotes(list){
    if(batchBusy) return batchBusy;
    batchBusy=(async()=>{
      const channels=buildChannels(list);
      if(!channels) return new Map();
      const url=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels)}&json=1&delay=0&_=${Date.now()}`;
      let j=null;
      try{ j=await jsonPublic(url,5000); }catch{}
      const map=new Map();
      for(const m of (j?.msgArray||[])){
        const q=parseMisQuote(m);
        if(q?.code) map.set(q.code,q);
      }
      return map;
    })().finally(()=>{batchBusy=null});
    return batchBusy;
  }

  function fallbackQuote(code){
    const row=rowForCode(code);
    const p=N(row?.ClosingPrice),c=N(row?.Change);
    if(p!=null){
      return {
        price:p,
        change:c,
        prev:(p!=null&&c!=null)?p-c:null,
        open:N(row?.OpeningPrice),
        high:N(row?.HighestPrice),
        low:N(row?.LowestPrice),
        volume:N(row?.TradeVolume),
        time:dateObj(row?.TradeDate)||universeQuote(code)?.time||snapshotQuote(code)?.time||null,
        source:row?.TradeDate?`官方最近交易日 ${row.TradeDate}`:'TWSE／TPEx 最新盤後'
      };
    }
    return universeQuote(code)||snapshotQuote(code)||{price:null,change:null,prev:null,open:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'};
  }

  function sameDay(a,b){
    if(!a||!b) return false;
    const da=dateObj(a),db=b instanceof Date?b:dateObj(b);
    return !!(da&&db&&da.getFullYear()===db.getFullYear()&&da.getMonth()===db.getMonth()&&da.getDate()===db.getDate());
  }

  function chartDataWithLatest(data,q){
    const d=[...(data||[])];
    if(q?.price==null) return d;
    const last=d.at(-1);
    if(last&&sameDay(last.date,q.time)){
      d[d.length-1]={...last,close:q.price,open:q.open??last.open,high:q.high??last.high,low:q.low??last.low,volume:q.volume??last.volume};
    }else if(q.time){
      d.push({date:q.time.toLocaleDateString('zh-TW'),close:q.price,open:q.open,high:q.high,low:q.low,volume:q.volume});
    }
    return d;
  }

  async function yahooHistory3m(symbol){
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    let j=null;
    try{j=await jsonPublic(url,5500)}catch{return []}
    const r=j?.chart?.result?.[0];
    if(!r) return [];
    const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{},out=[];
    for(let i=0;i<ts.length;i++){
      const close=N(q.close?.[i]);
      if(close==null) continue;
      const d=new Date(ts[i]*1000);
      out.push({date:`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`,open:N(q.open?.[i]),high:N(q.high?.[i]),low:N(q.low?.[i]),close,volume:N(q.volume?.[i])});
    }
    return out;
  }

  history=async function(code){
    if(historyCache[code]?.length) return historyCache[code];
    if(historyLoading.has(code)) return historyLoading.get(code);
    const task=(async()=>{
      let out=[];
      const p=marketPrefix(code);
      if(p==='otc'){
        out=await yahooHistory3m(`${code}.TWO`);
      }else{
        try{out=await originalHistory(code)}catch{}
        if(!out.length) out=await yahooHistory3m(`${code}.TW`);
      }
      out=[...new Map((out||[]).map(x=>[x.date,x])).values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      if(out.length) historyCache[code]=out;
      return out;
    })().finally(()=>historyLoading.delete(code));
    historyLoading.set(code,task);
    return task;
  };

  function rowElementForCode(code){
    return [...$('watch').querySelectorAll('.row')].find(el=>el.querySelector('.sym')?.textContent?.trim()===String(code))||null;
  }

  function ensureSpark(el){
    let cv=el?.querySelector('canvas.spark');
    if(cv) return cv;
    const fallback=el?.querySelector('.sparkFallback');
    if(!fallback) return null;
    cv=document.createElement('canvas');
    cv.className='spark';cv.width=420;cv.height=50;
    fallback.replaceWith(cv);
    return cv;
  }

  function paintChartAsync(code,q){
    const el=rowElementForCode(code);
    if(!el) return;
    const cached=historyCache[code]||[];
    if(cached.length){
      const merged=chartDataWithLatest(cached,q),cv=ensureSpark(el);
      if(cv&&merged.length) originalDraw(cv,merged,true,null);
      if(active===code&&$('sheet').classList.contains('show')&&merged.length) originalDraw($('bigChart'),merged,false,null);
      return;
    }
    history(code).then(h=>{
      if(!h?.length) return;
      const currentEl=rowElementForCode(code);
      if(!currentEl) return;
      const latest=quoteCache[code]||q||fallbackQuote(code);
      const merged=chartDataWithLatest(h,latest),cv=ensureSpark(currentEl);
      if(cv&&merged.length) originalDraw(cv,merged,true,null);
      if(active===code&&$('sheet').classList.contains('show')&&merged.length) originalDraw($('bigChart'),merged,false,null);
    }).catch(()=>{});
  }

  function paintQuote(code,q){
    const el=rowElementForCode(code);
    if(!el) return false;
    const row=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===String(code))||{};
    quoteCache[code]=q;
    const h=historyCache[code]||[],merged=chartDataWithLatest(h,q),s=scoreStock(row,val,merged,q),ch=q.change??N(row?.Change)??0;
    const priceEl=el.querySelector('.price'),chgEl=el.querySelector('.chg'),scoreEl=el.querySelector('.scoreNum'),scoreLabel=el.querySelector('.scoreLabel'),dayline=el.querySelector('.dayline'),meta=el.querySelector('.meta');
    if(priceEl) priceEl.textContent=F(q.price);
    if(chgEl){chgEl.textContent=`${ch>0?'+':''}${F(ch)}`;chgEl.className=`chg ${cls(ch)}`;}
    if(scoreEl){scoreEl.textContent=scoreValue(s.total);scoreEl.className=`scoreNum ${scoreCls(s.total)}`;}
    if(scoreLabel) scoreLabel.textContent=s.total==null?'資料不足':s.mode;
    if(dayline) dayline.textContent=`${q.time?.toLocaleDateString?.('zh-TW')||SNAPSHOT_DATE}　開 ${F(q.open??row?.OpeningPrice)}　高 ${F(q.high??row?.HighestPrice)}　低 ${F(q.low??row?.LowestPrice)}　收 ${F(q.price??row?.ClosingPrice)}　量 ${F(q.volume??row?.TradeVolume,0)}`;
    if(meta){
      const spans=meta.querySelectorAll('span');
      if(spans[0]) spans[0].textContent=q.source||'可用資料';
      if(spans[1]) spans[1].textContent=`漲跌 ${ch>0?'+':''}${F(ch)}`;
    }
    if(active===code&&$('sheet').classList.contains('show')){
      $('dTime').textContent=`${q.source||'可用資料'}｜${q.time?.toLocaleString?.('zh-TW')||'—'}`;
      $('dPrice').textContent=F(q.price);
      $('dOpen').textContent=F(q.open??row?.OpeningPrice);
      $('dChange').textContent=`${ch>0?'+':''}${F(ch)}`;
      $('dChange').className='v '+cls(ch);
      $('dRange').textContent=`${F(q.high??row?.HighestPrice)} / ${F(q.low??row?.LowestPrice)}`;
      $('dVolume').textContent=F(q.volume??row?.TradeVolume,0);
    }
    paintChartAsync(code,q);
    return true;
  }

  async function silentRender(allowNetwork=false){
    if(!allowNetwork) return originalRender(false);
    const list=watchlist();
    $('watchCount').textContent=list.length;

    // 先立即畫官方最近交易日／既有資料，絕不等待外部盤中 API。
    let count=0;
    for(const code of list){
      if(paintQuote(String(code),fallbackQuote(code))) count++;
    }

    // 再於背景等待整批盤中行情；成功後只覆蓋數字。
    let live=new Map();
    try{live=await fetchBatchQuotes(list)}catch{}
    if(live.size){
      for(const code of list){
        const q=live.get(String(code));
        if(q) paintQuote(String(code),q);
      }
      $('liveBadge').textContent='盤中行情已更新';
      $('liveBadge').className='liveBadge ok';
      $('marketStatus').textContent='正常';
      $('marketTime').textContent=`更新 ${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    }
    return count;
  }

  render=silentRender;
  const p=$('refreshPill');
  if(p) p.textContent='自動更新：15 秒（整批行情）';

  let startupDone=false;
  const start=async()=>{
    if(startupDone) return;
    const rows=$('watch')?.querySelectorAll('.row')?.length||0;
    if(!rows) return;
    startupDone=true;
    quoteCache={};
    await silentRender(true).catch(()=>{});
  };
  const startupTimer=setInterval(()=>{
    start().finally(()=>{if(startupDone) clearInterval(startupTimer)});
  },300);
  setTimeout(()=>clearInterval(startupTimer),12000);
})();
