(()=>{
  'use strict';
  const SYMBOL='0700.HK', NAME='騰訊控股', INTERVAL=15000;
  const points=[]; let lastSourceTs=0,lastPrice=null,accepted=0,polls=0;
  function fmtTime(ms,zone='Asia/Hong_Kong'){return new Date(ms).toLocaleTimeString('zh-TW',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
  function ensureUI(){
    if(document.getElementById('foreignLiveTest'))return;
    const host=document.querySelector('.market'); if(!host)return;
    const wrap=document.createElement('section');
    wrap.id='foreignLiveTest';
    wrap.style.cssText='grid-column:1/-1;background:linear-gradient(145deg,#10223a,#0b1828);border:1px solid #315075;border-radius:15px;padding:13px;box-shadow:0 12px 28px rgba(0,0,0,.22)';
    wrap.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:11px;color:#93a9c2">海外即時管線驗證｜暫時測試標的</div><div style="font-size:18px;font-weight:900;margin-top:4px">${NAME} <span style="font-size:12px;color:#93a9c2">${SYMBOL}</span></div></div><div id="foreignLiveState" style="font-size:12px;color:#ffd166">等待第一筆資料</div></div><div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px"><div><div class="small muted">最新價</div><b id="foreignLivePrice">—</b></div><div><div class="small muted">上一筆</div><b id="foreignLivePrev">—</b></div><div><div class="small muted">來源成交時間</div><b id="foreignLiveSourceTime">—</b></div><div><div class="small muted">本機收到時間</div><b id="foreignLiveRecvTime">—</b></div><div><div class="small muted">有效新資料</div><b id="foreignLiveCount">0</b></div></div><canvas id="foreignLiveChart" width="1100" height="110" style="display:block;width:100%;height:84px;background:#071321;border-radius:9px;margin-top:10px"></canvas><div id="foreignLiveNote" class="small muted" style="margin-top:6px">每 15 秒輪詢；只有來源時間戳前進才新增一點。Yahoo 港股頁面標示 delayed quote，因此此卡用來驗證更新管線，不宣稱交易所零延遲。</div>`;
    host.appendChild(wrap);
  }
  function draw(){
    const c=document.getElementById('foreignLiveChart'); if(!c||points.length<2)return;
    const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=Math.max(1,devicePixelRatio||1),W=Math.max(300,Math.round(r.width*dpr)),H=Math.max(80,Math.round(r.height*dpr));
    if(c.width!==W)c.width=W;if(c.height!==H)c.height=H;ctx.clearRect(0,0,W,H);
    const vals=points.map(x=>x.p),lo0=Math.min(...vals),hi0=Math.max(...vals),span=hi0-lo0||1,lo=lo0-span*.08,hi=hi0+span*.08,pad=8*dpr;
    const X=i=>pad+(W-pad*2)*(i/(points.length-1)),Y=v=>pad+(H-pad*2)*(1-(v-lo)/(hi-lo));
    ctx.strokeStyle=points.at(-1).p>=points[0].p?'#ff7272':'#64d69a';ctx.lineWidth=2*dpr;ctx.beginPath();points.forEach((x,i)=>i?ctx.lineTo(X(i),Y(x.p)):ctx.moveTo(X(i),Y(x.p)));ctx.stroke();
    c.dataset.points=String(points.length);c.dataset.lastSource=String(points.at(-1).t);c.dataset.lastPrice=String(points.at(-1).p);
  }
  async function getJson(url,timeout=9000){const ac=new AbortController(),to=setTimeout(()=>ac.abort(),timeout);try{const r=await fetch(url,{cache:'no-store',signal:ac.signal});if(!r.ok)throw Error(String(r.status));return await r.json()}finally{clearTimeout(to)}}
  async function fetchTick(){
    const up=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?range=1d&interval=1m&includePrePost=false&_=${Date.now()}`;
    let j; try{j=await getJson(`https://proxy.cors.dev/${up}`)}catch{j=await getJson(`https://api.allorigins.win/raw?url=${encodeURIComponent(up)}`)}
    const x=j?.chart?.result?.[0],m=x?.meta||{},ts=Number(m.regularMarketTime||0),price=Number(m.regularMarketPrice);
    if(!ts||!Number.isFinite(price))throw Error('來源沒有有效成交時間或價格');
    return {ts:ts*1000,price};
  }
  async function poll(){
    ensureUI();polls++;
    const state=document.getElementById('foreignLiveState');
    try{
      const x=await fetchTick(),recv=Date.now(),isNew=x.ts>lastSourceTs;
      document.getElementById('foreignLivePrice').textContent=x.price.toFixed(2);
      document.getElementById('foreignLivePrev').textContent=lastPrice==null?'—':lastPrice.toFixed(2);
      document.getElementById('foreignLiveSourceTime').textContent=fmtTime(x.ts);
      document.getElementById('foreignLiveRecvTime').textContent=fmtTime(recv,'Asia/Taipei');
      if(isNew){accepted++;lastPrice=x.price;lastSourceTs=x.ts;points.push({t:x.ts,p:x.price});if(points.length>120)points.shift();draw();state.textContent=`收到新資料｜第 ${accepted} 筆`;state.style.color='#aef3ce';}
      else{state.textContent=`來源尚未更新｜輪詢 ${polls} 次`;state.style.color='#ffd166';}
      document.getElementById('foreignLiveCount').textContent=String(accepted);
      const card=document.getElementById('foreignLiveTest');card.dataset.accepted=String(accepted);card.dataset.sourceTs=String(lastSourceTs);card.dataset.price=String(lastPrice??'');
    }catch(e){state.textContent='驗證來源讀取失敗';state.style.color='#ff9aa8';document.getElementById('foreignLiveNote').textContent='錯誤：'+(e?.message||e)+'。台股正式行情核心未受影響。';}
  }
  addEventListener('resize',draw);setTimeout(poll,300);setInterval(poll,INTERVAL);
})();
