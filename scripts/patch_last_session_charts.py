#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
extras=ROOT/'extras-v090.js'
index=ROOT/'index.html'
s=extras.read_text(encoding='utf-8')

# Make intraday drawing session-date aware instead of forcing today's date.
s=s.replace("    const day=twIsoDay(),t0=Date.parse(`${day}T09:00:00+08:00`),t1=Date.parse(`${day}T13:30:00+08:00`),span=t1-t0;",
"    const firstDate=d[0]?.time instanceof Date?d[0].time:new Date(d[0]?.time);const day=Number.isFinite(firstDate?.getTime?.())?firstDate.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):twIsoDay(),t0=Date.parse(`${day}T09:00:00+08:00`),t1=Date.parse(`${day}T13:30:00+08:00`),span=t1-t0;")

# Replace official intraday payload handling so latest retained session is valid even on weekends/holidays.
old="""  async function officialTodayIntraday(code,force=false){
    const out=[],today=twIsoDay(),j=await officialIntradayPayloadNow(force),raw=j?.date===today&&Array.isArray(j?.stocks?.[String(code)])?j.stocks[String(code)]:[];
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;out.push({time:d,close,official:true,source:'TWSE MIS 官方留存'})}
    if(!out.length)return misSeriesFor(code);
    return chronologicalPoints(out);
  }
"""
new="""  async function officialLatestIntraday(code,force=false){
    const out=[],today=twIsoDay(),j=await officialIntradayPayloadNow(force),session=String(j?.date||''),raw=Array.isArray(j?.stocks?.[String(code)])?j.stocks[String(code)]:[];
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;out.push({time:d,close,official:true,source:'TWSE MIS 官方留存',sessionDate:session})}
    const local=misSeriesFor(code);
    if(session===today&&local.length){const by=new Map(out.map(x=>[x.time.getTime(),x]));for(const x of local)by.set(x.time.getTime(),x);return [...by.values()].sort((a,b)=>a.time-b.time)}
    if(out.length)return chronologicalPoints(out);
    return local;
  }
"""
if old not in s: raise SystemExit('officialTodayIntraday block missing')
s=s.replace(old,new)
s=s.replace('const p=officialTodayIntraday(key,force).then(points=>{','const p=officialLatestIntraday(key,force).then(points=>{')

# Stop mixing current-day quote point into a retained prior session.
old="""  function mergedTodayPoints(code,points){
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
"""
new="""  function mergedTodayPoints(code,points){
    const base=chronologicalPoints(points),baseDay=base.length?new Date(base[0]?.time??base[0]?.stamp).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):'',today=twIsoDay(),byStamp=new Map();
    for(const x of base){const d=new Date(x?.time??x?.stamp),stamp=d.getTime(),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS 官方留存')})}
    if(!baseDay||baseDay===today){for(const x of misSeriesFor(code))byStamp.set(x.time.getTime(),x);const lp=livePointFor(code);if(lp)byStamp.set(lp.time.getTime(),{...lp,official:true,source:'TWSE MIS 最新成交'})}
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
"""
if old not in s: raise SystemExit('mergedTodayPoints block missing')
s=s.replace(old,new)

# Label canvas with session date and make main chart owner work for latest session.
s=s.replace("canvas.dataset.todayFull=fullStart?'1':'0';canvas.dataset.todayPoints=String(merged.length);",
"const sessionDate=new Date(merged[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});canvas.dataset.sessionDate=sessionDate;canvas.dataset.todayFull=fullStart?'1':'0';canvas.dataset.todayPoints=String(merged.length);")

# Add official TWSE index full-session loader using last known official market date.
insert_after="""  async function officialTaiexIntraday(force=false){
    const today=twIsoDay(),j=await officialIntradayPayloadNow(force),raw=j?.date===today&&Array.isArray(j?.taiex)?j.taiex:[],byStamp=new Map();
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:'TWSE MIS 指數官方留存'})}
    for(const x of taiexMisSeries)byStamp.set(Number(x.stamp),{time:new Date(Number(x.stamp)),close:Number(x.close),official:true,source:'TWSE MIS 指數'});
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
"""
replacement="""  async function latestOfficialTradeDate(){
    try{const j=await fetchJson(`./data/latest.json?_=${Date.now()}`,5000),d=String(j?.taiex?.date||'').replaceAll('/','-');if(/^\\d{4}-\\d{2}-\\d{2}$/.test(d))return d}catch{}return twIsoDay();
  }
  async function twseIndexFullSession(dateIso){
    try{const compact=String(dateIso||'').replaceAll('-',''),j=await officialJson(`https://www.twse.com.tw/exchangeReport/MI_5MINS_INDEX?response=json&date=${compact}`,12000),date=String(j?.date||compact),rows=Array.isArray(j?.data)?j.data:[],day=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,out=[];for(const r of rows){const hm=String(r?.[0]||'');const close=offNum(r?.[1]);if(!/^\\d{2}:\\d{2}:\\d{2}$/.test(hm)||close==null||hm<'09:00:00'||hm>'13:30:00')continue;const ms=Date.parse(`${day}T${hm}+08:00`);if(Number.isFinite(ms))out.push({time:new Date(ms),close,official:true,source:'TWSE 每5秒指數官方資料'})}return out}catch{return []}
  }
  async function officialTaiexIntraday(force=false){
    const today=twIsoDay(),j=await officialIntradayPayloadNow(force),session=String(j?.date||''),raw=Array.isArray(j?.taiex)?j.taiex:[],byStamp=new Map();
    for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:'TWSE MIS 指數官方留存'})}
    if(session===today){for(const x of taiexMisSeries)byStamp.set(Number(x.stamp),{time:new Date(Number(x.stamp)),close:Number(x.close),official:true,source:'TWSE MIS 指數'})}
    let out=[...byStamp.values()].sort((a,b)=>a.time-b.time);
    if(out.length>=2)return out;
    const tradeDate=await latestOfficialTradeDate(),full=await twseIndexFullSession(tradeDate);return full.length>=2?full:out;
  }
"""
if insert_after not in s: raise SystemExit('taiex block missing')
s=s.replace(insert_after,replacement)

# Dynamic labels for market chart and stock rows.
s=s.replace("const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent=official.length?`TWSE MIS 官方 ${official.length} 點`:`官方分時資料累積中`;return true}",
"const msg=document.getElementById('taiexChartMsg'),sessionDate=new Date(merged[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});c.dataset.sessionDate=sessionDate;if(msg)msg.textContent=sessionDate===twIsoDay()?`今日｜TWSE 官方 ${official.length||merged.length} 點`:`${sessionDate.replaceAll('-','/')} 最近交易日｜TWSE 官方`;return true}")
s=s.replace("if(p.length>=2){taiexTodayCache=p;taiexTodayFetchedAt=Date.now();return drawTaiexTop(p)}const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent='官方分時資料不足／從開啟後累積';return false",
"if(p.length>=2){taiexTodayCache=p;taiexTodayFetchedAt=Date.now();return drawTaiexTop(p)}const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent='最近交易日分時資料暫時無法取得';return false")

# Expose helper used by live-v091 to preserve latest-session chart when quote repaint runs.
s=s.replace("window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);",
"window.__TW_DRAW_MAIN_TODAY__=(code,canvas)=>drawResolvedMainToday(code,canvas);window.__TW_MAIN_SESSION_DATE__=(code)=>todayFallbackResolved.get(String(code))?.points?.length?new Date(todayFallbackResolved.get(String(code)).points[0].time).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):null;")

# Ensure labels below each stock chart describe the displayed session, not always today.
s=s.replace("const p=officialLatestIntraday(key,force).then(points=>{\n      todayFallbackCache.delete(key);todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});drawTodayPoints(key,points,mainCanvasFor(key),true);return points;",
"const p=officialLatestIntraday(key,force).then(points=>{\n      todayFallbackCache.delete(key);todayFallbackResolved.set(key,{points,fetchedAt:Date.now()});const c=mainCanvasFor(key);drawTodayPoints(key,points,c,true);const r=rowFor(key),f=r?.querySelector('.sparkFallback');if(f&&c)f.replaceWith(c);return points;")

extras.write_text(s,encoding='utf-8')

# UI copy and layout: chart column remains bounded on desktop; mobile still fluid.
h=index.read_text(encoding='utf-8')
h=h.replace('台灣加權指數｜今日走勢','台灣加權指數｜最近交易日走勢')
h=h.replace('載入今日分時…','載入最近交易日分時…')
h=h.replace('今日盤中即時走勢','盤中／最近交易日走勢')
h=h.replace(".row{display:grid;grid-template-columns:96px 82px minmax(90px,1fr) 64px 28px;", ".row{display:grid;grid-template-columns:96px 82px minmax(260px,520px) 64px 28px;")
h=h.replace("@media(max-width:720px){.market{grid-template-columns:1fr 1fr}.marketChartCard{grid-column:1/-1}.marketCard:first-child{grid-column:auto}.row{grid-template-columns:88px 75px 1fr 58px 24px}", "@media(max-width:720px){.market{grid-template-columns:1fr 1fr}.marketChartCard{grid-column:1/-1}.marketCard:first-child{grid-column:auto}.row{grid-template-columns:88px 75px minmax(90px,1fr) 58px 24px}")
h=h.replace('extras-v090.js?v=095official1','extras-v090.js?v=095session1')
index.write_text(h,encoding='utf-8')

# Patch live repaint wording and allow prior-session spark to remain authoritative after close/holidays.
live=ROOT/'live-v091.js';t=live.read_text(encoding='utf-8')
t=t.replace("if(data.length<2){ctx.fillStyle='#91a8c2';ctx.font=`${Math.round(11*dpr)}px sans-serif`;ctx.textAlign='center';ctx.fillText('今日盤中線累積中',w/2,h/2);return false}","if(data.length<2){if(canvas.dataset.sessionDate&&canvas.dataset.todayPoints)return false;ctx.fillStyle='#91a8c2';ctx.font=`${Math.round(11*dpr)}px sans-serif`;ctx.textAlign='center';ctx.fillText('載入最近交易日走勢',w/2,h/2);return false}")
t=t.replace("if(!q?.live||q.date!==today()){maskRow(code);return}","if(!q?.live||q.date!==today()){const r=row(code),c=canvasFor(r);if(typeof window.__TW_DRAW_MAIN_TODAY__==='function'&&window.__TW_DRAW_MAIN_TODAY__(code,c))return;maskRow(code);return}")
t=t.replace("if(ch){ch.textContent='盤中載入中';ch.className='chg flat'}if(d)d.textContent='今日盤中資料載入中';if(m)m.innerHTML='<span>不使用昨日收盤</span><span>15 秒重試</span>';",
"if(ch){ch.textContent='行情載入中';ch.className='chg flat'}if(d)d.textContent='載入最近交易日行情';if(m)m.innerHTML='<span>TWSE／TPEx 官方行情</span><span>15 秒重試</span>';")
live.write_text(t,encoding='utf-8')

sw=ROOT/'sw.js';w=sw.read_text(encoding='utf-8');w=re.sub(r"const CACHE='[^']+'","const CACHE='tw-ai-monitor-v095session1'",w);sw.write_text(w,encoding='utf-8')
print('patched latest-session chart behavior')
