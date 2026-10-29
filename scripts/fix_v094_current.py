from pathlib import Path

p = Path('live-v091.js')
s = p.read_text(encoding='utf-8')

old = """  async function viaProxy(upstream,timeout=7000){
    const primary=`https://proxy.cors.dev/${upstream}`;
    try{return await getJson(primary,timeout)}catch(first){
      const backup=`https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`;
      try{return await getJson(backup,timeout+2500)}catch{throw first}
    }
  }"""
new = """  async function viaProxy(upstream,timeout=7000){
    const primary=`https://proxy.cors.dev/${upstream}`;
    return await getJson(primary,timeout);
  }"""
if old not in s:
    raise SystemExit('viaProxy marker not found')
s = s.replace(old, new, 1)

# Yahoo is not allowed in the current-price / 15-second runtime path.
start = s.find('  async function yahooSeed(code,q){')
end = s.find('\n\n  function drawLine(canvas,a){', start)
if start < 0 or end < 0:
    raise SystemExit('Yahoo seed block not found')
s = s[:start] + '  function seedCurrent(){}\n' + s[end:]

old = """  function drawLine(canvas,a){
    if(!canvas)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,devicePixelRatio||1),w=Math.max(30,Math.round((r.width||320)*dpr)),h=Math.max(24,Math.round((r.height||50)*dpr));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;ctx.clearRect(0,0,w,h);
    const data=(a||[]).filter(p=>sameDay(Number(p.stamp))&&num(p.close)!=null).sort((x,y)=>x.stamp-y.stamp);
    if(data.length<2){ctx.fillStyle='#91a8c2';ctx.font=`${Math.round(11*dpr)}px sans-serif`;ctx.textAlign='center';ctx.fillText('今日盤中線累積中',w/2,h/2);return false}"""
new = """  function drawLine(canvas,a){
    if(!canvas)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const data=(a||[]).filter(p=>sameDay(Number(p.stamp))&&num(p.close)!=null).sort((x,y)=>x.stamp-y.stamp);
    if(data.length<2&&canvas.dataset.history==='1')return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,devicePixelRatio||1),w=Math.max(30,Math.round((r.width||320)*dpr)),h=Math.max(24,Math.round((r.height||50)*dpr));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;ctx.clearRect(0,0,w,h);
    if(data.length<2){ctx.fillStyle='#91a8c2';ctx.font=`${Math.round(11*dpr)}px sans-serif`;ctx.textAlign='center';ctx.fillText('今日盤中線累積中',w/2,h/2);return false}
    canvas.dataset.history='0';"""
if old not in s:
    raise SystemExit('drawLine marker not found')
s = s.replace(old, new, 1)

old = """  function paintStatus(){
    if(!marketOpen())return;const b=document.getElementById('liveBadge'),s=document.getElementById('marketStatus'),t=document.getElementById('marketTime'),p=document.getElementById('refreshPill'),ok=lastSuccessAt>0;if(p)p.textContent=`盤中即時：15 秒｜v${VERSION}`;if(b){b.textContent=ok?`盤中即時 v${VERSION}`:`即時來源重試中 v${VERSION}`;b.className=ok?'liveBadge ok':'liveBadge warn'}if(s)s.textContent=ok?'盤中即時':'即時來源重試';if(t)t.textContent=`最近輪詢 ${hhmmss(lastPollAt||Date.now())}`;
  }
  function paintAll(){if(!marketOpen())return;paintIndex();for(const code of watchCodes()){const q=quotes.get(code);q?paintRow(code,q):maskRow(code)}paintDetail();paintStatus();debug()}

  function placeholder(code){return {code:String(code),price:'',change:'',prev:'',open:'',high:'',low:'',volume:'',date:today(),stamp:null,tradeTime:'',source:'盤中即時資料載入中',live:false}}
  if(originalQuote)quote=async function(code,allowNetwork=true){if(marketOpen())return quotes.get(String(code))||placeholder(code);return originalQuote(code,allowNetwork)};
  if(originalRender)render=async function(allowNetwork=false){const x=await originalRender(marketOpen()?false:allowNetwork);if(marketOpen())paintAll();return x};
  if(originalShow)show=async function(code,opts={}){code=String(code);if(marketOpen())quoteCache[code]=quotes.get(code)||placeholder(code);const x=await originalShow(code,opts);if(marketOpen()){paintDetail();poll()}return x};"""
new = """  function hasTodayData(){if(taiex?.date===today())return true;for(const q of quotes.values())if(q?.date===today()&&num(q.price)!=null)return true;return false}
  function paintStatus(){
    const b=document.getElementById('liveBadge'),s=document.getElementById('marketStatus'),t=document.getElementById('marketTime'),p=document.getElementById('refreshPill'),ok=lastSuccessAt>0||hasTodayData();
    if(marketOpen()){
      if(p)p.textContent=`盤中即時：15 秒｜v${VERSION}`;if(b){b.textContent=ok?`盤中即時 v${VERSION}`:`即時來源重試中 v${VERSION}`;b.className=ok?'liveBadge ok':'liveBadge warn'}if(s)s.textContent=ok?'盤中即時':'即時來源重試';if(t)t.textContent=`最近輪詢 ${hhmmss(lastPollAt||Date.now())}`;
    }else if(hasTodayData()){
      if(p)p.textContent=`今日收盤／最後成交｜v${VERSION}`;if(b){b.textContent=`今日資料 v${VERSION}`;b.className='liveBadge ok'}if(s)s.textContent='今日收盤';if(t)t.textContent=`MIS 最後成交／指數 ${taiex?.time||''}`;
    }
  }
  function paintAll(){if(!marketOpen()&&!hasTodayData()){debug();return}paintIndex();for(const code of watchCodes()){const q=quotes.get(code);if(q?.date===today())paintRow(code,q);else if(marketOpen())maskRow(code)}paintDetail();paintStatus();debug()}

  function placeholder(code){return {code:String(code),price:'',change:'',prev:'',open:'',high:'',low:'',volume:'',date:today(),stamp:null,tradeTime:'',source:'今日資料載入中',live:false}}
  if(originalQuote)quote=async function(code,allowNetwork=true){const q=quotes.get(String(code));if(q?.date===today())return q;if(marketOpen())return placeholder(code);return originalQuote(code,allowNetwork)};
  if(originalRender)render=async function(allowNetwork=false){const x=await originalRender(marketOpen()?false:allowNetwork);if(marketOpen()||hasTodayData())paintAll();return x};
  if(originalShow)show=async function(code,opts={}){code=String(code);const q=quotes.get(code);if(q?.date===today()||marketOpen())quoteCache[code]=q||placeholder(code);const x=await originalShow(code,opts);if(q?.date===today()||marketOpen()){paintDetail();poll(true)}return x};"""
if old not in s:
    raise SystemExit('paint/wrapper marker not found')
s = s.replace(old, new, 1)

old = """  async function poll(){
    if(!marketOpen()||busy)return;busy=true;cycle++;lastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes));let accepted=0;if(idx&&(!taiex||idx.stamp>=taiex.stamp)){taiex=idx;accepted++}for(const q of map.values()){if(acceptQuote(q))accepted++}if(accepted)lastSuccessAt=Date.now();saveToday();paintAll();seedCurrent();
    }catch(e){paintAll();debug();window.__TW_LIVE_V091__.error=String(e?.message||e)}finally{busy=false}
  }
  function start(){
    loadToday();if(marketOpen()){paintAll();poll();setInterval(poll,INTERVAL);setTimeout(seedCurrent,2500)}else{const p=document.getElementById('refreshPill');if(p)p.textContent=`休市｜v${VERSION}`;debug()}
    addEventListener('focus',()=>{if(marketOpen())poll()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&marketOpen())poll()});
  }"""
new = """  async function poll(force=false){
    if((!marketOpen()&&!force)||busy)return;busy=true;cycle++;lastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes));let accepted=0;if(idx&&(!taiex||idx.stamp>=taiex.stamp)){taiex=idx;accepted++}for(const q of map.values()){if(acceptQuote(q))accepted++}if(accepted)lastSuccessAt=Date.now();saveToday();paintAll();
    }catch(e){paintAll();debug();window.__TW_LIVE_V091__.error=String(e?.message||e)}finally{busy=false}
  }
  function start(){
    loadToday();paintAll();poll(true);if(marketOpen())setInterval(()=>poll(false),INTERVAL);else{const p=document.getElementById('refreshPill');if(p&&!hasTodayData())p.textContent=`休市／檢查今日最終資料｜v${VERSION}`;debug()}
    addEventListener('focus',()=>poll(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll(true)});
  }"""
if old not in s:
    raise SystemExit('poll/start marker not found')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
