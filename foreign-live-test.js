(() => {
  'use strict';
  const num=s=>{const v=String(s??'').trim().replace(/[,$¥]/g,'').replace('−','-');return v&&Number.isFinite(Number(v))?Number(v):null};
  function paintQuote(id,price,change,currency){
    const p=document.getElementById(id+'Price'),c=document.getElementById(id+'Change');
    const direction=change>0?'up':change<0?'down':'flat';
    const fmt=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:2});
    p.textContent=currency+fmt(price);p.className=direction;
    c.textContent=change==null?'—':(change>0?'+':'')+fmt(change);
    c.className='foreignChange '+direction;
  }
  const stocks=[['NVDA','NVIDIA'],['AAPL','蘋果']];
  const states=new Map();
  function style(){if(document.getElementById('officialValidationStyle'))return;const s=document.createElement('style');s.id='officialValidationStyle';s.textContent=`.foreignValidation{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:9px 0 13px}.foreignCard{background:linear-gradient(145deg,#10223a,#0b1828);border:1px solid #213954;border-radius:15px;padding:13px}.foreignCard h3{font-size:16px;margin:3px 0 9px}.foreignTop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.foreignStatus{font-size:11px;font-weight:800}.foreignGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.foreignMetric small{display:block;color:#93a9c2;font-size:10px}.foreignMetric b{display:block;margin-top:2px}.foreignChange{margin-inline-start:7px;font-size:12px;white-space:nowrap}.sourceNote{font-size:10px;color:#93a9c2;line-height:1.5;margin-top:7px}.state-ok{color:#63d49a}.state-delay{color:#ffd166}.state-warn{color:#ff8b8b}@media(max-width:720px){.foreignValidation{grid-template-columns:1fr}.foreignGrid{grid-template-columns:1fr 1fr}}`;document.head.appendChild(s)}
  function mount(){style();if(document.getElementById('officialValidation'))return;const anchor=document.querySelector('.sectionTitle');if(!anchor)return;const box=document.createElement('section');box.id='officialValidation';box.className='foreignValidation';box.innerHTML=stocks.map(([symbol,name])=>{const id=symbol.toLowerCase();return `<article class="foreignCard" id="${id}Validation"><div class="foreignTop"><div><small>美股即時驗證｜Nasdaq 官方資料</small><h3>${name} <span style="color:#93a9c2">${symbol}</span></h3></div><span class="foreignStatus" id="${id}Status">讀取中</span></div><div class="foreignGrid"><div class="foreignMetric"><small>最新價</small><b><span id="${id}Price">—</span><span id="${id}Change" class="foreignChange" aria-label="漲跌金額">—</span></b></div><div class="foreignMetric"><small>Nasdaq 原始時間</small><b id="${id}SourceTime">—</b></div><div class="foreignMetric"><small>市場狀態</small><b id="${id}Market">—</b></div><div class="foreignMetric"><small>有效新資料</small><b id="${id}Count">0</b></div></div><div class="sourceNote">來源：Nasdaq 官方 Quote API；瀏覽器透過 r.jina.ai 讀取官方回應。來源時間或報價變動才計為新資料。</div></article>`}).join('');anchor.parentNode.insertBefore(box,anchor)}
  async function quoteStock(symbol,signal){const u='https://r.jina.ai/https://api.nasdaq.com/api/quote/'+symbol+'/info?assetclass=stocks&_='+Date.now(),r=await fetch(u,{cache:'no-store',signal});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text(),i=t.indexOf('{');if(i<0)throw Error('Nasdaq JSON missing');const j=JSON.parse(t.slice(i)),d=j?.data,p=d?.primaryData;if(!p||d.symbol!==symbol)throw Error('Nasdaq payload missing');const price=num(p.lastSalePrice),ts=String(p.lastTradeTimestamp||'');if(price==null||price<=0||!ts.trim())throw Error('Nasdaq quote missing');const id=symbol.toLowerCase(),change=num(p.netChange),key=JSON.stringify([ts,price,change]);const previous=states.get(symbol);const count=(previous?.count||0)+(key!==previous?.key?1:0);states.set(symbol,{key,count});paintQuote(id,price,change,'USD ');document.getElementById(id+'SourceTime').textContent=ts;document.getElementById(id+'Market').textContent=String(d.marketStatus||'—');document.getElementById(id+'Count').textContent=String(count);const st=document.getElementById(id+'Status');st.textContent=p.isRealTime===true?'Nasdaq 標示即時':'Nasdaq 未標示即時';st.className='foreignStatus '+(p.isRealTime===true?'state-ok':'state-delay')}
  const runners=new Map();
  window.__TW_US_REFRESH__=symbol=>runners.get(symbol)?.();
  function start(){
    mount();
    for(const [symbol] of stocks){
      let pending=false;
      const run=async()=>{
        if(pending||document.visibilityState==='hidden')return;
        pending=true;
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),3400);
        try{
          await quoteStock(symbol,controller.signal);window.__TW_UPDATE_HEALTH__?.('美股 '+symbol,true);
        }catch(error){
          const status=document.getElementById(symbol.toLowerCase()+'Status');
          if(status){
            status.textContent='更新失敗｜保留上次報價';
            status.className='foreignStatus state-warn';
          }
          window.__TW_UPDATE_HEALTH__?.('美股 '+symbol,false);
        }finally{
          clearTimeout(timer);
          pending=false;
        }
      };
      runners.set(symbol,run);
      run();
      // The Nasdaq relay is not a low-latency feed. Reduce proxy traffic and recheck on resume.
      setInterval(run,60000); // Third-party Nasdaq relay cannot promise four-second updates.
      addEventListener('focus',run);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)run()});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* TAIEX last official close: show on holidays/after hours only.
   During 08:55-13:35 the live controller exclusively owns the index surface.
   A TWSE MIS midday snapshot inside data/latest.json is NOT an official closing price. */
(() => {
  'use strict';
  const tw=()=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23'}).formatToParts(new Date());
    const p=n=>parts.find(x=>x.type===n)?.value||'';
    return {weekday:p('weekday'),minute:Number(p('hour'))*60+Number(p('minute'))};
  };
  const inTradingWindow=()=>{
    const t=tw();
    return !['Sat','Sun'].includes(t.weekday)&&t.minute>=8*60+55&&t.minute<=13*60+35;
  };
  const fmt=(v,d=2)=>Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
  const cls=v=>Number(v)>0?'up':Number(v)<0?'down':'flat';
  let latest=null;
  async function loadLatest(){
    try{
      const r=await fetch('./data/latest.json?_='+Date.now(),{cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json(),x=j?.taiex;
      if(x?.source!=='TWSE MI_INDEX'||x?.time!=='13:30:00'||!Number.isFinite(Number(x.close))||!/^20\d{2}-\d{2}-\d{2}$/.test(String(x.date||'')))return;
      latest={date:String(x.date),price:Number(x.close),change:x.change==null?null:Number(x.change),time:String(x.time),source:'TWSE 官方收盤'};
    }catch{}
  }
  function paint(){
    // Never overwrite a newer tick (or a clear stale warning) with a delayed snapshot.
    if(inTradingWindow()||!latest)return;
    const live=window.__TW_LIVE_V091__?.taiex;
    if(live?.source==='TWSE 官方收盤'&&String(live.date)===latest.date.replaceAll('-',''))return;
    const v=document.getElementById('taiex'),c=document.getElementById('taiexChg');
    const text=fmt(latest.price,2),change=Number.isFinite(latest.change)?latest.change:null;
    const label=(change==null?'—':(change>0?'+':'')+fmt(change,2))+'｜'+latest.source+' '+latest.time+'｜資料日 '+latest.date.replaceAll('-','/');
    if(v&&v.textContent!==text)v.textContent=text;
    if(c){if(c.textContent!==label)c.textContent=label;const name='s '+cls(change);if(c.className!==name)c.className=name}
  }
  async function run(){await loadLatest();paint()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  setInterval(paint,4000);setInterval(run,60000);
  addEventListener('focus',run);document.addEventListener('visibilitychange',()=>{if(!document.hidden)run()});
})();

/* Quote-first watchlist: display-only enhancement. */
(() => {
  'use strict';
  const n=v=>{if(v==null||v==='')return null;const x=Number(String(v).replace(/[^0-9.+-]/g,''));return Number.isFinite(x)?x:null};
  const fmt=v=>Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
  function install(){if(document.getElementById('quoteFirstLayout'))return;const s=document.createElement('style');s.id='quoteFirstLayout';s.textContent=`.row{grid-template-columns:112px 190px minmax(210px,1fr) 68px 28px;grid-template-areas:"name price chart score open";column-gap:12px;align-items:center}.row .p{align-self:stretch;display:flex;flex-direction:column;justify-content:center;padding:5px 12px;border-left:2px solid rgba(120,173,255,.22);border-right:1px solid rgba(50,75,104,.38)}.row .price{font-size:28px;line-height:1.02;font-weight:950;letter-spacing:-.6px}.row .chg{font-size:16px;line-height:1.3;font-weight:900;margin-top:7px;white-space:nowrap}.row .chg .quotePct{margin-left:7px;font-weight:850}.row .price.quote-up,.row .chg.quote-up{color:#ff2020!important;text-shadow:0 0 1px rgba(255,32,32,.25)}.row .price.quote-down,.row .chg.quote-down{color:#00b84a!important;text-shadow:0 0 1px rgba(0,184,74,.2)}.row .price.quote-flat,.row .chg.quote-flat{color:#f2f6fb!important}.row .spark,.row .sparkFallback{height:86px;align-self:center}.row .name{font-size:16px}.row .sym{font-size:12px}.row .meta span:last-child{display:none}@media(max-width:720px){.row{grid-template-columns:minmax(88px,1fr) minmax(145px,1.45fr) 54px 24px;grid-template-areas:"name price score open" "chart chart chart chart";gap:8px 7px;padding:11px}.row .p{border-right:0;padding:4px 0 4px 9px}.row .price{font-size:27px}.row .chg{font-size:15px;margin-top:6px}.row .spark,.row .sparkFallback{width:100%;height:86px;margin-top:8px;margin-bottom:5px}.row .dayline,.row .meta{grid-column:1/-1}}@media(max-width:390px){.row{grid-template-columns:minmax(76px,.9fr) minmax(138px,1.5fr) 48px 18px}.row .price{font-size:25px}.row .chg{font-size:14px}.row .scoreNum{font-size:21px}.row .chg .quotePct{margin-left:5px}}`;document.head.appendChild(s)}
  function enhanceRow(row){const priceEl=row.querySelector('.price'),chgEl=row.querySelector('.chg');if(!priceEl||!chgEl)return;const price=n(priceEl.textContent),chg=n(chgEl.textContent);if(price==null||chg==null)return;const prev=price-chg,pct=prev?chg/prev*100:null,arrow=chg>0?'▲':chg<0?'▼':'—',sign=chg>0?'+':'',trend=chg>0?'up':chg<0?'down':'flat',html=`${arrow} ${sign}${fmt(chg)}${pct==null?'':`<span class="quotePct">${pct>0?'+':''}${pct.toFixed(2)}%</span>`}`;priceEl.classList.remove('quote-up','quote-down','quote-flat');chgEl.classList.remove('quote-up','quote-down','quote-flat');priceEl.classList.add('quote-'+trend);chgEl.classList.add('quote-'+trend);if(chgEl.innerHTML!==html)chgEl.innerHTML=html;const meta=row.querySelector('.meta');if(meta){const spans=meta.querySelectorAll('span');if(spans.length>1&&spans[spans.length-1].style.display!=='none')spans[spans.length-1].style.display='none'}}
  let scheduled=false;function enhance(){document.querySelectorAll('#watch .row').forEach(enhanceRow)}function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance()})}
  function start(){install();enhance();const w=document.getElementById('watch');if(w)new MutationObserver(schedule).observe(w,{childList:true,subtree:true,characterData:true});setInterval(enhance,4000)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* Centered, readable axes for main intraday charts. Display-only; chart data and retained-session logic stay untouched. */
(() => {
  'use strict';
  function install(){if(document.getElementById('watchChartAxesStyle'))return;const s=document.createElement('style');s.id='watchChartAxesStyle';s.textContent=`
    .row{position:relative}.row .chartAxisOverlay{grid-area:chart;position:relative;z-index:3;pointer-events:none;height:86px;align-self:center;margin:0 10px;border-left:1px solid rgba(180,199,219,.38);border-bottom:1px solid rgba(180,199,219,.45);background:linear-gradient(to bottom,rgba(180,199,219,.20) 0 1px,transparent 1px 49%,rgba(180,199,219,.16) 49% 50%,transparent 50% 99%,rgba(180,199,219,.20) 99% 100%)}
    .row .chartAxisOverlay span{position:absolute;font-size:10px;font-weight:700;line-height:1.1;color:#d3e0ee;background:rgba(7,19,33,.92);padding:1px 3px;border-radius:3px;white-space:nowrap}
    .row .axisHigh{right:4px;top:4px}.row .axisLow{right:4px;bottom:17px}.row .axisT0{left:4px;bottom:2px}.row .axisTm{left:50%;transform:translateX(-50%);bottom:2px}.row .axisT1{right:4px;bottom:2px}
    @media(max-width:720px){.row .chartAxisOverlay{grid-area:chart;width:auto;height:86px;margin:8px 14px 5px}.row .chartAxisOverlay span{font-size:10px}}
  `;document.head.appendChild(s)}
  function values(row){const t=row.querySelector('.dayline')?.textContent||'';const m=t.replaceAll(',','').match(/高\s*([0-9.]+)\s*低\s*([0-9.]+)/);return m?{hi:m[1],lo:m[2]}:null}
  function add(row){const canvas=row.querySelector('canvas.spark');if(!canvas)return;let o=row.querySelector('.chartAxisOverlay');if(!o){o=document.createElement('div');o.className='chartAxisOverlay';o.innerHTML='<span class="axisHigh">—</span><span class="axisLow">—</span><span class="axisT0">09:00</span><span class="axisTm">11:15</span><span class="axisT1">13:30</span>';row.appendChild(o)}const v=values(row);if(v){o.querySelector('.axisHigh').textContent=v.hi;o.querySelector('.axisLow').textContent=v.lo}o.style.display=canvas.offsetParent===null?'none':''}
  function refresh(){document.querySelectorAll('#watch .row').forEach(add)}
  let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()})}
  function start(){install();refresh();const w=document.getElementById('watch');if(w)new MutationObserver(schedule).observe(w,{childList:true,subtree:true,characterData:true});[80,180,350,700,1200,2000].forEach(ms=>setTimeout(refresh,ms));setInterval(refresh,15000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
