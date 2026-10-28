(() => {
  const baseShow = show;
  const etfCache = { loaded:false, rows:[], loading:null };
  const eventCache = { loaded:false, rows:[], loading:null };
  const longHistoryCache = new Map();

  function isoDate(value){
    if(!value) return null;
    const raw=String(value).trim();
    const digits=raw.replace(/\D/g,'');
    let y,m,d;
    if(/^\d{7}$/.test(digits)){
      y=Number(digits.slice(0,3))+1911;m=Number(digits.slice(3,5));d=Number(digits.slice(5,7));
    }else if(/^\d{8}$/.test(digits)){
      y=Number(digits.slice(0,4));m=Number(digits.slice(4,6));d=Number(digits.slice(6,8));
    }else{
      const dt=dateObj(raw);if(!dt)return null;
      y=dt.getFullYear();m=dt.getMonth()+1;d=dt.getDate();
    }
    const dt=new Date(y,m-1,d);if(Number.isNaN(dt.getTime()))return null;
    return `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}`;
  }

  function dateMs(v){const s=isoDate(v);return s?new Date(s.replaceAll('/','-')+'T00:00:00').getTime():NaN;}
  function num(v){const x=N(v);return x==null?null:x;}
  function sumNums(...vals){const a=vals.map(num).filter(v=>v!=null);return a.length?a.reduce((s,v)=>s+v,0):null;}
  function fmtMoney(v){const x=num(v);return x==null?'尚未公告':`${F(x,4)} 元`;}
  function isEtfCode(code){return /^00\d{2,4}[A-Z]?$/.test(String(code).toUpperCase());}
  function eventLabel(e){
    if(e?.eventType==='distribution') return '股利分派';
    const k=String(e?.kind||e?.eventText||'');
    if(k.includes('權')&&k.includes('息'))return '除權息';
    if(k.includes('權'))return '除權';
    if(k.includes('息'))return '除息';
    const hasCash=(e.cashDividend??0)>0,hasStock=(e.stockDividendRatio??0)>0||(e.stockSharesPer1000??0)>0;
    if(hasCash&&hasStock)return '除權息';if(hasStock)return '除權';return '除息';
  }
  function first(obj,keys){for(const k of keys){if(obj?.[k]!=null&&String(obj[k]).trim()!=='')return obj[k];}return null;}

  async function loadEtfRows(){
    if(etfCache.loaded&&etfCache.rows.length)return etfCache.rows;
    if(etfCache.loading)return etfCache.loading;
    etfCache.loading=(async()=>{
      try{
        const r=await fetch(`./data/dividends.json?ts=${Date.now()}`,{cache:'no-store'});
        if(r.ok){
          const j=await r.json(),rows=Array.isArray(j?.items)?j.items:[];
          if(rows.length){etfCache.rows=rows;etfCache.loaded=true;return rows;}
        }
      }catch{}
      try{
        const end=new Date(),start=new Date(end);start.setFullYear(start.getFullYear()-1);
        const ymd=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        const url=`https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=&startDate=${ymd(start)}&endDate=${ymd(end)}&response=json`;
        const j=await jsonPublic(url,9000),rows=Array.isArray(j?.data)?j.data:[];
        const parsed=rows.filter(r=>Array.isArray(r)&&r.length>=6).map(r=>({
          code:String(r[0]||'').trim(),name:String(r[1]||'').trim(),type:'ETF',market:'TWSE',
          exDate:isoDate(r[2]),recordDate:isoDate(r[3]),paymentDate:isoDate(r[4]),cashDividend:num(r[5]),stockDividendRatio:null,source:'TWSE ETF 收益分配',eventType:'ex-dividend'
        })).filter(x=>x.code&&x.exDate);
        if(parsed.length){etfCache.rows=parsed;etfCache.loaded=true;}
      }catch{}
      return etfCache.rows;
    })().finally(()=>{etfCache.loading=null});
    return etfCache.loading;
  }

  async function loadCorporateEvents(){
    if(eventCache.loaded&&eventCache.rows.length)return eventCache.rows;
    if(eventCache.loading)return eventCache.loading;
    eventCache.loading=(async()=>{
      // v070: 正式資料優先讀本站由 GitHub 端預先整理的官方資料，避免手機跨網域失敗。
      try{
        const r=await fetch(`./data/dividends.json?ts=${Date.now()}`,{cache:'no-store'});
        if(r.ok){
          const j=await r.json(),rows=Array.isArray(j?.items)?j.items:[];
          if(rows.length){eventCache.rows=rows;eventCache.loaded=true;return rows;}
        }
      }catch{}
      const [twsePre,tpexPre,tpexDaily,twseDist]=await Promise.allSettled([
        jsonPublic('https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL',7000),
        jsonPublic('https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost',7000),
        jsonPublic('https://www.tpex.org.tw/openapi/v1/tpex_exright_daily',7000),
        jsonPublic('https://openapi.twse.com.tw/v1/opendata/t187ap45_L',9000)
      ]);
      const out=[];

      if(twsePre.status==='fulfilled'&&Array.isArray(twsePre.value)){
        for(const r of twsePre.value){
          const code=String(r.Code||'').trim(),exDate=isoDate(r.Date);if(!code||!exDate)continue;
          out.push({code,name:String(r.Name||'').trim(),market:'TWSE',exDate,cashDividend:num(r.CashDividend),stockDividendRatio:num(r.StockDividendRatio),eventText:String(r.Exdividend||''),source:'TWSE 除權除息預告',eventType:'ex-event'});
        }
      }

      if(tpexPre.status==='fulfilled'&&Array.isArray(tpexPre.value)){
        for(const r of tpexPre.value){
          const code=String(first(r,['SecuritiesCompanyCode','Code','股票代號','代號'])||'').trim();
          const exDate=isoDate(first(r,['ExRrightsExDividendDate','Date','除權息日期','資料日期']));if(!code||!exDate)continue;
          out.push({code,name:String(first(r,['CompanyName','Name','股票名稱'])||'').trim(),market:'TPEx',exDate,cashDividend:num(first(r,['CashDividend','現金股利','息值'])),stockDividendRatio:num(first(r,['StockDividendRatio','無償配股率','股票股利'])),eventText:String(first(r,['ExRrightsExDividend','Exdividend','權息'])||''),source:'TPEx 除權除息預告',eventType:'ex-event'});
        }
      }

      if(tpexDaily.status==='fulfilled'&&Array.isArray(tpexDaily.value)){
        for(const r of tpexDaily.value){
          const code=String(first(r,['SecuritiesCompanyCode','Code','股票代號','代號'])||'').trim();
          const exDate=isoDate(first(r,['ExRrightsExDividendDate','Date','除權息日期','資料日期']));if(!code||!exDate)continue;
          out.push({code,name:String(first(r,['CompanyName','Name','股票名稱'])||'').trim(),market:'TPEx',exDate,cashDividend:num(first(r,['CashDividend','現金股利','息值'])),stockDividendRatio:num(first(r,['StockDividendRatio','無償配股率','股票股利'])),eventText:String(first(r,['ExRrightsExDividend','Exdividend','權息'])||''),source:'TPEx 除權除息結果',eventType:'ex-event'});
        }
      }

      if(twseDist.status==='fulfilled'&&Array.isArray(twseDist.value)){
        for(const r of twseDist.value){
          const code=String(r['公司代號']||r.Code||'').trim();if(!code)continue;
          const cash=sumNums(
            r['股東配發-盈餘分配之現金股利(元/股)'],
            r['股東配發-法定盈餘公積發放之現金(元/股)'],
            r['股東配發-資本公積發放之現金(元/股)']
          );
          const stock=sumNums(
            r['股東配發-盈餘轉增資配股(元/股)'],
            r['股東配發-法定盈餘公積轉增資配股(元/股)'],
            r['股東配發-資本公積轉增資配股(元/股)']
          );
          if((cash??0)===0&&(stock??0)===0)continue;
          out.push({
            code,name:String(r['公司名稱']||'').trim(),market:'TWSE',exDate:null,
            decisionDate:isoDate(r['董事會（擬議）股利分派日']||r['股東會日期']),
            dividendYear:String(r['股利年度']||''),cashDividend:cash,stockDividendRatio:stock,
            source:'TWSE 股利分派情形',eventType:'distribution',status:String(r['決議（擬議）進度']||'')
          });
        }
      }

      for(const r of (Array.isArray(allEx)?allEx:[])){
        const code=String(r.Code??r.股票代號??r['股票代號']??'').trim();
        const exDate=isoDate(r.Date||r['除權息日期']||r['除權交易日']||r['除息交易日']||r['日期']||r['資料日期']);
        if(!code||!exDate)continue;
        out.push({code,name:String(r.Name||r['股票名稱']||'').trim(),market:'TWSE',exDate,cashDividend:num(r.CashDividend||r['現金股利']||r['息值']),stockDividendRatio:num(r.StockDividendRatio||r['股票股利']||r['權值']),source:'TWSE 已載入除權息資料',eventType:'ex-event'});
      }

      if(out.length){eventCache.rows=out;eventCache.loaded=true;}
      return eventCache.rows;
    })().finally(()=>{eventCache.loading=null});
    return eventCache.loading;
  }

  async function longHistory(code){
    code=String(code);if(longHistoryCache.has(code))return longHistoryCache.get(code);
    const task=(async()=>{
      const market=universeMap.get(code)?.market,suffix=market==='TPEx'||code==='3293'?'.TWO':'.TW';
      try{
        const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code+suffix)}?interval=1d&range=1y&includePrePost=false`;
        const j=await jsonPublic(url,7000),r=j?.chart?.result?.[0];
        if(r){const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{},out=[];for(let i=0;i<ts.length;i++){const close=num(q.close?.[i]);if(close==null)continue;const d=new Date(ts[i]*1000);out.push({date:`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`,open:num(q.open?.[i]),high:num(q.high?.[i]),low:num(q.low?.[i]),close,volume:num(q.volume?.[i])});}if(out.length)return out;}
      }catch{}
      try{return await history(code)}catch{return []}
    })();
    longHistoryCache.set(code,task);return task;
  }

  function fillStatus(event,h){
    const target=num(event?.fillTarget??event?.preClose);
    const kind=event?.fillKind||(eventLabel(event)==='除權'?'填權':eventLabel(event)==='除權息'?'填權息':'填息');
    if(event?.fillState==='filled'&&num(event.fillTradingDays)!=null){
      const days=Math.round(num(event.fillTradingDays));
      return {text:`${days} 個交易日完成${kind}${event.fillDate?`（${event.fillDate}）`:''}`,days,target};
    }
    if(event?.fillState==='unfilled'){
      const observed=num(event.fillTradingDays)!=null?Math.round(num(event.fillTradingDays)):null;
      const suffix=[event.checkedThrough?`截至 ${event.checkedThrough}`:'',observed!=null?`已觀察 ${observed} 個交易日`:''].filter(Boolean).join('，');
      return {text:`尚未${kind}${suffix?`（${suffix}）`:''}`,days:null,target};
    }
    if(!event?.exDate||!Array.isArray(h)||h.length<2)return {text:'資料不足',days:null,target};
    const ex=dateMs(event.exDate);if(!Number.isFinite(ex))return {text:'資料不足',days:null,target};
    const rows=h.map(x=>({...x,ms:dateMs(x.date)})).filter(x=>Number.isFinite(x.ms)).sort((a,b)=>a.ms-b.ms);
    const prev=[...rows].reverse().find(x=>x.ms<ex&&num(x.close)!=null);if(!prev)return {text:'資料不足',days:null,target};
    const after=rows.filter(x=>x.ms>=ex);if(!after.length)return {text:'尚無除權息後交易資料',days:null,target:prev.close};
    const hit=after.findIndex(x=>(num(x.high)??num(x.close))>=prev.close);
    return hit>=0?{text:`${hit+1} 個交易日完成${kind}`,days:hit+1,target:prev.close}:{text:`尚未${kind}`,days:null,target:prev.close};
  }

  function dedupeEvents(rows){
    const m=new Map();
    for(const e of rows){
      const key=e.eventType==='distribution'?`${e.code}|dist|${e.dividendYear}|${e.decisionDate||''}`:`${e.code}|${e.exDate}`;
      const old=m.get(key);
      if(!old){m.set(key,e);continue;}
      m.set(key,{...old,...e,
        cashDividend:e.cashDividend??old.cashDividend,
        stockDividendRatio:e.stockDividendRatio??old.stockDividendRatio,
        stockSharesPer1000:e.stockSharesPer1000??old.stockSharesPer1000,
        paymentDate:e.paymentDate??old.paymentDate,recordDate:e.recordDate??old.recordDate,
        preClose:e.preClose??old.preClose,fillTarget:e.fillTarget??old.fillTarget,
        fillState:e.fillState??old.fillState,fillDate:e.fillDate??old.fillDate,
        fillTradingDays:e.fillTradingDays??old.fillTradingDays,fillKind:e.fillKind??old.fillKind,
        checkedThrough:e.checkedThrough??old.checkedThrough,kind:e.kind??old.kind
      });
    }
    return [...m.values()];
  }

  function eventHtml(e,fill){
    const cash=e.cashDividend!=null?`<div>現金股利／配息：${fmtMoney(e.cashDividend)}</div>`:'';
    const stock=e.stockSharesPer1000!=null&&e.stockSharesPer1000!==0?`<div>股票股利／配股：每千股配 ${F(e.stockSharesPer1000,4)} 股</div>`:(e.stockDividendRatio!=null&&e.stockDividendRatio!==0?`<div>股票股利／配股：${F(e.stockDividendRatio,4)} 元／股</div>`:'');
    const payment=e.paymentDate?`<div>發放日：${e.paymentDate}</div>`:'';
    const record=e.recordDate?`<div>基準日：${e.recordDate}</div>`:'';
    const decision=e.decisionDate?`<div>決議／擬議日：${e.decisionDate}</div>`:'';
    const status=e.status?`<div>進度：${e.status}</div>`:'';
    const dateLine=e.exDate?`<b>${e.exDate}</b>`:(e.dividendYear?`<b>${e.dividendYear} 年度股利</b>`:'');
    const fillText=fill?`<div><b>${fill.text}</b>${fill.target!=null?`（填回目標 ${F(fill.target)}）`:''}</div>`:'';
    const note=e.exDate?'<div class="date">填權息日數依日線最高價首次回到除權息前一交易日收盤價計算。</div>':'';
    return `<div class="event"><div class="tag">${eventLabel(e)}｜${e.source||'官方資料'}</div>${dateLine}${cash}${stock}${record}${payment}${decision}${status}${fillText}${note}</div>`;
  }

  async function renderDividendDetail(code){
    code=String(code);if(active!==code)return;
    const box=$('dividendEvents');if(!box)return;
    const card=box.closest('.card'),title=card?.querySelector('h3');
    const etf=isEtfCode(code);
    if(title)title.textContent=etf?'近一年配股／配息（最近 3 次）':'配股／配息與填權息紀錄（最近 3 次）';
    box.innerHTML='<div class="muted small">載入官方配股配息資料…</div>';

    const etfs=await loadEtfRows();
    let corp=[];
    if(!etf)corp=await loadCorporateEvents();
    if(active!==code)return;
    let rows=[];
    if(etf)rows.push(...etfs.filter(x=>x.code===code));
    else rows.push(...corp.filter(x=>x.code===code));
    rows=dedupeEvents(rows);

    const now=Date.now(),yearAgo=now-366*86400000;
    let dated=rows.filter(e=>e.exDate&&dateMs(e.exDate)<=now+90*86400000);
    if(etf)dated=dated.filter(e=>dateMs(e.exDate)>=yearAgo&&dateMs(e.exDate)<=now);
    dated=dated.sort((a,b)=>dateMs(b.exDate)-dateMs(a.exDate)).slice(0,3);
    const distributions=etf?[]:rows.filter(e=>e.eventType==='distribution').sort((a,b)=>(dateMs(b.decisionDate)||0)-(dateMs(a.decisionDate)||0)).slice(0,Math.max(0,3-dated.length));

    const renderRows=h=>{
      if(active!==code)return;
      box.innerHTML='';
      for(const e of dated)box.insertAdjacentHTML('beforeend',eventHtml(e,dateMs(e.exDate)<=now?fillStatus(e,h||[]):null));
      for(const e of distributions)box.insertAdjacentHTML('beforeend',eventHtml(e,null));
      if(!box.innerHTML)box.innerHTML='<div class="muted small">目前官方資料中沒有可讀取的配股／配息紀錄。</div>';
    };

    const cached=historyCache[code]||[];
    renderRows(cached);
    const browserQa=new URLSearchParams(location.search).get('browserqa')==='1';
    const needsFallbackHistory=dated.some(e=>dateMs(e.exDate)<=now&&!['filled','unfilled'].includes(e.fillState));
    if(!browserQa&&needsFallbackHistory){
      longHistory(code).then(h=>{if(Array.isArray(h)&&h.length)renderRows(h)}).catch(()=>{});
    }
  }

  show=async function(code,opts={}){
    await baseShow(code,opts);
    renderDividendDetail(String(code)).catch(()=>{
      if(active===String(code)&&$('dividendEvents'))$('dividendEvents').innerHTML='<div class="muted small">配股配息資料暫時無法讀取，稍後重新開啟個股頁會自動重試。</div>';
    });
  };
})();
