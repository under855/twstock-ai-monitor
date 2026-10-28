(() => {
  const originalRender = render;
  const originalDraw = draw;
  const originalHistory = history;
  const historyLoading = new Map();
  const liveSeries = new Map();
  const lastPainted = new Map();
  let batchBusy = null;

  function marketPrefix(code){
    const u=universeMap.get(String(code));
    if(u?.market==='TPEx') return 'otc';
    if(u?.market==='TWSE') return 'tse';
    if(String(code)==='3293') return 'otc';
    return null;
  }

  function buildChannels(list){
    const out=[];
    for(const raw of list){
      const code=String(raw),p=marketPrefix(code);
      if(p) out.push(`${p}_${code}.tw`);
      else { out.push(`tse_${code}.tw`); out.push(`otc_${code}.tw`); }
    }
    return out.join('|');
  }

  function parseMisQuote(m){
    if(!m?.c) return null;
    const price=N(m.z)??N(m.y),prev=N(m.y);
    if(price==null&&prev==null) return null;
    const tlong=N(m.tlong);
    return {
      code:String(m.c).trim(),price:price??prev,prev,
      change:(price!=null&&prev!=null)?price-prev:null,
      open:N(m.o),high:N(m.h),low:N(m.l),volume:N(m.v),
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
      let j=null;try{j=await jsonPublic(url,5000)}catch{}
      const map=new Map();
      for(const m of (j?.msgArray||[])){
        const q=parseMisQuote(m);if(q?.code)map.set(q.code,q);
      }
      return map;
    })().finally(()=>{batchBusy=null});
    return batchBusy;
  }

  function fallbackQuote(code){
    const row=rowForCode(code),p=N(row?.ClosingPrice),c=N(row?.Change);
    if(p!=null){
      return {price:p,change:c,prev:(c!=null?p-c:null),open:N(row?.OpeningPrice),high:N(row?.HighestPrice),low:N(row?.LowestPrice),volume:N(row?.TradeVolume),time:dateObj(row?.TradeDate)||universeQuote(code)?.time||snapshotQuote(code)?.time||null,source:row?.TradeDate?`官方最近交易日 ${row.TradeDate}`:'TWSE／TPEx 最新盤後'};
    }
    return universeQuote(code)||snapshotQuote(code)||{price:null,change:null,prev:null,open:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'};
  }

  function sameDay(a,b){
    if(!a||!b)return false;const da=dateObj(a),db=b instanceof Date?b:dateObj(b);
    return !!(da&&db&&da.getFullYear()===db.getFullYear()&&da.getMonth()===db.getMonth()&&da.getDate()===db.getDate());
  }

  function chartDataWithLatest(data,q){
    const d=[...(data||[])];if(q?.price==null)return d;const last=d.at(-1);
    if(last&&sameDay(last.date,q.time))d[d.length-1]={...last,close:q.price,open:q.open??last.open,high:q.high??last.high,low:q.low??last.low,volume:q.volume??last.volume};
    else if(q.time)d.push({date:q.time.toLocaleDateString('zh-TW'),close:q.price,open:q.open,high:q.high,low:q.low,volume:q.volume});
    return d;
  }

  function recordLivePoint(code,q){
    if(q?.price==null)return liveSeries.get(String(code))||[];
    const key=String(code),arr=liveSeries.get(key)||[];
    const stamp=(q.time instanceof Date&&Number.isFinite(q.time.getTime()))?q.time.getTime():Date.now();
    const last=arr.at(-1);
    if(!last||last.close!==q.price||stamp-last.stamp>=12000){
      arr.push({date:new Date(stamp).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),close:q.price,stamp});
      while(arr.length>80)arr.shift();liveSeries.set(key,arr);
    }
    return arr;
  }

  function drawWithEndpoint(canvas,data,compact=false){
    if(!canvas||!(data||[]).length)return;originalDraw(canvas,data,compact,null);
    const d=data.filter(x=>N(x.close)!=null);if(!d.length)return;
    const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,ys=d.map(x=>N(x.close)),min=Math.min(...ys),max=Math.max(...ys),span=max-min||1,lo=min-span*.08,hi=max+span*.08,p={l:compact?4:46,r:compact?4:12,t:8,b:compact?4:22};
    const x=W-p.r,y=p.t+(H-p.t-p.b)*(1-(N(d.at(-1).close)-lo)/(hi-lo));
    ctx.save();ctx.beginPath();ctx.arc(x,y,compact?3.5:5,0,Math.PI*2);ctx.fillStyle='#ffd166';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#071321';ctx.stroke();ctx.restore();
  }

  async function yahooHistory3m(symbol){
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    let j=null;try{j=await jsonPublic(url,5500)}catch{return []}
    const r=j?.chart?.result?.[0];if(!r)return [];
    const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{},out=[];
    for(let i=0;i<ts.length;i++){const close=N(q.close?.[i]);if(close==null)continue;const d=new Date(ts[i]*1000);out.push({date:`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`,open:N(q.open?.[i]),high:N(q.high?.[i]),low:N(q.low?.[i]),close,volume:N(q.volume?.[i])});}
    return out;
  }

  history=async function(code){
    code=String(code);if(historyCache[code]?.length)return historyCache[code];if(historyLoading.has(code))return historyLoading.get(code);
    const task=(async()=>{let out=[];const p=marketPrefix(code);if(p==='otc')out=await yahooHistory3m(`${code}.TWO`);else{try{out=await originalHistory(code)}catch{}if(!out.length)out=await yahooHistory3m(`${code}.TW`);}out=[...new Map((out||[]).map(x=>[x.date,x])).values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));if(out.length)historyCache[code]=out;return out;})().finally(()=>historyLoading.delete(code));
    historyLoading.set(code,task);return task;
  };

  function rowElementForCode(code){return [...$('watch').querySelectorAll('.row')].find(el=>el.querySelector('.sym')?.textContent?.trim()===String(code))||null;}
  function ensureSpark(el){let cv=el?.querySelector('canvas.spark');if(cv)return cv;const fallback=el?.querySelector('.sparkFallback');if(!fallback)return null;cv=document.createElement('canvas');cv.className='spark';cv.width=420;cv.height=50;fallback.replaceWith(cv);return cv;}
  function displaySeries(code,q){const h=historyCache[String(code)]||[];if(h.length)return chartDataWithLatest(h,q);return recordLivePoint(String(code),q);}

  function paintChartAsync(code,q,force=false){
    const el=rowElementForCode(code);if(!el)return;
    const immediate=displaySeries(code,q),cv=ensureSpark(el);
    if(cv&&immediate.length&&(force||lastPainted.get(String(code))?.chartPrice!==q?.price))drawWithEndpoint(cv,immediate,true);
    if(active===String(code)&&$('sheet').classList.contains('show')&&immediate.length&&(force||lastPainted.get(String(code))?.chartPrice!==q?.price))drawWithEndpoint($('bigChart'),immediate,false);
    const state=lastPainted.get(String(code))||{};lastPainted.set(String(code),{...state,chartPrice:q?.price});
    if(historyCache[String(code)]?.length)return;
    history(String(code)).then(h=>{if(!h?.length)return;const currentEl=rowElementForCode(code);if(!currentEl)return;const latest=quoteCache[String(code)]||q||fallbackQuote(String(code)),merged=chartDataWithLatest(h,latest),canvas=ensureSpark(currentEl);if(canvas&&merged.length)drawWithEndpoint(canvas,merged,true);if(active===String(code)&&$('sheet').classList.contains('show')&&merged.length)drawWithEndpoint($('bigChart'),merged,false);}).catch(()=>{});
  }

  function quoteChanged(prev,q){
    if(!prev)return true;
    return ['price','change','open','high','low','volume'].some(k=>N(prev[k])!==N(q?.[k])) || ((prev.time?.getTime?.()||0)!==(q?.time?.getTime?.()||0));
  }

  function paintQuote(code,q,force=false){
    code=String(code);const el=rowElementForCode(code);if(!el)return false;
    const prev=lastPainted.get(code)?.quote;if(!force&&!quoteChanged(prev,q)){quoteCache[code]=q;return true;}
    const row=rowForCode(code),val=allVals.find(x=>String(x.Code).trim()===code)||{};quoteCache[code]=q;recordLivePoint(code,q);
    const h=historyCache[code]||[],s=scoreStock(row,val,h,q),ch=q.change??N(row?.Change)??0;
    const priceEl=el.querySelector('.price'),chgEl=el.querySelector('.chg'),scoreEl=el.querySelector('.scoreNum'),scoreLabel=el.querySelector('.scoreLabel'),dayline=el.querySelector('.dayline'),meta=el.querySelector('.meta');
    if(priceEl)priceEl.textContent=F(q.price);if(chgEl){chgEl.textContent=`${ch>0?'+':''}${F(ch)}`;chgEl.className=`chg ${cls(ch)}`;}if(scoreEl){scoreEl.textContent=scoreValue(s.total);scoreEl.className=`scoreNum ${scoreCls(s.total)}`;}if(scoreLabel)scoreLabel.textContent=s.total==null?'資料不足':s.mode;
    if(dayline)dayline.textContent=`${q.time?.toLocaleDateString?.('zh-TW')||SNAPSHOT_DATE}　開 ${F(q.open??row?.OpeningPrice)}　高 ${F(q.high??row?.HighestPrice)}　低 ${F(q.low??row?.LowestPrice)}　收 ${F(q.price??row?.ClosingPrice)}　量 ${F(q.volume??row?.TradeVolume,0)}`;
    if(meta){const spans=meta.querySelectorAll('span');if(spans[0])spans[0].textContent=q.source||'可用資料';if(spans[1])spans[1].textContent=`漲跌 ${ch>0?'+':''}${F(ch)}`;}
    if(active===code&&$('sheet').classList.contains('show')){$('dTime').textContent=`${q.source||'可用資料'}｜${q.time?.toLocaleString?.('zh-TW')||'—'}`;$('dPrice').textContent=F(q.price);$('dOpen').textContent=F(q.open??row?.OpeningPrice);$('dChange').textContent=`${ch>0?'+':''}${F(ch)}`;$('dChange').className='v '+cls(ch);$('dRange').textContent=`${F(q.high??row?.HighestPrice)} / ${F(q.low??row?.LowestPrice)}`;$('dVolume').textContent=F(q.volume??row?.TradeVolume,0);}
    const state=lastPainted.get(code)||{};lastPainted.set(code,{...state,quote:q});paintChartAsync(code,q,force);return true;
  }

  async function silentRender(allowNetwork=false){
    if(!allowNetwork)return originalRender(false);
    const list=watchlist().map(String);$('watchCount').textContent=list.length;
    // 第一次沒有任何畫面資料時才使用備援；後續 15 秒更新絕不先倒退成備援價，避免閃爍。
    for(const code of list){if(!lastPainted.has(code))paintQuote(code,fallbackQuote(code),true);}
    let live=new Map();try{live=await fetchBatchQuotes(list)}catch{}
    if(live.size){
      for(const code of list){const q=live.get(code);if(q)paintQuote(code,q,false);}
      $('liveBadge').textContent='盤中行情已更新';$('liveBadge').className='liveBadge ok';$('marketStatus').textContent='正常';$('marketTime').textContent=`更新 ${new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    }
    return list.length;
  }

  render=silentRender;

  showSearchResult=async function(code){
    code=String(code);clearError();active=code;const u=universeMap.get(code);if(u){const row=universeRow(code);if(row&&!allRows.find(r=>String(r.Code).trim()===code))allRows.push(row);}
    const base=quoteCache[code]||fallbackQuote(code);quoteCache[code]=base;await show(code,{news:true});$('dTime').textContent=`${base.source||'可用資料'}｜背景更新行情與評分中…`;
    const [liveRes]=await Promise.allSettled([fetchBatchQuotes([code]),history(code)]);if(liveRes.status==='fulfilled'){const q=liveRes.value.get(code);if(q)quoteCache[code]=q;}
    if(active===code&&$('sheet').classList.contains('show')){try{await show(code,{news:false});const q=quoteCache[code]||base;paintChartAsync(code,q,true);}catch{}}
  };

  // 新聞只保留最近 30 天，最多 4 則。
  news=async function(code,name){
    const box=$('news'),state=$('newsState');box.innerHTML='';state.textContent='載入最近一個月新聞…';
    const query=encodeURIComponent(`${name||code} ${code} 股票`),rss=`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`,proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`;
    try{
      const r=await fetch(proxy,{cache:'no-store'});if(!r.ok)throw Error('news');const text=await r.text(),xml=new DOMParser().parseFromString(text,'text/xml'),cutoff=Date.now()-30*24*60*60*1000;
      const items=[...xml.querySelectorAll('item')].filter(it=>{const d=Date.parse(it.querySelector('pubDate')?.textContent||'');return Number.isFinite(d)&&d>=cutoff;}).slice(0,4);
      state.textContent=items.length?'':'最近一個月暫無可讀取新聞。';
      items.forEach(it=>{const title=it.querySelector('title')?.textContent||'新聞',link=it.querySelector('link')?.textContent||'#',date=it.querySelector('pubDate')?.textContent,d=document.createElement('div');d.className='event';d.innerHTML=`<div class="tag">新聞</div><a target="_blank" rel="noopener" href="${link.replaceAll('"','&quot;')}">${title.replaceAll('<','&lt;')}</a>${date?`<div class="date">${new Date(date).toLocaleString('zh-TW')}</div>`:''}`;box.appendChild(d);});
    }catch{state.innerHTML=`最近一個月新聞來源暫時無法直接讀取。<br><a style="color:#a9cbff" target="_blank" rel="noopener" href="https://news.google.com/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW%3Azh-Hant">開啟 ${name||code} 的新聞搜尋</a>`;}
  };

  const p=$('refreshPill');if(p)p.textContent='自動更新：15 秒（靜默整批）';
  // v069: 啟動與 15 秒更新由 index 統一排程，避免與同網域官方快照競爭。
})();
