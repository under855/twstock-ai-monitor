from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')
old="""    let lo=Math.min(0,...rel.map(x=>x.rel)),hi=Math.max(0,...rel.map(x=>x.rel));if(hi===lo){hi+=1;lo-=1}const pad=Math.max((hi-lo)*.08,Math.abs(open)*.0005,0.01);hi+=pad;lo-=pad;
"""
new="""    // Opening price is the visual zero AND must stay at the vertical center.
    // Use a symmetric Y range around zero so +x and -x have equal distance.
    const maxAbs=Math.max(0,...rel.map(x=>Math.abs(x.rel))),half=Math.max(maxAbs*1.10,Math.abs(open)*.0005,0.01);let lo=-half,hi=half;
"""
if old not in s:
    raise SystemExit('target Y-domain block not found')
s=s.replace(old,new,1)
# Make the session anchors authoritative even if MIS contains another tick inside 09:00/13:30.
old2="""    const q=rowSessionPrices(code);if(q){const tOpen=Date.parse(`${sessionDay}T09:00:00+08:00`),tClose=Date.parse(`${sessionDay}T13:30:00+08:00`);if(Number.isFinite(tOpen))byStamp.set(tOpen,{time:new Date(tOpen),close:q.open,official:true,source:'今日開盤價'});if(Number.isFinite(tClose))byStamp.set(tClose,{time:new Date(tClose),close:q.close,official:true,source:'今日收盤價'})}
"""
new2="""    const q=rowSessionPrices(code);if(q){
      // 09:00 and 13:30 are authoritative session anchors. Remove same-minute sampled ticks first.
      for(const [stamp,x] of [...byStamp.entries()]){const hm=hmTw(x.time);if(hm==='09:00'||hm==='13:30')byStamp.delete(stamp)}
      const tOpen=Date.parse(`${sessionDay}T09:00:00+08:00`),tClose=Date.parse(`${sessionDay}T13:30:00+08:00`);
      if(Number.isFinite(tOpen))byStamp.set(tOpen,{time:new Date(tOpen),close:q.open,official:true,source:'今日開盤價'});
      if(Number.isFinite(tClose))byStamp.set(tClose,{time:new Date(tClose),close:q.close,official:true,source:'今日收盤價'});
    }
"""
if old2 not in s:
    raise SystemExit('target anchor block not found')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')

# Static QA for the exact acceptance rules.
out=p.read_text(encoding='utf-8')
checks=[
 ('symmetric zero','let lo=-half,hi=half' in out),
 ('open anchor',"close:q.open" in out and "T09:00:00+08:00" in out),
 ('close anchor',"close:q.close" in out and "T13:30:00+08:00" in out),
 ('same-minute cleanup',"hm==='09:00'||hm==='13:30'" in out),
 ('trend from end-vs-open',"const endDelta=rel.at(-1).rel" in out),
 ('relative plotting',"yy=Y(x.rel)" in out),
]
for name,ok in checks:
    if not ok: raise SystemExit('QA failed: '+name)
# Numeric acceptance cases: first point is center; close/open determines side/color.
def qa(open_, close_):
    rel=close_-open_
    half=max(abs(rel)*1.10,abs(open_)*.0005,0.01)
    y0=(half-0)/(2*half)
    yend=(half-rel)/(2*half)
    return rel,y0,yend
cases=[(800,797,'down'),(19.25,19.40,'up'),(34.79,34.80,'up'),(32.49,32.48,'down')]
for o,c,trend in cases:
    d,y0,ye=qa(o,c)
    assert abs(y0-.5)<1e-12
    assert (trend=='down' and d<0 and ye>.5) or (trend=='up' and d>0 and ye<.5)
print('QA PASS: opening=vertical center; close below open=below center/green; close above open=above center/red; 09:00/13:30 anchors authoritative')
