(() => {
  const originalRender = render;
  const originalDraw = draw;
  const originalHistory = history;

  async function yahooHistory3m(symbol){
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false&events=div%2Csplits`;
    const j=await jsonPublic(url,6000);
    const r=j?.chart?.result?.[0];
    if(!r) return [];
    const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{};
    const out=[];
    for(let i=0;i<ts.length;i++){
      const close=N(q.close?.[i]);
      if(close==null) continue;
      const d=new Date(ts[i]*1000);
      const date=`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      out.push({date,open:N(q.open?.[i]),high:N(q.high?.[i]),low:N(q.low?.[i]),close,volume:N(q.volume?.[i])});
    }
    return out;
  }

  history = async function(code){
    if(historyCache[code]?.length) return historyCache[code];
    const u=universeMap.get(String(code));
    let out=[];
    if(u?.market==='TPEx'){
      try{out=await yahooHistory3m(`${code}.TWO`)}catch{}
      if(!out.length){try{out=await originalHistory(code)}catch{}}
    }else{
      try{out=await originalHistory(code)}catch{}
      if(!out.length){
        try{out=await yahooHistory3m(`${code}.TW`)}catch{}
      }
    }
    out=[...new Map((out||[]).map(x=>[x.date,x])).values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    historyCache[code]=out;
    return out;
  };

  function sameDay(a,b){
    if(!a||!b) return false;
    const da=dateObj(a), db=b instanceof Date?b:dateObj(b);
    return !!(da&&db&&da.getFullYear()===db.getFullYear()&&da.getMonth()===db.getMonth()&&da.getDate()===db.getDate());
  }

  function chartDataWithLatest(data,q){
    const d=[...(data||[])];
    if(q?.price==null) return d;
    const last=d.at(-1);
    if(last && sameDay(last.date,q.time)){
      d[d.length-1]={...last,close:q.price,open:q.open??last.open,high:q.high??last.high,low:q.low??last.low,volume:q.volume??last.volume,date:last.date};
    }else{
      d.push({date:q.time?.toLocaleDateString?.('zh-TW')||'最新',close:q.price,open:q.open,high:q.high,low:q.low,volume:q.volume});
    }
    return d;
  }

  draw = function(canvas,data,compact=false,currentPrice=null){
    originalDraw(canvas,data,compact,currentPrice);
    if(currentPrice==null || !(data||[]).length) return;
    const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
    const d=[...(data||[]),{date:'最新',close:currentPrice}];
    const ys=d.map(x=>Number(x.close)).filter(Number.isFinite);
    if(!ys.length) return;
    const min=Math.min(...ys),max=Math.max(...ys),span=max-min||1,lo=min-span*.08,hi=max+span*.08;
    const p={l:compact?4:46,r:compact?4:12,t:8,b:compact?4:22};
    const x=W-p.r,y=p.t+(H-p.t-p.b)*(1-(currentPrice-lo)/(hi-lo));
    ctx.save();
    ctx.beginPath();ctx.arc(x,y,compact?4:5,0,Math.PI*2);ctx.fillStyle='#ffd166';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#071321';ctx.stroke();
    if(!compact){ctx.font='12px sans-serif';ctx.fillStyle='#ffd166';ctx.textAlign='right';ctx.fillText(`最新 ${F(currentPrice)}`,x-8,Math.max(16,y-8));ctx.textAlign='left';}
    ctx.restore();
  };

  function rowElementForCode(code){
    return [...$('watch').querySelectorAll('.row')].find(el=>el.querySelector('.sym')?.textContent?.trim()===String(code))||null;
  }

  function ensureSpark(el){
    let cv=el?.querySelector('canvas.spark');
    if(cv) return cv;
    const fallback=el?.querySelector('.sparkFallback');
    if(!fallback) return null;
    cv=document.createElement('canvas');cv.className='spark';cv.width=420;cv.height=50;
    fallback.replaceWith(cv);
    return cv;
  }

  async function silentRender(allowNetwork=false){
    if(!allowNetwork) return originalRender(false);
    const list=watchlist();
    $('watchCount').textContent=list.length;

    for(const code of list){
      const el=rowElementForCode(code);
      if(!el) continue;
      const row=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{};
      let h=historyCache[code]||[];
      if(!h.length){try{h=await history(code)}catch{h=[]}}
      let q;
      try{q=await quote(code,true)}catch{q=universeQuote(code)||snapshotQuote(code)||{price:null,change:null,open:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'}}
      const merged=chartDataWithLatest(h,q);
      const s=scoreStock(row,val,merged,q),ch=q.change??N(row.Change)??0;

      const priceEl=el.querySelector('.price'),chgEl=el.querySelector('.chg'),scoreEl=el.querySelector('.scoreNum'),scoreLabel=el.querySelector('.scoreLabel'),dayline=el.querySelector('.dayline'),meta=el.querySelector('.meta');
      if(priceEl) priceEl.textContent=F(q.price);
      if(chgEl){chgEl.textContent=`${ch>0?'+':''}${F(ch)}`;chgEl.className=`chg ${cls(ch)}`;}
      if(scoreEl){scoreEl.textContent=scoreValue(s.total);scoreEl.className=`scoreNum ${scoreCls(s.total)}`;}
      if(scoreLabel) scoreLabel.textContent=s.total==null?'資料不足':s.mode;
      if(dayline) dayline.textContent=`${q.time?.toLocaleDateString('zh-TW')||SNAPSHOT_DATE}　開 ${F(q.open??row.OpeningPrice)}　高 ${F(q.high??row.HighestPrice)}　低 ${F(q.low??row.LowestPrice)}　收 ${F(q.price??row.ClosingPrice)}　量 ${F(q.volume??row.TradeVolume,0)}`;
      if(meta){const spans=meta.querySelectorAll('span');if(spans[0])spans[0].textContent=q.source||'可用資料';if(spans[1])spans[1].textContent=`漲跌 ${ch>0?'+':''}${F(ch)}`;}

      const cv=ensureSpark(el);
      if(cv && merged.length) draw(cv,merged,true,null);

      if(active===code && $('sheet').classList.contains('show')){
        $('dTime').textContent=`${q.source||'可用資料'}｜${q.time?.toLocaleString?.('zh-TW')||'—'}`;
        $('dPrice').textContent=F(q.price);$('dOpen').textContent=F(q.open??row.OpeningPrice);$('dChange').textContent=`${ch>0?'+':''}${F(ch)}`;$('dChange').className='v '+cls(ch);$('dRange').textContent=`${F(q.high??row.HighestPrice)} / ${F(q.low??row.LowestPrice)}`;$('dVolume').textContent=F(q.volume??row.TradeVolume,0);
        if(merged.length){originalDraw($('bigChart'),merged,false,null);const last=merged.at(-1);if(last?.close!=null){const ctx=$('bigChart').getContext('2d'),W=$('bigChart').width;ctx.save();ctx.fillStyle='#ffd166';ctx.font='12px sans-serif';ctx.textAlign='right';ctx.fillText(`最新 ${F(last.close)}`,W-12,18);ctx.restore();}}
      }
    }
  }

  render = silentRender;
  const p=$('refreshPill');if(p)p.textContent='自動更新：15 秒（靜默）';
})();
