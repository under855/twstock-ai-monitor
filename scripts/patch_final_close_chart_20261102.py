from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text(encoding='utf-8')
old="""  function mergedTodayPoints(code,points){
    const base=chronologicalPoints(points),baseDay=base.length?new Date(base[0]?.time??base[0]?.stamp).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):'',today=twIsoDay(),byStamp=new Map();
    for(const x of base){const d=new Date(x?.time??x?.stamp),stamp=d.getTime(),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS 官方留存')})}
    if(!baseDay||baseDay===today){for(const x of misSeriesFor(code))byStamp.set(x.time.getTime(),x);const lp=livePointFor(code);if(lp)byStamp.set(lp.time.getTime(),{...lp,official:true,source:'TWSE MIS 最新成交'})}
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
"""
new="""  function rowSessionPrices(code){
    try{
      const row=rowFor(String(code)),day=row?.querySelector('.dayline')?.textContent?.trim()||'';
      const m=day.match(/開\\s*([^\\s]+)\\s*高\\s*([^\\s]+)\\s*低\\s*([^\\s]+)\\s*(?:最新|收盤)\\s*([^\\s]+)/);
      if(!m)return null;const open=Number(String(m[1]).replaceAll(',','')),close=Number(String(m[4]).replaceAll(',',''));
      return Number.isFinite(open)&&Number.isFinite(close)?{open,close}:null;
    }catch{return null}
  }
  function mergedTodayPoints(code,points){
    const base=chronologicalPoints(points),baseDay=base.length?new Date(base[0]?.time??base[0]?.stamp).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}):'',today=twIsoDay(),sessionDay=baseDay||today,byStamp=new Map();
    for(const x of base){const d=new Date(x?.time??x?.stamp),stamp=d.getTime(),close=Number(x?.close);if(!Number.isFinite(stamp)||!Number.isFinite(close))continue;const hm=hmTw(d);if(hm<'09:00'||hm>'13:30')continue;byStamp.set(stamp,{time:d,close,official:true,source:String(x?.source||'TWSE MIS 官方留存')})}
    if(!baseDay||baseDay===today){for(const x of misSeriesFor(code))byStamp.set(x.time.getTime(),x);const lp=livePointFor(code);if(lp)byStamp.set(lp.time.getTime(),{...lp,official:true,source:'TWSE MIS 最新成交'})}
    const q=rowSessionPrices(code);if(q){const tOpen=Date.parse(`${sessionDay}T09:00:00+08:00`),tClose=Date.parse(`${sessionDay}T13:30:00+08:00`);if(Number.isFinite(tOpen))byStamp.set(tOpen,{time:new Date(tOpen),close:q.open,official:true,source:'今日開盤價'});if(Number.isFinite(tClose))byStamp.set(tClose,{time:new Date(tClose),close:q.close,official:true,source:'今日收盤價'})}
    return [...byStamp.values()].sort((a,b)=>a.time-b.time);
  }
"""
if old not in s: raise SystemExit('target mergedTodayPoints block not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
