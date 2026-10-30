#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

p=ROOT/'extras-v090.js'
s=p.read_text(encoding='utf-8')

old="""    const fallback=d.at(-1).close-d[0].close,delta=Number.isFinite(Number(change))?Number(change):fallback;ctx.strokeStyle=delta>=0?'#ff7272':'#64d69a';ctx.lineWidth=Math.max(1.5*dpr,compact?1.8*dpr:2.2*dpr);ctx.beginPath();d.forEach((x,i)=>{const xx=X(x),yy=Y(x.close);if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)});ctx.stroke();return true;
  }
  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas)return false;const merged=mergedTodayPoints(code,Array.isArray(points)?points:[]),change=Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.change);
"""
new="""    const delta=Number.isFinite(Number(change))?Number(change):0,trend=delta>0?'up':delta<0?'down':'flat';ctx.strokeStyle=trend==='up'?'#ff7272':trend==='down'?'#64d69a':'#d2dceb';canvas.dataset.trendColor=trend;canvas.dataset.trendChange=String(delta);ctx.lineWidth=Math.max(1.5*dpr,compact?1.8*dpr:2.2*dpr);ctx.beginPath();d.forEach((x,i)=>{const xx=X(x),yy=Y(x.close);if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)});ctx.stroke();return true;
  }
  function sessionChangeFor(code){
    try{
      const row=rowFor(String(code)),txt=row?.querySelector('.chg')?.textContent?.trim()||'';
      const m=txt.match(/[-+]?\\d+(?:\\.\\d+)?/);if(m){const n=Number(m[0]);if(Number.isFinite(n))return n}
    }catch{}
    try{const n=Number(window.__TW_LIVE_V091__?.stocks?.[String(code)]?.change);if(Number.isFinite(n))return n}catch{}
    return 0;
  }
  function drawTodayPoints(code,points,canvas,compact){
    if(!canvas)return false;const merged=mergedTodayPoints(code,Array.isArray(points)?points:[]),change=sessionChangeFor(code);
"""
if old not in s: raise SystemExit('chart color anchor not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

p=ROOT/'index.html'; s=p.read_text(encoding='utf-8')
s=re.sub(r'extras-v090\.js\?v=[^"\']+','extras-v090.js?v=095color1',s,1)
p.write_text(s,encoding='utf-8')

p=ROOT/'sw.js'; s=p.read_text(encoding='utf-8')
s=re.sub(r"const CACHE='[^']+'", "const CACHE='tw-ai-monitor-v095color1'", s,1)
p.write_text(s,encoding='utf-8')
print('patched chart colors: previous-close up=red, down=green, flat=neutral; no open-close fallback')
