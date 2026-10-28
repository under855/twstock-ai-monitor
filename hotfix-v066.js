(() => {
  const previousScoreStock=scoreStock;
  let latestOfficialDate=null;

  function normalizeIsoDate(v){
    if(!v)return null;
    const s=String(v).trim();
    const m=s.match(/^(\d{2,3})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if(m)return `${Number(m[1])+1911}/${String(Number(m[2])).padStart(2,'0')}/${String(Number(m[3])).padStart(2,'0')}`;
    const d=new Date(s.replaceAll('/','-'));
    if(Number.isNaN(d.getTime()))return null;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }

  function dateKey(v){return normalizeIsoDate(v)?.replaceAll('/','')||'';}

  async function fetchLatestTradeDate(){
    try{
      const j=await jsonPublic(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json&_=${Date.now()}`,7000);
      const rows=Array.isArray(j?.data)?j.data:[];
      const last=rows.at(-1)?.[0];
      return normalizeIsoDate(last);
    }catch{return null;}
  }

  function updateUniverseFromRow(row,market,tradeDate){
    const code=String(row?.Code||row?.SecuritiesCompanyCode||'').trim();
    if(!code)return;
    const old=universeMap.get(code)||{code,name:String(row?.Name||row?.CompanyName||code).trim(),market};
    const next={...old,
      code,
      name:String(row?.Name||row?.CompanyName||old.name||code).trim(),
      market:market||old.market,
      close:N(row?.ClosingPrice??row?.Close??row?.ClosePrice??row?.LatestPrice),
      open:N(row?.OpeningPrice??row?.Open??row?.OpenPrice),
      high:N(row?.HighestPrice??row?.High??row?.HighPrice),
      low:N(row?.LowestPrice??row?.Low??row?.LowPrice),
      volume:N(row?.TradeVolume??row?.TradingShares),
      tradeDate:tradeDate||old.tradeDate,
      source:market==='TPEx'?'TPEx 官方最新行情':'TWSE 官方最新行情'
    };
    universeMap.set(code,next);
    if(next.name)nameCache[code]=next.name;
  }

  async function refreshOfficialLatest(){
    const [dateRes,twseRes,tpexRes,valRes]=await Promise.allSettled([
      fetchLatestTradeDate(),
      jsonPublic(`${API.daily}?_=${Date.now()}`,7000),
      jsonPublic(`${API.otc}?_=${Date.now()}`,7000),
      jsonPublic(`${API.val}?_=${Date.now()}`,7000)
    ]);
    latestOfficialDate=dateRes.status==='fulfilled'?dateRes.value:null;
    const twse=twseRes.status==='fulfilled'&&Array.isArray(twseRes.value)?twseRes.value:[];
    const tpexRaw=tpexRes.status==='fulfilled'&&Array.isArray(tpexRes.value)?tpexRes.value:[];
    const tpex=normalizeTpexRows(tpexRaw);
    if(twse.length||tpex.length){
      allRows=[...twse,...tpex.filter(o=>!twse.some(t=>String(t.Code).trim()===o.Code))];
      for(const r of twse)updateUniverseFromRow(r,'TWSE',latestOfficialDate);
      for(const r of tpex)updateUniverseFromRow(r,'TPEx',latestOfficialDate);
    }
    if(valRes.status==='fulfilled'&&Array.isArray(valRes.value)&&valRes.value.length)allVals=valRes.value;
    quoteCache={};
    await render(false);
    render(true).catch(()=>{});
    const pill=document.getElementById('marketTime');
    if(pill&&latestOfficialDate)pill.textContent=`最近完成交易日 ${latestOfficialDate}`;
  }

  scoreStock=function(row,val,h,quote){
    const source=String(quote?.source||'');
    const qDate=quote?.time instanceof Date&&!Number.isNaN(quote.time.getTime())
      ?`${quote.time.getFullYear()}/${String(quote.time.getMonth()+1).padStart(2,'0')}/${String(quote.time.getDate()).padStart(2,'0')}`
      :normalizeIsoDate(row?.TradeDate);
    if(latestOfficialDate&&!source.includes('盤中')&&qDate&&dateKey(qDate)<dateKey(latestOfficialDate)){
      return {total:null,delta:null,trend:null,momentum:null,valuation:null,income:null,mode:'資料過期',available:0,confidence:'低'};
    }
    return previousScoreStock(row,val,h,quote);
  };

  let ran=false;
  const start=()=>{
    if(ran)return;
    ran=true;
    refreshOfficialLatest().catch(()=>{
      const badge=document.getElementById('liveBadge');
      if(badge){badge.textContent='最新官方資料讀取失敗';badge.className='liveBadge warn';}
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.__TW_MONITOR_V066__={officialRefreshOnOpen:true,rejectStaleScore:true};
})();
