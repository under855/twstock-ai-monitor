from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text()
old="""  function mergedTodayPoints(code,points){
    const out=chronologicalPoints(points).map(x=>({time:new Date(x.time),close:Number(x.close)})).filter(x=>Number.isFinite(x.close)&&hmTw(x.time)>='09:00'&&hmTw(x.time)<='13:30');
    const lp=livePointFor(code);if(lp){const h=hmTw(lp.time),i=out.findIndex(x=>hmTw(x.time)===h);if(i>=0)out[i]=lp;else out.push(lp)}
    return chronologicalPoints(out);
  }
"""
new="""  function misSeriesFor(code){
    try{
      const day=twIsoDay().replaceAll('-',''),obj=JSON.parse(localStorage.getItem(`tw_live091_series_${day}`)||'{}'),raw=Array.isArray(obj?.[String(code)])?obj[String(code)]:[],byStamp=new Map();
      for(const x of raw){const stamp=Number(x?.stamp),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const d=new Date(stamp),hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS')})}
      return [...byStamp.values()].sort((a,b)=>a.time-b.time);
    }catch{return []}
  }
  function mergedTodayPoints(code,points){
    const base=chronologicalPoints(points).map(x=>({time:new Date(x.time),close:Number(x.close),official:false,source:'Yahoo 5 分鐘補洞'})).filter(x=>Number.isFinite(x.close)&&hmTw(x.time)>='09:00'&&hmTw(x.time)<='13:30');
    const official=misSeriesFor(code);
    if(official.length){const first=official[0].time.getTime(),out=base.filter(x=>x.time.getTime()<first);out.push(...official);return chronologicalPoints(out)}
    const lp=livePointFor(code);if(lp){base.push({...lp,official:true,source:'TWSE MIS 最新成交'})}
    return chronologicalPoints(base);
  }
"""
if old not in s: raise SystemExit('mergedTodayPoints pattern missing')
s=s.replace(old,new,1)
old2="""    canvas.dataset.todayFull='1';canvas.dataset.todayPoints=String(merged.length);canvas.dataset.todayStart=hmTw(merged[0].time);canvas.dataset.todayEnd=hmTw(merged.at(-1).time);canvas.dataset.todayMinTime=hmTw(merged[minI].time);canvas.dataset.todayMaxTime=hmTw(merged[maxI].time);return true;
"""
new2="""    const official=merged.filter(x=>x.official);canvas.dataset.todayFull='1';canvas.dataset.todayPoints=String(merged.length);canvas.dataset.todayOfficialPoints=String(official.length);canvas.dataset.todayOfficialFirst=official.length?String(official[0].time.getTime()):'';canvas.dataset.todayOfficialLast=official.length?String(official.at(-1).time.getTime()):'';canvas.dataset.todayStart=hmTw(merged[0].time);canvas.dataset.todayEnd=hmTw(merged.at(-1).time);canvas.dataset.todayMinTime=hmTw(merged[minI].time);canvas.dataset.todayMaxTime=hmTw(merged[maxI].time);return true;
"""
if old2 not in s: raise SystemExit('today dataset pattern missing')
s=s.replace(old2,new2,1)
old3="""  let taiexTodayCache=null,taiexTodayFetchedAt=0;
"""
new3="""  let taiexTodayCache=null,taiexTodayFetchedAt=0;
  const TAIEX_MIS_KEY=()=>`tw_taiex_mis_series_${twIsoDay().replaceAll('-','')}`;
  let taiexMisSeries=[];
  function loadTaiexMisSeries(){
    try{const a=JSON.parse(localStorage.getItem(TAIEX_MIS_KEY())||'[]');taiexMisSeries=(Array.isArray(a)?a:[]).filter(x=>Number.isFinite(Number(x?.stamp))&&Number.isFinite(Number(x?.close))&&hmTw(Number(x.stamp))>='09:00'&&hmTw(Number(x.stamp))<='13:30').map(x=>({stamp:Number(x.stamp),close:Number(x.close)})).sort((a,b)=>a.stamp-b.stamp)}catch{taiexMisSeries=[]}
  }
  function captureTaiexMis(){
    try{const x=window.__TW_LIVE_V091__?.taiex,stamp=Number(x?.stamp),close=Number(x?.price);if(!Number.isFinite(stamp)||!Number.isFinite(close))return false;const hm=hmTw(stamp);if(hm<'09:00'||hm>'13:30')return false;const last=taiexMisSeries.at(-1);if(last&&stamp<=last.stamp)return false;taiexMisSeries.push({stamp,close});if(taiexMisSeries.length>1200)taiexMisSeries.splice(0,taiexMisSeries.length-1200);localStorage.setItem(TAIEX_MIS_KEY(),JSON.stringify(taiexMisSeries));return true}catch{return false}
  }
  function mergedTaiexPoints(points){
    const base=chronologicalPoints(points).map(x=>({time:new Date(x.time),close:Number(x.close),official:false})).filter(x=>Number.isFinite(x.close)&&hmTw(x.time)>='09:00'&&hmTw(x.time)<='13:30');
    if(!taiexMisSeries.length)return base;const first=taiexMisSeries[0].stamp,out=base.filter(x=>x.time.getTime()<first);out.push(...taiexMisSeries.map(x=>({time:new Date(x.stamp),close:x.close,official:true})));return chronologicalPoints(out)
  }
  loadTaiexMisSeries();
"""
if old3 not in s: raise SystemExit('taiex cache pattern missing')
s=s.replace(old3,new3,1)
old4="""  function drawTaiexTop(points){const c=document.getElementById('taiexChart');if(!c||points.length<2)return false;const txt=document.getElementById('taiexChg')?.textContent||'',m=txt.replaceAll(',','').match(/[+-]?\\d+(?:\\.\\d+)?/),chg=m?Number(m[0]):null;if(!drawFixedIntraday(c,points,true,chg))return false;c.dataset.todayFull='1';c.dataset.todayPoints=String(points.length);c.dataset.todayStart=hmTw(points[0].time);c.dataset.todayEnd=hmTw(points.at(-1).time);const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent=`${points.length} 個 5 分鐘點`;return true}
"""
new4="""  function drawTaiexTop(points){const c=document.getElementById('taiexChart'),merged=mergedTaiexPoints(points);if(!c||merged.length<2)return false;const txt=document.getElementById('taiexChg')?.textContent||'',m=txt.replaceAll(',','').match(/[+-]?\\d+(?:\\.\\d+)?/),chg=m?Number(m[0]):null;if(!drawFixedIntraday(c,merged,true,chg))return false;const official=merged.filter(x=>x.official);c.dataset.todayFull='1';c.dataset.todayPoints=String(merged.length);c.dataset.todayOfficialPoints=String(official.length);c.dataset.todayOfficialFirst=official.length?String(official[0].time.getTime()):'';c.dataset.todayOfficialLast=official.length?String(official.at(-1).time.getTime()):'';c.dataset.todayStart=hmTw(merged[0].time);c.dataset.todayEnd=hmTw(merged.at(-1).time);const msg=document.getElementById('taiexChartMsg');if(msg)msg.textContent=official.length?`MIS 即時 ${official.length} 點｜較早走勢補齊`:`${merged.length} 個 5 分鐘補齊點`;return true}
"""
if old4 not in s: raise SystemExit('drawTaiexTop pattern missing')
s=s.replace(old4,new4,1)
old5="""  function startTaiexTop(){setTimeout(()=>ensureTaiexTop(false),250);setTimeout(()=>ensureTaiexTop(false),1400);setInterval(()=>ensureTaiexTop(true),300000);addEventListener('resize',()=>{if(taiexTodayCache?.length>=2)drawTaiexTop(taiexTodayCache)});return true}
"""
new5="""  function startTaiexTop(){setTimeout(()=>ensureTaiexTop(false),250);setTimeout(()=>ensureTaiexTop(false),1400);setInterval(()=>{captureTaiexMis();if(taiexTodayCache?.length>=2)drawTaiexTop(taiexTodayCache)},15000);setInterval(()=>ensureTaiexTop(true),300000);addEventListener('resize',()=>{if(taiexTodayCache?.length>=2)drawTaiexTop(taiexTodayCache)});return true}
"""
if old5 not in s: raise SystemExit('startTaiexTop pattern missing')
s=s.replace(old5,new5,1)
p.write_text(s)
print('patched charts to hand off from Yahoo backfill to official MIS sequence')
