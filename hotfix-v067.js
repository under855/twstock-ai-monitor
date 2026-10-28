(() => {
  let latestLoaded=false;

  function q(v){
    if(v==null||v==='')return null;
    const n=Number(v);return Number.isFinite(n)?n:null;
  }

  function rowFromLatest(x){
    return {
      Code:String(x.symbol),
      Name:String(x.name||x.symbol),
      ClosingPrice:x.close,
      Change:x.change,
      OpeningPrice:x.open,
      HighestPrice:x.high,
      LowestPrice:x.low,
      TradeVolume:x.volume,
      TradeDate:String(x.tradeDate||'').replaceAll('-','/'),
      Market:x.market
    };
  }

  async function loadSameOriginLatest(){
    const r=await fetch(`./data/latest.json?ts=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`latest.json HTTP ${r.status}`);
    const j=await r.json();
    const symbols=j?.symbols||{};
    const entries=Object.values(symbols);
    if(entries.length<1000)throw new Error(`latest.json symbols too few: ${entries.length}`);

    const officialRows=entries.map(rowFromLatest);
    const esb=allRows.filter(x=>String(x.Market||'')==='ESB');
    allRows=[...officialRows,...esb];

    for(const x of entries){
      const code=String(x.symbol||'').trim();if(!code)continue;
      const old=universeMap.get(code)||{};
      universeMap.set(code,{
        ...old,
        code,
        name:String(x.name||old.name||code),
        market:x.market||old.market||'',
        close:q(x.close),open:q(x.open),high:q(x.high),low:q(x.low),
        volume:q(x.volume),tradeDate:String(x.tradeDate||j.tradeDate||'').replaceAll('-','/'),
        source:x.source||'本站官方行情快照'
      });
      if(x.name)nameCache[code]=String(x.name);
    }

    quoteCache={};
    latestLoaded=true;
    const d=String(j.tradeDate||'').replaceAll('-','/');
    const badge=document.getElementById('liveBadge');
    if(badge){badge.textContent=`官方行情 ${d}`;badge.className='liveBadge ok';}
    const mt=document.getElementById('marketTime');if(mt)mt.textContent=`最近完成交易日 ${d}`;
    const ms=document.getElementById('marketStatus');if(ms)ms.textContent='官方最新資料';

    await render(false);
    render(true).catch(()=>{});
    return j;
  }

  function bootLatest(){
    loadSameOriginLatest().catch(err=>{
      const badge=document.getElementById('liveBadge');
      if(badge){badge.textContent='官方快照讀取失敗';badge.className='liveBadge warn';}
      console.error('[v067 latest]',err);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootLatest,{once:true});
  else bootLatest();

  window.__TW_MONITOR_V067__={sameOriginLatest:true,get loaded(){return latestLoaded;}};
})();
