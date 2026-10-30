#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]

p=ROOT/'extras-v090.js'; s=p.read_text(encoding='utf-8')
old="window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);window.__TW_MAIN_SESSION_DATE__=(code)=>todayFallbackResolved.get(String(code))?.points?.length?new Date(todayFallbackResolved.get(String(code)).points[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):null;"
new="""window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);window.__TW_MAIN_SESSION_DATE__=(code)=>todayFallbackResolved.get(String(code))?.points?.length?new Date(todayFallbackResolved.get(String(code)).points[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):null;
  function drawResolvedDetailToday(code,canvas=null){
    const key=String(code),cached=todayFallbackResolved.get(key),points=cached?.points||misSeriesFor(key);
    return drawTodayPoints(key,points,canvas||document.getElementById('bigChart'),false);
  }
  window.__TW_DRAW_DETAIL_TODAY__=(code,canvas)=>drawResolvedDetailToday(code,canvas);
  window.__TW_DETAIL_SESSION_DATE__=(code)=>todayFallbackResolved.get(String(code))?.points?.length?new Date(todayFallbackResolved.get(String(code)).points[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):null;"""
if old not in s: raise SystemExit('extras export anchor missing')
s=s.replace(old,new,1)
s=s.replace("displayTitle.textContent='今日盤中即時走勢';return","displayTitle.textContent='盤中／最近交易日走勢';return",1)
oldmsg="const msg=document.getElementById('chartMsg');if(msg)msg.textContent=`今日官方分時 ${mergedTodayPoints(key,points).length} 點｜TWSE MIS`;"
newmsg="const msg=document.getElementById('chartMsg'),sd=window.__TW_DETAIL_SESSION_DATE__?.(key)||'';if(msg)msg.textContent=sd===twIsoDay()?`今日官方分時 ${mergedTodayPoints(key,points).length} 點｜TWSE MIS`:`${sd.replaceAll('-','/')} 最近交易日｜${mergedTodayPoints(key,points).length} 點`;"
if oldmsg not in s: raise SystemExit('detail message anchor missing')
s=s.replace(oldmsg,newmsg,1)
p.write_text(s,encoding='utf-8')

p=ROOT/'live-v091.js'; s=p.read_text(encoding='utf-8')
start=s.index('  function paintDetail(){')
end=s.index('  function hasTodayData()',start)
newfn=r'''  function paintDetail(){
    try{
      const code=String(active||'');if(!code||!document.getElementById('sheet')?.classList.contains('show'))return;
      const q=quotes.get(code),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v},big=document.getElementById('bigChart'),title=big?.closest('.card')?.querySelector('h3');
      const drawRetained=()=>typeof window.__TW_DRAW_DETAIL_TODAY__==='function'&&window.__TW_DRAW_DETAIL_TODAY__(code,big);
      if(!q?.live||q.date!==today()){
        if(title)title.textContent='盤中／最近交易日走勢';
        if(drawRetained()){
          const sd=window.__TW_DETAIL_SESSION_DATE__?.(code)||'';set('chartMsg',sd?`${sd.replaceAll('-','/')} 最近交易日走勢`:'最近交易日走勢');
        }else set('chartMsg','最近交易日走勢載入中');
        return;
      }
      set('dPrice',fmt(q.price));set('dOpen',fmt(q.open));set('dRange',`${fmt(q.high)} / ${fmt(q.low)}`);set('dVolume',fmt(q.volume,0));set('dTime',`${q.source}｜${q.tradeTime}`);
      const ch=document.getElementById('dChange');if(ch){ch.textContent=`${q.change>0?'+':''}${fmt(q.change)}`;ch.className=`v ${cls(q.change)}`}
      if(title)title.textContent='今日盤中即時走勢';
      const a=series.get(code)||[];
      if(!drawRetained())drawLine(big,a);
      if(a.length>=2)set('chartMsg',`今日盤中即時走勢｜${hhmm(a[0].stamp)}～${hhmm(a.at(-1).stamp)}｜最新端為 TWSE MIS 成交`);
    }catch{}
  }
'''
s=s[:start]+newfn+s[end:]
p.write_text(s,encoding='utf-8')

p=ROOT/'index.html'; s=p.read_text(encoding='utf-8')
s=s.replace('./extras-v090.js?v=095session1','./extras-v090.js?v=095session2')
s=s.replace('./live-v091.js?v=094r8','./live-v091.js?v=094r9')
p.write_text(s,encoding='utf-8')
p=ROOT/'sw.js'; s=p.read_text(encoding='utf-8')
s=re.sub(r"const CACHE='[^']+'","const CACHE='tw-ai-monitor-v095session2'",s,1)
p.write_text(s,encoding='utf-8')
print('patched detail latest-session ownership')
