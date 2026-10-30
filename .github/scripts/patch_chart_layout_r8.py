from pathlib import Path

idx = Path('index.html')
s = idx.read_text()
s = s.replace('.market{display:grid;grid-template-columns:1.4fr .8fr .8fr;gap:9px;margin:10px 0}', '.market{display:grid;grid-template-columns:1.05fr .72fr 1.55fr;gap:9px;margin:10px 0}')
s = s.replace('.marketCard .s{font-size:12px;margin-top:3px}', '.marketCard .s{font-size:12px;margin-top:3px}.marketChartCard{min-width:0}.marketChart{display:block;width:100%;height:62px;background:#071321;border-radius:9px;margin-top:7px}.marketChartMeta{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:10px;margin-top:5px}')
s = s.replace('@media(max-width:720px){.market{grid-template-columns:1.25fr 1fr}.marketCard:first-child{grid-column:1/-1}', '@media(max-width:720px){.market{grid-template-columns:1fr 1fr}.marketChartCard{grid-column:1/-1}.marketCard:first-child{grid-column:auto}')
old = '    <div class="marketCard"><div class="l">監控標的</div><div id="watchCount" class="v">—</div><div class="s muted">最多 20 檔</div></div>'
new = '    <div class="marketCard marketChartCard"><div class="l">台灣加權指數｜今日走勢</div><canvas id="taiexChart" class="marketChart" width="620" height="90"></canvas><div class="marketChartMeta"><span>09:00</span><span id="taiexChartMsg">載入今日分時…</span><span>13:30</span></div></div>'
if old not in s:
    raise SystemExit('watch count card pattern missing')
s = s.replace(old, new)
s = s.replace("async function render(allowNetwork=false){const list=watchlist();$('watchCount').textContent=list.length;", "async function render(allowNetwork=false){const list=watchlist();const wc=$('watchCount');if(wc)wc.textContent=list.length;")
s = s.replace('./extras-v090.js?v=094r7', './extras-v090.js?v=094r8').replace('./live-v091.js?v=094r7', './live-v091.js?v=094r8')
idx.write_text(s)

ex = Path('extras-v090.js')
s = ex.read_text()
start = s.index('  function drawTodayPoints(code,points,canvas,compact){')
end = s.index('\n\n  async function yahooTodayIntraday(code)', start)
repl = r'''  function hmTw(v){return new Date(v).toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false})}
  function twIsoDay(){return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})}
  function livePointFor(code){
    try{
      const x=window.__TW_LIVE_V091__?.stocks?.[String(code)],today=twIsoDay().replaceAll('-','');
      if(!x||x.date!==today||!Number.isFinite(Number(x.price)))return null;
      const raw=String(x.tradeTime||'').slice(0,8),hm=raw.slice(0,5);if(hm<'09:00'||hm>'13:30')return null;
      const ms=Date.parse(`${twIsoDay()}T${raw||hm+':00'}+08:00`);if(!Number.isFinite(ms))return null;
      return {time:new Date(ms),close:Number(x.price)};
    }catch{return null}
  }
  function mergedTodayPoints(code,points){
    const out=chronologicalPoints(points).map(x=>({time:new Date(x.time),close:Number(x.close)})).filter(x=>Number.isFinite(x.close)&&hmTw(x.time)>='09:00'&&hmTw(x.time)<='13:30');
    const lp=livePointFor(code);if(lp){const h=hmTw(lp.time),i=out.findIndex(x=>hmTw(x.time)===h);if(i>=0)out[i]=lp;else out.push(lp)}
    return chronologicalPoints(out);
  }
  function drawFixedIntraday(canvas,points,compact=false,change=null){
    if(!canvas||!Array.isArray(points)||points.length<2)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),W=Math.max(40,Math.round((r.width||620)*dpr)),H=Math.max(28,Math.round((r.height||(compact?50:220))*dpr));if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;ctx.clearRect(0,0,W,H);
    const d=chronologicalPoints(points).filter(x=>Number.isFinite(Number(x.close)));if(d.length<2)return false;
    let lo=Math.min(...d.map(x=>Number(x.close))),hi=Math.max(...d.map(x=>Number(x.close)));if(hi===lo){hi+=1;lo-=1}const pad=(hi-lo)*.08;hi+=pad;lo-=pad;
    const p={l:compact?4*dpr:44*dpr,r:compact?4*dpr:12*dpr,t:6*dpr,b:compact?4*dpr:24*dpr};
    const day=twIsoDay(),t0=Date.parse(`${day}T09:00:00+08:00`),t1=Date.parse(`${day}T13:30:00+08:00`),span=t1-t0;
    const X=x=>p.l+Math.max(0,Math.min(1,(new Date(x.time).getTime()-t0)/span))*(W-p.l-p.r),Y=v=>p.t+(H-p.t-p.b)*(hi-Number(v))/(hi-lo);
    if(!compact){ctx.strokeStyle='#1e3550';ctx.fillStyle='#91a8c2';ctx.font=`${11*dpr}px sans-serif`;ctx.lineWidth=Math.max(1,dpr);for(let k=0;k<4;k++){const y=p.t+(H-p.t-p.b)*k/3;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();ctx.fillText((hi-(hi-lo)*k/3).toFixed(2),3*dpr,y+4*dpr)}for(const [label,ratio] of [['09:00',0],['11:15',.5],['13:30',1]]){const x=p.l+(W-p.l-p.r)*ratio;ctx.fillText(label,Math.max(2*dpr,Math.min(W-42*dpr,x-14*dpr)),H-6*dpr)}}
    const fallback=d.at(-1).close-d[0].close,delta=Number.isFinite(Number(change))?Number(change):fallback;ctx.strokeStyle=delta>=0?'#ff7272':'#64d69a';ctx.lineWidth=Math.max(1.5*dpr,compact?1.8*dpr:2.2*dpr);ctx.beginPath();d.forEach((x,i)=>{const xx=X(x),yy=Y(x.close);if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)});ctx.stroke();return true;
  }
  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas||!Array.isArray(points)||points.length<2)return false;const merged=mergedTodayPoints(code,points),change=Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.change);
    if(!drawFixedIntraday(canvas,merged,compact,change))return false;
    const vals=merged.map(x=>Number(x.close)),min=Math.min(...vals),max=Math.max(...vals),minI=vals.indexOf(min),maxI=vals.indexOf(max);
    canvas.dataset.todayFull='1';canvas.dataset.todayPoints=String(merged.length);canvas.dataset.todayStart=hmTw(merged[0].time);canvas.dataset.todayEnd=hmTw(merged.at(-1).time);canvas.dataset.todayMinTime=hmTw(merged[minI].time);canvas.dataset.todayMaxTime=hmTw(merged[maxI].time);return true;
  }'''
s = s[:start] + repl + s[end:]
old = "draw(live,points.map(x=>({date:x.time,close:x.close})),false,priceFor(key));"
if old not in s:
    raise SystemExit('detail today draw pattern missing')
s = s.replace(old, "drawTodayPoints(key,points,live,false);")
insert = s.index('\n\n  async function yahooDailyHistory(code)')
extra = r'''

  let taiexTodayCache=null,taiexTodayFetchedAt=0;
  async function yahooTaiexIntraday(){
    const upstream=`https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?range=1d&interval=5m&includePrePost=false&_=${Date.now()}`,today=twIsoDay();
    for(const url of [`https://proxy.cors.dev/${upstream}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`]){
      try{const j=await fetchJson(url,7000),r=j?.chart?.result?.[0],ts=r?.timestamp||[],q=r?.indicators?.quote?.[0]||{},out=[];for(let i=0;i<ts.length;i++){const close=Number(q.close?.[i]);if(!Number.isFinite(close))continue;const d=new Date(Number(ts[i])*1000),day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),hm=hmTw(d);if(day===today&&hm>='09:00'&&hm<='13:30')out.push({time:d,close})}out.sort((a,b)=>a.time-b.time);if(out.length>=2)return out}catch{}
    }return [];
  }
  function drawTaiexTop(points){const c=document.getElementById('taiexChart');if(!c||points.length<2)return false;const txt=document.getElementById('taiexChg')?.textContent||'',m=txt.replaceAll(',','').match(/[+-]?\d+(?:\.\d+)?/),chg=m?Number(m[0]):null;if(!drawFixedIntraday(c,points,true,chg))return false;c.dataset.todayFull='1';c.dataset.todayPoints=String(points.length);c.dataset.todayStart=hmTw(points[0].time);c.dataset.todayEnd=hmTw(points.at(-1).time);const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent=`${points.length} 個 5 分鐘點`;return true}
  async function ensureTaiexTop(force=false){if(!force&&taiexTodayCache?.length>=2&&Date.now()-taiexTodayFetchedAt<300000)return drawTaiexTop(taiexTodayCache);const p=await yahooTaiexIntraday();if(p.length>=2){taiexTodayCache=p;taiexTodayFetchedAt=Date.now();return drawTaiexTop(p)}const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent='今日分時暫時無法讀取';return false}
  function startTaiexTop(){setTimeout(()=>ensureTaiexTop(false),250);setTimeout(()=>ensureTaiexTop(false),1400);setInterval(()=>ensureTaiexTop(true),300000);addEventListener('resize',()=>{if(taiexTodayCache?.length>=2)drawTaiexTop(taiexTodayCache)});return true}
'''
s = s[:insert] + extra + s[insert:]
boot = '  function boot(){\n'
if boot not in s:
    raise SystemExit('boot pattern missing')
s = s.replace(boot, boot + '    startTaiexTop();\n', 1)
ex.write_text(s)

sw = Path('sw.js')
s = sw.read_text().replace("const CACHE='tw-ai-monitor-v094r7';", "const CACHE='tw-ai-monitor-v094r8';")
sw.write_text(s)
