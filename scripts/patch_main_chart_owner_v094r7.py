from pathlib import Path

# Patch extras: keep a single authoritative full-day 09:00-13:30 series for main chart.
p=Path('extras-v090.js')
s=p.read_text()
old="""  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas||!Array.isArray(points)||points.length<2||typeof draw!=='function')return false;
    draw(canvas,chronologicalPoints(points).map(x=>({date:x.time,close:x.close})),compact,liveTodayPrice(code));return true;
  }
"""
new="""  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas||!Array.isArray(points)||points.length<2||typeof draw!=='function')return false;
    const ordered=chronologicalPoints(points);
    draw(canvas,ordered.map(x=>({date:x.time,close:x.close})),compact,liveTodayPrice(code));
    const hm=d=>new Date(d).toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false});
    canvas.dataset.todayFull='1';canvas.dataset.todayPoints=String(ordered.length);canvas.dataset.todayStart=hm(ordered[0].time);canvas.dataset.todayEnd=hm(ordered.at(-1).time);
    return true;
  }
"""
assert old in s
s=s.replace(old,new,1)
old="""          for(let i=0;i<ts.length;i++){const close=Number(q.close?.[i]);if(!Number.isFinite(close))continue;const d=new Date(Number(ts[i])*1000),day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});if(day!==today)continue;byTime.set(d.getTime(),{time:d,close})}
"""
new="""          for(let i=0;i<ts.length;i++){
            const close=Number(q.close?.[i]);if(!Number.isFinite(close))continue;
            const d=new Date(Number(ts[i])*1000),day=d.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});if(day!==today)continue;
            const hm=d.toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false});
            if(hm<'09:00'||hm>'13:30')continue;
            byTime.set(d.getTime(),{time:d,close});
          }
"""
assert old in s
s=s.replace(old,new,1)
needle="""  async function refreshTodayFallbackCharts(force=false){
    if(typeof watchlist!=='function')return false;const codes=[...new Set(watchlist().map(String))];await Promise.allSettled(codes.map(code=>ensureTodayChartFor(code,force)));return true;
  }
"""
insert=needle+"""
  function drawResolvedMainToday(code,canvas=null){
    const key=String(code),cached=todayFallbackResolved.get(key);
    if(!cached?.points||cached.points.length<2)return false;
    return drawTodayPoints(key,cached.points,canvas||mainCanvasFor(key),true);
  }
  window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);
"""
assert needle in s
s=s.replace(needle,insert,1)
p.write_text(s)

# Patch live UI painter: if the full-day renderer has data, never overwrite it with one-point MIS series.
p=Path('live-v091.js')
s=p.read_text()
old="""if(m)m.innerHTML='<span>不使用昨日收盤</span><span>15 秒重試</span>';drawLine(canvasFor(r),series.get(code)||[])
"""
new="""if(m)m.innerHTML='<span>不使用昨日收盤</span><span>15 秒重試</span>';const c=canvasFor(r);if(!(typeof window.__TW_DRAW_MAIN_TODAY__==='function'&&window.__TW_DRAW_MAIN_TODAY__(code,c)))drawLine(c,series.get(code)||[])
"""
assert old in s
s=s.replace(old,new,1)
old="""if(m)m.innerHTML=`<span>${q.source}</span><span>成交 ${q.tradeTime}</span>`;drawLine(canvasFor(r),series.get(code)||[]);
"""
new="""if(m)m.innerHTML=`<span>${q.source}</span><span>成交 ${q.tradeTime}</span>`;const c=canvasFor(r);if(!(typeof window.__TW_DRAW_MAIN_TODAY__==='function'&&window.__TW_DRAW_MAIN_TODAY__(code,c)))drawLine(c,series.get(code)||[]);
"""
assert old in s
s=s.replace(old,new,1)
p.write_text(s)

# Bust both JS and service-worker caches so installed PWA cannot remain on r6.
p=Path('index.html')
s=p.read_text()
s=s.replace('./extras-v090.js?v=094r6','./extras-v090.js?v=094r7')
s=s.replace('./live-v091.js?v=094r1','./live-v091.js?v=094r7')
p.write_text(s)

p=Path('sw.js')
s=p.read_text()
s=s.replace("const CACHE='tw-ai-monitor-v094r6';","const CACHE='tw-ai-monitor-v094r7';")
p.write_text(s)
