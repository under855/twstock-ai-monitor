(() => {
  const baseShow = show;
  const etfCache = { loaded:false, rows:[] };
  const eventCache = { loaded:false, rows:[] };
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
  function fmtMoney(v){const x=num(v);return x==null?'尚未公告':`${F(x,4)} 元`;}
  function isEtfCode(code){return /^00\d{3}[A-Z]?$/.test(String(code).toUpperCase());}
  function eventLabel(e){const hasCash=(e.cashDividend??0)>0,hasStock=(e.stockDividendRatio??0)>0;if(hasCash&&hasStock)return '除權息';if(hasStock)return '除權';return '除息';}

  async function loadEtfRows(){
    if(etfCache.loaded)return etfCache.rows;
    etfCache.loaded=true;
    try{
      const y=new Date().getFullYear();
      const url=`https://www.twse.com.tw/rwd/zh/ETF/etfDiv?startDate=2005&endDate=${y}&response=json`;
      const j=await jsonPublic(url,9000),rows=Array.isArray(j?.data)?j.data:[];
      etfCache.rows=rows.filter(r=>Array.isArray(r)&&r.length>=8).map(r=>({
        code:String(r[0]||'').trim(),name:String(r[1]||'').trim(),type:'ETF',market:'TWSE',
        exDate:isoDate(r[2]),recordDate:isoDate(r[3]),paymentDate:isoDate(r[4]),cashDividend:num(r[5]),stockDividendRatio:null,source:'TWSE ETF 收益分配'
      })).filter(x=>x.code&&x.exDate);
    }catch{etfCache.rows=[];}
    return etfCache.rows;
  }

  async function loadCorporateEvents(){
    if(eventCache.loaded)return eventCache.rows;
    eventCache.loaded=true;
    const [twse,tpex]=await Promise.allSettled([
      jsonPublic('https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL',7000),
      jsonPublic('https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost',7000)
    ]);
    const out=[];
    if(twse.status==='fulfilled'&&Array.isArray(twse.value)){
      for(const r of twse.value){
        const code=String(r.Code||'').trim(),exDate=isoDate(r.Date);if(!code||!exDate)continue;
        out.push({code,name:String(r.Name||'').trim(),type:'SECURITY',market:'TWSE',exDate,cashDividend:num(r.CashDividend),stockDividendRatio:num(r.StockDividendRatio),eventText:String(r.Exdividend||''),source:'TWSE 除權除息預告'});
      }
    }
    if(tpex.status==='fulfilled'&&Array.isArray(tpex.value)){
      for(const r of tpex.value){
        const code=String(r.SecuritiesCompanyCode||r.Code||'').trim(),exDate=isoDate(r.ExRrightsExDividendDate||r.Date);if(!code||!exDate)continue;
        out.push({code,name:String(r.CompanyName||r.Name||'').trim(),type:'SECURITY',market:'TPEx',exDate,cashDividend:num(r.CashDividend),stockDividendRatio:num(r.StockDividendRatio),eventText:String(r.ExRrightsExDividend||r.Exdividend||''),source:'TPEx 除權除息預告'});
      }
    }
    eventCache.rows=out;
    return out;
  }

  async function longHistory(code){
    code=String(code);if(longHistoryCache.has(code))return longHistoryCache.get(code);
    const task=(async()=>{
      const market=universeMap.get(code)?.market, suffix=market==='TPEx'||code==='3293'?'.TWO':'.TW';
      try{
        const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code+suffix)}?interval=1d&range=1y&includePrePost=false`;
        const j=await jsonPublic(url,7000),r=j?.chart?.result?.[0];
        if(r){
          const ts=r.timestamp||[],q=r.indicators?.quote?.[0]||{},out=[];
          for(let i=0;i<ts.length;i++){
            const close=num(q.close?.[i]);if(close==null)continue;
            const d=new Date(ts[i]*1000);
            out.push({date:`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`,open:num(q.open?.[i]),high:num(q.high?.[i]),low:num(q.low?.[i]),close,volume:num(q.volume?.[i])});
          }
          if(out.length)return out;
        }
      }catch{}
      try{return await history(code)}catch{return []}
    })();
    longHistoryCache.set(code,task);return task;
  }

  function fillStatus(event,h){
    if(!event?.exDate||!Array.isArray(h)||h.length<2)return {text:'資料不足',days:null};
    const ex=dateMs(event.exDate);if(!Number.isFinite(ex))return {text:'資料不足',days:null};
    const rows=h.map(x=>({...x,ms:dateMs(x.date)})).filter(x=>Number.isFinite(x.ms)).sort((a,b)=>a.ms-b.ms);
    const prev=[...rows].reverse().find(x=>x.ms<ex&&num(x.close)!=null);
    if(!prev)return {text:'資料不足',days:null};
    const after=rows.filter(x=>x.ms>=ex);
    if(!after.length)return {text:'尚無除權息後交易資料',days:null};
    const hit=after.findIndex(x=>(num(x.high)??num(x.close))>=prev.close);
    const kind=eventLabel(event)==='除權'?'填權':eventLabel(event)==='除權息'?'填權息':'填息';
    return hit>=0?{text:`${hit+1} 個交易日完成${kind}`,days:hit+1,target:prev.close}:{text:`尚未${kind}`,days:null,target:prev.close};
  }

  function dedupeEvents(rows){
    const m=new Map();
    for(const e of rows){
      const key=`${e.code}|${e.exDate}`;const old=m.get(key);
      if(!old){m.set(key,e);continue;}
      m.set(key,{...old,...e,cashDividend:e.cashDividend??old.cashDividend,stockDividendRatio:e.stockDividendRatio??old.stockDividendRatio,paymentDate:e.paymentDate??old.paymentDate,recordDate:e.recordDate??old.recordDate});
    }
    return [...m.values()];
  }

  function eventHtml(e,fill){
    const cash=e.cashDividend!=null?`<div>現金配息：${fmtMoney(e.cashDividend)}</div>`:'';
    const stock=e.stockDividendRatio!=null&&e.stockDividendRatio!==0?`<div>股票股利／配股：${F(e.stockDividendRatio,4)}</div>`:'';
    const payment=e.paymentDate?`<div>發放日：${e.paymentDate}</div>`:'';
    const record=e.recordDate?`<div>基準日：${e.recordDate}</div>`:'';
    const fillText=fill?`<div><b>${fill.text}</b>${fill.target!=null?`（填回目標 ${F(fill.target)}）`:''}</div>`:'';
    return `<div class="event"><div class="tag">${eventLabel(e)}｜${e.source||'官方資料'}</div><b>${e.exDate}</b>${cash}${stock}${record}${payment}${fillText}<div class="date">填權息日數依日線最高價首次回到除權息前一交易日收盤價計算。</div></div>`;
  }

  async function renderDividendDetail(code){
    code=String(code);if(active!==code)return;
    const box=$('dividendEvents');if(!box)return;
    const card=box.closest('.card');const title=card?.querySelector('h3');if(title)title.textContent='配股／配息與填權息紀錄';
    box.innerHTML='<div class="muted small">載入官方配股配息資料…</div>';

    const [etfs,corp,h]=await Promise.all([loadEtfRows(),loadCorporateEvents(),longHistory(code)]);
    if(active!==code)return;
    let rows=[];
    if(isEtfCode(code))rows.push(...etfs.filter(x=>x.code===code));
    rows.push(...corp.filter(x=>x.code===code));
    rows=dedupeEvents(rows).sort((a,b)=>dateMs(b.exDate)-dateMs(a.exDate));

    const now=Date.now();
    if(isEtfCode(code)){
      const etfRows=etfs.filter(x=>x.code===code&&x.paymentDate).sort((a,b)=>dateMs(a.paymentDate)-dateMs(b.paymentDate));
      const next=etfRows.find(x=>dateMs(x.paymentDate)>=now);
      const past=[...etfRows].reverse().find(x=>dateMs(x.paymentDate)<now);
      const cards=[];
      if(next)cards.push(`<div class="event"><div class="tag">ETF 下一次收益分配</div><b>${next.paymentDate} 發放</b><div>每單位：${fmtMoney(next.cashDividend)}</div><div>除息日：${next.exDate}</div></div>`);
      if(past)cards.push(`<div class="event"><div class="tag">ETF 最近一次收益分配</div><b>${past.paymentDate} 發放</b><div>每單位：${fmtMoney(past.cashDividend)}</div><div>除息日：${past.exDate}</div></div>`);
      if(cards.length)box.innerHTML=cards.join('');else box.innerHTML='<div class="muted small">目前沒有可讀取的 ETF 收益分配紀錄。</div>';
    }else{
      box.innerHTML='';
    }

    const recent=rows.filter(e=>dateMs(e.exDate)<=now+90*86400000).slice(0,5);
    if(recent.length){
      const html=recent.map(e=>eventHtml(e,dateMs(e.exDate)<=now?fillStatus(e,h):null)).join('');
      box.insertAdjacentHTML('beforeend',html);
    }else if(!box.innerHTML){
      box.innerHTML='<div class="muted small">目前官方資料中沒有近期配股／配息紀錄。</div>';
    }
  }

  show=async function(code,opts={}){
    await baseShow(code,opts);
    renderDividendDetail(String(code)).catch(()=>{
      if(active===String(code)&&$('dividendEvents'))$('dividendEvents').innerHTML='<div class="muted small">配股配息資料暫時無法讀取。</div>';
    });
  };
})();
