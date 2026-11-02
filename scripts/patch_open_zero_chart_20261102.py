from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')
start=s.index('  function drawFixedIntraday(canvas,points,compact=false,change=null){')
end=s.index('\n  function sessionChangeFor(code){', start)
new=r'''  function drawFixedIntraday(canvas,points,compact=false,change=null){
    if(!canvas||!Array.isArray(points)||points.length<2)return false;const ctx=canvas.getContext('2d');if(!ctx)return false;
    const r=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),W=Math.max(40,Math.round((r.width||620)*dpr)),H=Math.max(28,Math.round((r.height||(compact?50:220))*dpr));if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;ctx.clearRect(0,0,W,H);
    const d=chronologicalPoints(points).filter(x=>Number.isFinite(Number(x.close)));if(d.length<2)return false;
    // This chart is relative to TODAY'S OPEN, not previous close. 09:00 is the zero baseline.
    const open=Number(d[0].close),rel=d.map(x=>({...x,rel:Number(x.close)-open}));
    let lo=Math.min(0,...rel.map(x=>x.rel)),hi=Math.max(0,...rel.map(x=>x.rel));if(hi===lo){hi+=1;lo-=1}const pad=Math.max((hi-lo)*.08,Math.abs(open)*.0005,0.01);hi+=pad;lo-=pad;
    const p={l:compact?4*dpr:44*dpr,r:compact?4*dpr:12*dpr,t:6*dpr,b:compact?4*dpr:24*dpr};
    const firstDate=d[0]?.time instanceof Date?d[0].time:new Date(d[0]?.time);const day=Number.isFinite(firstDate?.getTime?.())?firstDate.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):twIsoDay(),t0=Date.parse(`${day}T09:00:00+08:00`),t1=Date.parse(`${day}T13:30:00+08:00`),span=t1-t0;
    const X=x=>p.l+Math.max(0,Math.min(1,(new Date(x.time).getTime()-t0)/span))*(W-p.l-p.r),Y=v=>p.t+(H-p.t-p.b)*(hi-Number(v))/(hi-lo),zeroY=Y(0);
    if(!compact){ctx.strokeStyle='#1e3550';ctx.fillStyle='#91a8c2';ctx.font=`${11*dpr}px sans-serif`;ctx.lineWidth=Math.max(1,dpr);for(let k=0;k<4;k++){const y=p.t+(H-p.t-p.b)*k/3;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();ctx.fillText((hi-(hi-lo)*k/3).toFixed(2),3*dpr,y+4*dpr)}ctx.save();ctx.strokeStyle='#54708f';ctx.setLineDash([4*dpr,3*dpr]);ctx.beginPath();ctx.moveTo(p.l,zeroY);ctx.lineTo(W-p.r,zeroY);ctx.stroke();ctx.restore();ctx.fillText('0',3*dpr,zeroY+4*dpr);for(const [label,ratio] of [['09:00',0],['11:15',.5],['13:30',1]]){const x=p.l+(W-p.l-p.r)*ratio;ctx.fillText(label,Math.max(2*dpr,Math.min(W-42*dpr,x-14*dpr)),H-6*dpr)}}
    // Intraday line color is close/latest vs today's open. Never use previous-close change here.
    const endDelta=rel.at(-1).rel,trend=endDelta>0?'up':endDelta<0?'down':'flat';ctx.strokeStyle=trend==='up'?'#ff7272':trend==='down'?'#64d69a':'#d2dceb';canvas.dataset.trendColor=trend;canvas.dataset.trendChange=String(endDelta);canvas.dataset.openPrice=String(open);canvas.dataset.endVsOpen=String(endDelta);ctx.lineWidth=Math.max(1.5*dpr,compact?1.8*dpr:2.2*dpr);ctx.beginPath();rel.forEach((x,i)=>{const xx=X(x),yy=Y(x.rel);if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)});ctx.stroke();return true;
  }'''
s=s[:start]+new+s[end:]
p.write_text(s,encoding='utf-8')
print('patched drawFixedIntraday: open=0, endpoint/color=last-open')
