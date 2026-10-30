#!/usr/bin/env python3
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
extras=ROOT/'extras-v090.js'
text=extras.read_text(encoding='utf-8')

def between(s,a,b,repl):
    i=s.find(a)
    if i<0: raise SystemExit(f'missing start: {a}')
    j=s.find(b,i)
    if j<0: raise SystemExit(f'missing end: {b}')
    return s[:i]+repl+s[j:]

# Today chart merge: official server snapshots + browser-collected TWSE MIS only.
text=between(text,'  function mergedTodayPoints(code,points){','  function drawFixedIntraday',r'''  function mergedTodayPoints(code,points){
    const byStamp=new Map();
    for(const x of chronologicalPoints(points)){
      const d=new Date(x?.time??x?.stamp),stamp=d.getTime(),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;
      const hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;
      byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS 官方留存')});
    }
    for(const x of misSeriesFor(code))byStamp.set(x.time.getTime(),x);
    const lp=livePointFor(code);if(lp)byStamp.set(lp.time.getTime(),{...lp,official:true,source:'TWSE MIS 最新成交'});
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
''')

text=between(text,'  function drawTodayPoints(code,points,canvas,compact){','  function drawFixedIntraday' if False else '  async function yahooTodayIntraday',r'''  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas)return false;const merged=mergedTodayPoints(code,Array.isArray(points)?points:[]),change=Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.change);
    if(merged.length<2||!drawFixedIntraday(canvas,merged,compact,change))return false;
    const vals=merged.map(x=>Number(x.close)),min=Math.min(...vals),max=Math.max(...vals),minI=vals.indexOf(min),maxI=vals.indexOf(max),firstHm=hmTw(merged[0].time),lastHm=hmTw(merged.at(-1).time);
    const fullStart=firstHm<='09:05';
    canvas.dataset.todayFull=fullStart?'1':'0';canvas.dataset.todayPoints=String(merged.length);canvas.dataset.todayOfficialPoints=String(merged.length);canvas.dataset.todayOfficialFirst=String(merged[0].time.getTime());canvas.dataset.todayOfficialLast=String(merged.at(-1).time.getTime());canvas.dataset.todayStart=firstHm;canvas.dataset.todayEnd=lastHm;canvas.dataset.todayMinTime=hmTw(merged[minI].time);canvas.dataset.todayMaxTime=hmTw(merged[maxI].time);return true;
  }

''')

# Replace Yahoo intraday/backfill section through exported main-draw owner.
start='  async function yahooTodayIntraday(code){'
end='  window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);'
replacement=r'''  const OFFICIAL_INTRADAY_URL='https://raw.githubusercontent.com/under855/twstock-ai-monitor/market-data/data/intraday/latest.json';
  let officialIntradayPayload=null,officialIntradayFetchedAt=0,officialIntradayPending=null;
  async function officialIntradayPayloadNow(force=false){
    if(!force&&officialIntradayPayload&&Date.now()-officialIntradayFetchedAt<60000)return officialIntradayPayload;
    if(officialIntradayPending)return await officialIntradayPending;
    officialIntradayPending=fetchJson(`${OFFICIAL_INTRADAY_URL}?_=${Date.now()}`,7000).then(j=>{officialIntradayPending=null;officialIntradayFetchedAt=Date.now();officialIntradayPayload=j;return j}).catch(()=>{officialIntradayPending=null;return null});
    return await officialIntradayPending;
  }
  async function officialTodayIntraday(code,force=false){
    const out=[],today=twIsoDay(),j=await officialIntradayPayloadNow(force),raw=j?.date===today&&Array.isArray(j?.stocks?.[String(code)])?j.stocks[String(code)]:[];
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;out.push({time:d,close,official:true,source:'TWSE MIS 官方留存'})}
    if(!out.length)return misSeriesFor(code);
    return chronologicalPoints(out);
  }

  const todayFallbackCache=new Map(),todayFallbackResolved=new Map();
  async function ensureTodayChartFor(code,force=false){
    const key=String(code),cached=todayFallbackResolved.get(key),now=Date.now();
    if(!force&&cached?.points&&now-cached.fetchedAt<60000){drawTodayPoints(key,cached.points,mainCanvasFor(key),true);return cached.points}
    if(todayFallbackCache.has(key))return await todayFallbackCache.get(key);
    const p=officialTodayIntraday(key,force).then(points=>{
      todayFallbackCache.delete(key);todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});drawTodayPoints(key,points,mainCanvasFor(key),true);return points;
    }).catch(()=>{todayFallbackCache.delete(key);const points=misSeriesFor(key);todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});drawTodayPoints(key,points,mainCanvasFor(key),true);return points});
    todayFallbackCache.set(key,p);return await p;
  }
  async function refreshTodayFallbackCharts(force=false){
    if(typeof watchlist!=='function')return false;const codes=[...new Set(watchlist().map(String))];await Promise.allSettled(codes.map(code=>ensureTodayChartFor(code,force)));return true;
  }

  function drawResolvedMainToday(code,canvas=null){
    const key=String(code),cached=todayFallbackResolved.get(key),points=cached?.points||misSeriesFor(key);
    return drawTodayPoints(key,points,canvas||mainCanvasFor(key),true);
  }
  window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);'''
text=between(text,start,end,replacement)
# add back end line tail removed by between (it begins at end marker)
# collapse duplicate exported line left by helper
text=text.replace(replacement+'  window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);',replacement,1)

# Replace TAIEX Yahoo loader with same official retained payload.
text=between(text,'  async function yahooTaiexIntraday(){','  function drawTaiexTop',r'''  async function officialTaiexIntraday(force=false){
    const today=twIsoDay(),j=await officialIntradayPayloadNow(force),raw=j?.date===today&&Array.isArray(j?.taiex)?j.taiex:[],byStamp=new Map();
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:'TWSE MIS 指數官方留存'})}
    for(const x of taiexMisSeries)byStamp.set(Number(x.stamp),{time:new Date(Number(x.stamp)),close:Number(x.close),official:true,source:'TWSE MIS 指數'});
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
''')
text=text.replace("const p=await yahooTaiexIntraday();","const p=await officialTaiexIntraday(force);",1)
text=text.replace("official.length?`MIS 即時 ${official.length} 點｜較早走勢補齊`:`${merged.length} 個 5 分鐘補齊點`","official.length?`TWSE MIS 官方 ${official.length} 點`:`官方分時資料累積中`",1)
text=text.replace("if(p.length>=2){taiexTodayCache=p;taiexTodayFetchedAt=Date.now();return drawTaiexTop(p)}const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent='今日分時暫時無法讀取';return false", "if(p.length>=2){taiexTodayCache=p;taiexTodayFetchedAt=Date.now();return drawTaiexTop(p)}const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent='官方分時資料不足／從開啟後累積';return false",1)

# Replace Yahoo daily history with official TWSE / TPEx monthly history.
text=between(text,'  async function yahooDailyHistory(code){','  async function loadHistoryFor(code){',r'''  const offNum=v=>{if(v==null)return null;const n=Number(String(v).replaceAll(',','').replace('+','').trim());return Number.isFinite(n)?n:null};
  function rocYmd(v){const p=String(v||'').trim().replaceAll('-','/').split('/');if(p.length!==3)return '';const y=Number(p[0]);if(!Number.isFinite(y))return '';return `${y<1911?y+1911:y}/${String(Number(p[1])).padStart(2,'0')}/${String(Number(p[2])).padStart(2,'0')}`}
  function recentMonths(n=4){const [y0,m0]=twIsoDay().split('-').map(Number),out=[];let y=y0,m=m0;for(let i=0;i<n;i++){out.push([y,m]);m--;if(m<1){m=12;y--}}return out}
  async function officialJson(upstream,timeout=7000){
    try{return await fetchJson(upstream,timeout)}catch{}
    return await fetchJson(`https://proxy.cors.dev/${upstream}`,timeout);
  }
  async function officialDailyHistory(code){
    let market='';try{market=String(universeMap?.get?.(String(code))?.market||'')}catch{}const out=[];
    for(const [y,m] of recentMonths(4)){
      try{
        if(market==='TPEx'){
          const date=`${y}/${String(m).padStart(2,'0')}/01`,u=`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${encodeURIComponent(code)}&date=${encodeURIComponent(date)}&response=json`,j=await officialJson(u),rows=j?.tables?.[0]?.data||[];
          for(const x of rows){const close=offNum(x?.[6]);if(close==null)continue;out.push({date:rocYmd(x[0]),open:offNum(x[3]),high:offNum(x[4]),low:offNum(x[5]),close,change:offNum(x[7]),volume:offNum(x[1])});}
        }else{
          const ym=`${y}${String(m).padStart(2,'0')}01`,u=`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${ym}&stockNo=${encodeURIComponent(code)}`,j=await officialJson(u),rows=j?.data||[];
          for(const x of rows){const close=offNum(x?.[6]);if(close==null)continue;out.push({date:rocYmd(x[0]),open:offNum(x[3]),high:offNum(x[4]),low:offNum(x[5]),close,change:offNum(x[7]),volume:offNum(x[1])});}
        }
      }catch{}
    }
    return [...new Map(out.filter(x=>x.date).map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
''')
text=text.replace("      const yh=await yahooDailyHistory(key);\n      if(yh.length>=2){try{historyCache[key]=yh}catch{}return yh}","      const oh=await officialDailyHistory(key);\n      if(oh.length>=2){try{historyCache[key]=oh}catch{}return oh}",1)
text=text.replace("if(typeof history==='function'){\n        const h=await history(key);\n        if(Array.isArray(h)&&h.length>=2)return h;\n      }\n      const oh=await officialDailyHistory(key);", "const oh=await officialDailyHistory(key);",1)

# User-facing chart messages: only claim official data.
text=text.replace('今日 ${points.length} 個 5 分鐘資料點｜分時備援走勢','今日官方分時 ${mergedTodayPoints(key,points).length} 點｜TWSE MIS')
text=text.replace("setInterval(()=>refreshTodayFallbackCharts(true).catch(()=>{}),300000)","setInterval(()=>refreshTodayFallbackCharts(true).catch(()=>{}),60000)")

if 'query1.finance.yahoo.com' in text or 'yahooTodayIntraday' in text or 'yahooDailyHistory' in text or 'yahooTaiexIntraday' in text:
    raise SystemExit('Yahoo runtime reference remains in extras-v090.js')
extras.write_text(text,encoding='utf-8')

# Replace foreign validation card: NVDA from Nasdaq through browser-safe bridge; COVER as clearly delayed Japan cross-check.
foreign=ROOT/'foreign-live-test.js'
foreign.write_text(r'''(() => {
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=s=>{const n=Number(String(s??'').replace(/[^0-9.+-]/g,''));return Number.isFinite(n)?n:null};
  const states={NVDA:{lastTs:'',accepted:0,points:[]},COVER:{lastTs:'',accepted:0,points:[]}};
  function style(){if(document.getElementById('officialValidationStyle'))return;const s=document.createElement('style');s.id='officialValidationStyle';s.textContent=`.foreignValidation{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:9px 0 13px}.foreignCard{background:linear-gradient(145deg,#10223a,#0b1828);border:1px solid #213954;border-radius:15px;padding:13px}.foreignCard h3{font-size:16px;margin:3px 0 9px}.foreignTop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.foreignStatus{font-size:11px;font-weight:800}.foreignGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.foreignMetric small{display:block;color:#93a9c2;font-size:10px}.foreignMetric b{display:block;margin-top:2px}.foreignChart{width:100%;height:52px;background:#071321;border-radius:8px;margin-top:9px}.sourceNote{font-size:10px;color:#93a9c2;line-height:1.5;margin-top:7px}.state-ok{color:#63d49a}.state-delay{color:#ffd166}.state-warn{color:#ff8b8b}@media(max-width:720px){.foreignValidation{grid-template-columns:1fr}.foreignGrid{grid-template-columns:1fr 1fr}}`;document.head.appendChild(s)}
  function draw(c,a){if(!c||a.length<2)return;const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=Math.max(1,devicePixelRatio||1),w=Math.max(100,Math.round((r.width||500)*dpr)),h=Math.max(35,Math.round((r.height||52)*dpr));c.width=w;c.height=h;ctx.clearRect(0,0,w,h);const vals=a.map(x=>x.p),lo=Math.min(...vals),hi=Math.max(...vals),span=hi===lo?1:hi-lo;ctx.strokeStyle=a.at(-1).p>=a[0].p?'#ff7272':'#64d69a';ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.beginPath();a.forEach((x,i)=>{const xx=3*dpr+(w-6*dpr)*(i/Math.max(1,a.length-1)),yy=3*dpr+(h-6*dpr)*(hi-x.p)/span;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke()}
  function mount(){style();if(document.getElementById('officialValidation'))return;const anchor=document.querySelector('.sectionTitle');if(!anchor)return;const box=document.createElement('section');box.id='officialValidation';box.className='foreignValidation';box.innerHTML=`
    <article class="foreignCard" id="nvdaValidation"><div class="foreignTop"><div><small>美股即時驗證｜Nasdaq 官方資料</small><h3>NVIDIA <span style="color:#93a9c2">NVDA</span></h3></div><span class="foreignStatus" id="nvdaStatus">讀取中</span></div><div class="foreignGrid"><div class="foreignMetric"><small>最新價</small><b id="nvdaPrice">—</b></div><div class="foreignMetric"><small>Nasdaq 原始時間</small><b id="nvdaSourceTime">—</b></div><div class="foreignMetric"><small>市場狀態</small><b id="nvdaMarket">—</b></div><div class="foreignMetric"><small>有效新資料</small><b id="nvdaCount">0</b></div></div><canvas id="nvdaChart" class="foreignChart"></canvas><div class="sourceNote">來源：Nasdaq 官方 Quote API；瀏覽器透過 r.jina.ai 讀取官方回應。只有 Nasdaq 原始成交時間改變才計為新資料，並顯示 Nasdaq 的 isRealTime 標記。</div></article>
    <article class="foreignCard" id="coverValidation"><div class="foreignTop"><div><small>日股來源驗證｜不宣稱即時</small><h3>COVER <span style="color:#93a9c2">5253・東證</span></h3></div><span class="foreignStatus state-delay" id="coverStatus">JPX 至少延遲 15 分鐘</span></div><div class="foreignGrid"><div class="foreignMetric"><small>參考價</small><b id="coverPrice">—</b></div><div class="foreignMetric"><small>資料時間</small><b id="coverSourceTime">—</b></div><div class="foreignMetric"><small>漲跌</small><b id="coverChange">—</b></div><div class="foreignMetric"><small>有效新資料</small><b id="coverCount">0</b></div></div><canvas id="coverChart" class="foreignChart"></canvas><div class="sourceNote">JPX 官方說明：免費個股行情至少延遲 15 分鐘；本卡以 Google Finance 作公開價格交叉顯示，僅驗證日股資料流與延遲標示，不作即時行情依據。台股與評分不使用本來源。</div></article>`;anchor.parentNode.insertBefore(box,anchor)}
  async function nvda(){
    const u='https://r.jina.ai/https://api.nasdaq.com/api/quote/NVDA/info?assetclass=stocks&_='+Date.now(),r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text(),i=t.indexOf('{');if(i<0)throw Error('Nasdaq JSON missing');const j=JSON.parse(t.slice(i)),d=j?.data,p=d?.primaryData;if(!p)throw Error('Nasdaq payload missing');const price=num(p.lastSalePrice),ts=String(p.lastTradeTimestamp||'');if(price==null||!ts)throw Error('Nasdaq quote missing');const s=states.NVDA;if(ts!==s.lastTs){s.lastTs=ts;s.accepted++;s.points.push({p:price,t:Date.now()});if(s.points.length>80)s.points.shift()}document.getElementById('nvdaPrice').textContent=price.toFixed(2);document.getElementById('nvdaSourceTime').textContent=ts.replace(/, 2026 /,', ');document.getElementById('nvdaMarket').textContent=String(d.marketStatus||'—');document.getElementById('nvdaCount').textContent=String(s.accepted);const st=document.getElementById('nvdaStatus');st.textContent=p.isRealTime===true?'Nasdaq 標示即時':'Nasdaq 未標示即時';st.className='foreignStatus '+(p.isRealTime===true?'state-ok':'state-delay');const card=document.getElementById('nvdaValidation');card.dataset.accepted=String(s.accepted);card.dataset.sourceTime=ts;card.dataset.price=String(price);card.dataset.realTime=String(p.isRealTime===true);draw(document.getElementById('nvdaChart'),s.points)
  }
  async function cover(){
    const upstream='https://www.google.com/finance/quote/5253:TYO?hl=en&_='+Date.now(),u='https://proxy.cors.dev/'+upstream,r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const html=await r.text();const m=html.match(/data-last-price="([0-9.]+)"[^>]*data-last-normal-market-timestamp="([0-9]+)"/)||html.match(/data-last-normal-market-timestamp="([0-9]+)"[^>]*data-last-price="([0-9.]+)"/);let price=null,epoch=null;if(m){if(m[0].indexOf('data-last-price')<m[0].indexOf('data-last-normal')){price=num(m[1]);epoch=Number(m[2])}else{epoch=Number(m[1]);price=num(m[2])}}if(price==null){const pm=html.match(/data-last-price="([0-9.]+)"/);price=pm?num(pm[1]):null}if(!epoch){const tm=html.match(/data-last-normal-market-timestamp="([0-9]+)"/);epoch=tm?Number(tm[1]):null}if(price==null)throw Error('COVER price missing');const ts=epoch?new Date(epoch*1000).toLocaleString('zh-TW',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Google Finance 公開頁';const key=String(epoch||ts),s=states.COVER;if(key!==s.lastTs){s.lastTs=key;s.accepted++;s.points.push({p:price,t:Date.now()});if(s.points.length>80)s.points.shift()}document.getElementById('coverPrice').textContent='¥'+price.toLocaleString('zh-TW');document.getElementById('coverSourceTime').textContent=ts;document.getElementById('coverCount').textContent=String(s.accepted);const ch=html.match(/data-last-price="[0-9.]+"[^>]*data-last-normal-market-timestamp="[0-9]+"[^>]*data-last-close="([0-9.]+)"/),prev=ch?num(ch[1]):null;document.getElementById('coverChange').textContent=prev!=null?(price-prev>=0?'+':'')+(price-prev).toFixed(0):'—';const card=document.getElementById('coverValidation');card.dataset.accepted=String(s.accepted);card.dataset.sourceTime=String(epoch||'');card.dataset.price=String(price);card.dataset.realTime='false';draw(document.getElementById('coverChart'),s.points)
  }
  function safeRun(fn,statusId){fn().catch(e=>{const x=document.getElementById(statusId);if(x){x.textContent='來源暫時無法讀取';x.className='foreignStatus state-warn'}console.warn(e)})}
  function start(){mount();safeRun(nvda,'nvdaStatus');safeRun(cover,'coverStatus');setInterval(()=>safeRun(nvda,'nvdaStatus'),15000);setInterval(()=>safeRun(cover,'coverStatus'),60000);addEventListener('resize',()=>{draw(document.getElementById('nvdaChart'),states.NVDA.points);draw(document.getElementById('coverChart'),states.COVER.points)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
''',encoding='utf-8')

# Cache-bust active scripts and make new validation file part of PWA core.
index=ROOT/'index.html';s=index.read_text(encoding='utf-8');s=re.sub(r'extras-v090\.js\?v=[^"\']+','extras-v090.js?v=095official1',s);s=re.sub(r'foreign-live-test\.js\?v=[^"\']+','foreign-live-test.js?v=2',s);index.write_text(s,encoding='utf-8')
sw=ROOT/'sw.js';s=sw.read_text(encoding='utf-8');s=re.sub(r"const CACHE='[^']+'", "const CACHE='tw-ai-monitor-v095official1'",s);s=s.replace("'./extras-v090.js','./live-v091.js'", "'./extras-v090.js','./live-v091.js','./foreign-live-test.js'");sw.write_text(s,encoding='utf-8')
print('patched active runtime: no Yahoo stock data')
