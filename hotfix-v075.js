(() => {
  let timer=null;
  const N=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const fmt=v=>N(v)==null?'—':N(v).toLocaleString('zh-TW',{maximumFractionDigits:2});

  function paint(price,prev,label,time){
    const p=N(price),y=N(prev);if(p==null)return false;
    const ch=y==null?null:p-y;
    const value=document.getElementById('taiex');
    const info=document.getElementById('taiexChg');
    if(value)value.textContent=fmt(p);
    if(info){
      const t=ch==null?'—':`${ch>0?'+':''}${fmt(ch)}`;
      info.textContent=`${t}｜${label}${time?` ${time}`:''}`;
      info.className='s '+(ch==null?'muted':ch>0?'up':ch<0?'down':'flat');
    }
    window.__TW_TAIEX_SOURCE__={price:p,prev:y,change:ch,label,time,updatedAt:Date.now()};
    return true;
  }

  async function fetchJson(url,timeout=6500){
    const c=new AbortController(),id=setTimeout(()=>c.abort(),timeout);
    try{const r=await fetch(url,{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}
    finally{clearTimeout(id)}
  }

  async function fromRawGithub(){
    try{
      const j=await fetchJson(`https://raw.githubusercontent.com/under855/twstock-ai-monitor/main/data/latest.json?ts=${Date.now()}`,6500);
      const t=j?.taiex,p=N(t?.close),ch=N(t?.change);
      if(p==null)return false;
      const prev=N(t?.previousClose) ?? (ch==null?null:p-ch);
      const date=String(t?.date||'');
      const time=String(t?.time||'');
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const label=date===today?'TWSE 盤中資料':'最近交易日';
      return paint(p,prev,label,time||date);
    }catch{return false;}
  }

  async function fromTwse(){
    const upstream=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0&_=${Date.now()}`;
    const urls=[upstream,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`,`https://proxy.cors.dev/${upstream}`];
    for(const u of urls){
      try{
        const j=await fetchJson(u,6500),m=(j?.msgArray||[]).find(x=>String(x?.c||'')==='t00'||String(x?.ch||'')==='t00.tw')||j?.msgArray?.[0];
        const z=N(m?.z),y=N(m?.y);if(z==null)continue;
        const tm=String(m?.t||m?.['%']||'');
        if(paint(z,y,'TWSE 盤中即時',tm))return true;
      }catch{}
    }
    return false;
  }

  async function fromYahoo(){
    const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?interval=1m&range=1d&includePrePost=false&_=${Date.now()}`;
    const urls=[upstream,`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`];
    for(const u of urls){
      try{
        const j=await fetchJson(u,7000),r=j?.chart?.result?.[0],meta=r?.meta||{};
        let p=N(meta.regularMarketPrice),prev=N(meta.chartPreviousClose??meta.previousClose),tm='';
        const ts=r?.timestamp||[],closes=r?.indicators?.quote?.[0]?.close||[];
        if(p==null&&closes.length){for(let i=closes.length-1;i>=0;i--){if(N(closes[i])!=null){p=N(closes[i]);if(ts[i])tm=new Date(ts[i]*1000).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'});break;}}}
        if(!tm&&meta.regularMarketTime)tm=new Date(meta.regularMarketTime*1000).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        if(p==null)continue;
        if(paint(p,prev,'盤中即時備援',tm))return true;
      }catch{}
    }
    return false;
  }

  async function refreshTaiex(){
    if(await fromTwse())return true;
    if(await fromRawGithub())return true;
    if(await fromYahoo())return true;
    window.__TW_TAIEX_SOURCE__={ok:false,updatedAt:Date.now()};
    return false;
  }

  function boot(){
    refreshTaiex();
    if(timer)clearInterval(timer);
    timer=setInterval(refreshTaiex,15000);
    window.__TW_TAIEX_V075__={enabled:true,interval:15000,rawGithubFallback:true,version:'076'};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
