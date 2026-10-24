(() => {
  const originalRender = render;
  async function silentRender(allowNetwork=false){
    if(!allowNetwork) return originalRender(false);
    const list=watchlist();
    const watch=$('watch');
    const rows=[...watch.querySelectorAll('.row[data-code]')];
    if(rows.length!==list.length || list.some(c=>!watch.querySelector(`.row[data-code="${CSS.escape(c)}"]`))){
      return originalRender(false);
    }
    $('watchCount').textContent=list.length;
    for(const code of list){
      const el=watch.querySelector(`.row[data-code="${CSS.escape(code)}"]`);
      if(!el) continue;
      const row=rowForCode(code), val=allVals.find(x=>String(x.Code).trim()===code)||{};
      const h=historyCache[code]||[];
      let q;
      try{ q=await quote(code,true); }
      catch{ q=universeQuote(code)||snapshotQuote(code)||{price:null,change:null,open:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'}; }
      const s=scoreStock(row,val,h,q), ch=q.change??N(row.Change)??0;
      const priceEl=el.querySelector('.price');
      const chgEl=el.querySelector('.chg');
      const scoreEl=el.querySelector('.scoreNum');
      const scoreLabel=el.querySelector('.scoreLabel');
      const dayline=el.querySelector('.dayline');
      const meta=el.querySelector('.meta');
      if(priceEl) priceEl.textContent=F(q.price);
      if(chgEl){ chgEl.textContent=`${ch>0?'+':''}${F(ch)}`; chgEl.className=`chg ${cls(ch)}`; }
      if(scoreEl){ scoreEl.textContent=scoreValue(s.total); scoreEl.className=`scoreNum ${scoreCls(s.total)}`; }
      if(scoreLabel) scoreLabel.textContent=s.total==null?'資料不足':s.mode;
      if(dayline) dayline.textContent=`${q.time?.toLocaleDateString('zh-TW')||SNAPSHOT_DATE}　開 ${F(q.open??row.OpeningPrice)}　高 ${F(q.high??row.HighestPrice)}　低 ${F(q.low??row.LowestPrice)}　收 ${F(q.price??row.ClosingPrice)}　量 ${F(q.volume??row.TradeVolume,0)}`;
      if(meta){
        const spans=meta.querySelectorAll('span');
        if(spans[0]) spans[0].textContent=q.source||'可用資料';
        if(spans[1]) spans[1].textContent=`漲跌 ${ch>0?'+':''}${F(ch)}`;
      }
      const cv=el.querySelector('canvas.spark');
      if(cv && h.length) draw(cv,h,true,q.price);
      if(active===code && $('sheet').classList.contains('show')){
        $('dTime').textContent=`${q.source||'可用資料'}｜${q.time?.toLocaleString?.('zh-TW')||'—'}`;
        $('dPrice').textContent=F(q.price);
        $('dOpen').textContent=F(q.open??row.OpeningPrice);
        $('dChange').textContent=`${ch>0?'+':''}${F(ch)}`;
        $('dChange').className='v '+cls(ch);
        $('dRange').textContent=`${F(q.high??row.HighestPrice)} / ${F(q.low??row.LowestPrice)}`;
        $('dVolume').textContent=F(q.volume??row.TradeVolume,0);
      }
    }
  }
  render = silentRender;
  const p=$('refreshPill');
  if(p) p.textContent='自動更新：15 秒（靜默）';
})();
