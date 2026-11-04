/* Single-stock chart pilot: 00878. Does not alter the quote or trading engine. */
(() => {
  'use strict';
  const CODE='00878';
  const OFFICIAL='https://raw.githubusercontent.com/under855/twstock-ai-monitor/market-data/data/intraday/latest.json';
  const style=document.createElement('style');
  style.textContent=[
    '#sheet.pilot-chart-view .cards>.card:first-child{display:block!important}',
    '#sheet.pilot-chart-view #bigChart,#sheet.pilot-chart-view #historyChart,#sheet.pilot-chart-view #detailChartTabs,#sheet.pilot-chart-view #chartMsg,#sheet.pilot-chart-view #historyChartMsg,#sheet.pilot-chart-view #detailChartDisplayTitle{display:none!important}',
    '#pilot00878{font-family:inherit;color:#ecf4ff}',
    '#pilot00878 .pilot-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:8px}',
    '#pilot00878 .pilot-heading{font-size:15px;font-weight:800}',
    '#pilot00878 .pilot-sub{font-size:11px;color:#a5b9d0;margin-top:4px}',
    '#pilot00878 .pilot-price{font-size:24px;font-weight:850;font-variant-numeric:tabular-nums}',
    '#pilot00878 canvas{display:block;width:100%;height:315px;background:#071321;border:1px solid #213954;border-radius:9px}',
    '#pilot00878 .pilot-bottom{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:#9fb3cb;margin-top:8px}',
    '@media(max-width:720px){#pilot00878 canvas{height:285px}}'
  ].join('\n');
  document.head.appendChild(style);
  let official=null, lastRequest=0, pending=null, lastSignature='', mounted=false;
  const number=v=>{if(v==null||v==='')return null;const n=Number(String(v).replaceAll(',',''));return Number.isFinite(n)&&n>0?n:null};
  const twDate=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
  const dayFromStamp=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
  const hm=ms=>new Date(ms).toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false});
  const activePilot=()=>{try{return String(active)===CODE&&document.getElementById('sheet')?.classList.contains('show')}catch{return false}};
  function localPoints(date){
    try{
      if(date!==twDate())return [];
      const raw=JSON.parse(localStorage.getItem('tw_live091_series_'+date.replaceAll('-',''))||'{}');
      return Array.isArray(raw?.[CODE])?raw[CODE].map(x=>({stamp:Number(x.stamp),close:number(x.close)})).filter(x=>Number.isFinite(x.stamp)&&x.close!==null&&dayFromStamp(x.stamp)===date&&hm(x.stamp)>='09:00'&&hm(x.stamp)<='13:30'):[];
    }catch{return []}
  }
  async function refreshOfficial(){
    if(pending)return pending;
    if(Date.now()-lastRequest<60000)return;
    lastRequest=Date.now();
    pending=(async()=>{
      const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),6500);
      try{
        const r=await fetch(OFFICIAL+'?_='+Date.now(),{cache:'no-store',signal:ac.signal});
        if(!r.ok)throw Error('HTTP '+r.status);
        const j=await r.json(),date=String(j?.date||'');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
        const arr=j?.stocks?.[CODE];if(!Array.isArray(arr))return;
        const points=arr.map(x=>({stamp:Number(x.stamp),close:number(x.close)})).filter(x=>Number.isFinite(x.stamp)&&x.close!==null&&dayFromStamp(x.stamp)===date&&hm(x.stamp)>='09:00'&&hm(x.stamp)<='13:30');
        if(points.length)official={date,points};
      }catch{}finally{clearTimeout(timeout)}
    })().finally(()=>{pending=null});
    return pending;
  }
  function pointsAndDay(){
    const today=twDate(),local=localPoints(today),live=window.__TW_LIVE_V091__?.stocks?.[CODE];
    const liveDate=String(live?.date||'');
    if(liveDate===today.replaceAll('-','')){
      const stamp=Number(live.stamp),price=number(live.price);
      if(Number.isFinite(stamp)&&dayFromStamp(stamp)===today&&price!==null&&hm(stamp)>='09:00'&&hm(stamp)<='13:30')local.push({stamp,close:price});
    }
    const date=local.length?today:(official?.date||today),map=new Map();
    if(official?.date===date)for(const p of official.points)map.set(p.stamp,p);
    if(date===today)for(const p of local)map.set(p.stamp,p);
    return {date,points:[...map.values()].sort((a,b)=>a.stamp-b.stamp)};
  }
  function previousClose(date){
    const live=window.__TW_LIVE_V091__?.stocks?.[CODE],today=twDate();
    if(date===today&&String(live?.date||'')===today.replaceAll('-','')){
      const n=number(live.prev);if(n!==null)return n;
    }
    try{
      const hist=historyCache?.[CODE]||[];
      const prior=hist.filter(x=>{const d=String(x.date||'').replaceAll('/','-');return d&&d<date&&number(x.close)!==null}).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      return prior.length?number(prior.at(-1).close):null;
    }catch{return null}
  }
  function ensure(){
    const sheet=document.getElementById('sheet'),old=document.getElementById('bigChart'),card=old?.closest('.card');
    if(!sheet||!card)return null;
    let root=document.getElementById('pilot00878');
    if(!root){
      root=document.createElement('div');root.id='pilot00878';
      root.innerHTML='<div class="pilot-head"><div><div class="pilot-heading">00878 國泰永續高股息｜盤中走勢（試作）</div><div class="pilot-sub" id="pilot00878date">讀取交易資料中…</div></div><div class="pilot-price" id="pilot00878price">—</div></div><canvas id="pilot00878canvas" aria-label="00878 盤中價格走勢圖"></canvas><div class="pilot-bottom"><span id="pilot00878range">採樣高／低：—</span><span id="pilot00878status">盤中每 4 秒檢查新資料</span></div>';
      card.insertBefore(root,card.firstChild);
    }
    mounted=true;
    return root;
  }
  function paint(force=false){
    const sheet=document.getElementById('sheet');
    if(!sheet)return;
    const on=activePilot();
    sheet.classList.toggle('pilot-chart-view',on);
    if(!on){lastSignature='';return}
    const root=ensure();if(!root)return;
    const {date,points}=pointsAndDay(),ref=previousClose(date),last=points.at(-1),first=points[0];
    const signature=date+'|'+points.length+'|'+(last?.stamp||'')+'|'+(last?.close||'')+'|'+ref;
    if(!force&&signature===lastSignature)return;lastSignature=signature;
    const set=(id,value)=>{const e=document.getElementById(id);if(e)e.textContent=value};
    const recent=date===twDate();
    set('pilot00878date',date.replaceAll('-','/')+(recent?'｜今日盤中':'｜最近留存交易日')+(last?'｜最後成交 '+hm(last.stamp):''));
    set('pilot00878price',last?last.close.toFixed(2):'—');
    set('pilot00878status',points.length<2?'資料不足，未補造走勢':(ref?'白線＝前一交易日收盤價':'前收價尚未驗證；不顯示基準線')+'｜'+points.length+' 個有效採樣點');
    const vals=points.map(p=>p.close),low=vals.length?Math.min(...vals):null,high=vals.length?Math.max(...vals):null;
    set('pilot00878range',low===null?'採樣高／低：—':'採樣高 '+high.toFixed(2)+'　採樣低 '+low.toFixed(2));
    const canvas=root.querySelector('canvas'),ctx=canvas?.getContext('2d');if(!ctx)return;
    const width=canvas.getBoundingClientRect().width||680,height=canvas.getBoundingClientRect().height||315,dpr=Math.min(2.5,window.devicePixelRatio||1);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
    const W=width,H=height,pad={left:57,right:16,top:20,bottom:34},cw=W-pad.left-pad.right,ch=H-pad.top-pad.bottom;
    ctx.font='11px sans-serif';ctx.textBaseline='middle';
    if(points.length<2){ctx.fillStyle='#a9bcd3';ctx.textAlign='center';ctx.fillText('有效盤中資料不足，暫不繪圖',W/2,H/2);return}
    const all=ref===null?vals:[...vals,ref],min=Math.min(...all),max=Math.max(...all),span=Math.max(.08,max-min),lo=min-span*.13,hi=max+span*.13;
    const t0=Date.parse(date+'T09:00:00+08:00'),t1=Date.parse(date+'T13:30:00+08:00');
    const X=t=>pad.left+(t-t0)/(t1-t0)*cw,Y=v=>pad.top+(hi-v)/(hi-lo)*ch;
    ctx.strokeStyle='#24364c';ctx.lineWidth=1;ctx.fillStyle='#91a9c1';ctx.textAlign='right';
    for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,y=Y(v);ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();ctx.fillText(v.toFixed(2),pad.left-8,y)}
    if(ref!==null){ctx.strokeStyle='#f4f4f4';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(pad.left,Y(ref));ctx.lineTo(W-pad.right,Y(ref));ctx.stroke();}
    ctx.fillStyle='#81a4c2';ctx.textAlign='center';
    for(const [label,minute] of [['09',0],['10',60],['11',120],['12',180],['13',240]]){const x=pad.left+(minute/270)*cw;ctx.fillText(label,x,H-13)}
    const trend=ref===null?0:last.close-ref;
    ctx.strokeStyle=trend>0?'#ff6363':trend<0?'#40d47c':'#8bd8ea';ctx.lineWidth=2.1;ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();for(let i=0;i<points.length;i++){const p=points[i],x=X(p.stamp),y=Y(p.close);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)}ctx.stroke();
    const x=X(last.stamp),y=Y(last.close);
    ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,3.5,0,2*Math.PI);ctx.fill();
    ctx.textAlign=x>W-95?'right':'left';ctx.font='bold 12px sans-serif';
    ctx.fillText(last.close.toFixed(2),x>W-95?x-7:x+7,Math.max(12,Math.min(H-pad.bottom-10,y-13)));
    canvas.dataset.sessionDate=date;canvas.dataset.points=String(points.length);canvas.dataset.previousClose=ref===null?'':String(ref);
  }
  function tick(){paint();if(activePilot()&&document.visibilityState==='visible')refreshOfficial().then(()=>paint()).catch(()=>{})}
  window.addEventListener('resize',()=>paint(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')paint(true)});
  setInterval(tick,4000);setTimeout(tick,900);
  window.__TW_PILOT_CHART_00878__={refresh:()=>{lastSignature='';tick()},code:CODE};
})();