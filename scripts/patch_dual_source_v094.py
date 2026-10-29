from pathlib import Path
p=Path('live-v091.js')
s=p.read_text(encoding='utf-8')

s=s.replace("  const INTERVAL=15000;\n", "  const INTERVAL=15000;\n  const BACKUP_INTERVAL=60000;\n")
s=s.replace("  let lastSuccessAt=0;\n", "  let lastSuccessAt=0;\n  let lastBackupAt=0;\n  let backupBusy=false;\n")

needle="""  async function fetchMis(codes){
    const u=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channelList(codes).join('|'))}&json=1&delay=0&_=${Date.now()}`;
    const j=await viaProxy(u,7000);if(!Array.isArray(j?.msgArray))throw Error('MIS payload missing');return j.msgArray;
  }
"""
insert=needle+"""
  function isoCompact(v){return String(v||'').replaceAll('-','').replaceAll('/','');}
  function sourcePriority(src){return /MIS/.test(String(src||''))?2:1;}
  function newerOrEqual(oldv,newv){
    if(!oldv)return true;
    const os=Number(oldv.stamp)||0,ns=Number(newv.stamp)||0;
    if(ns>os)return true;if(ns<os)return false;
    return sourcePriority(newv.source)>sourcePriority(oldv.source);
  }
  async function fetchBackup(){
    return await getJson(`./data/latest.json?_=${Date.now()}`,7000);
  }
  function parseBackup(j,codes){
    const map=new Map();let idx=null;const wanted=new Set((codes||[]).map(String));
    const ti=j?.taiex||{},td=isoCompact(ti?.date);
    if(td===today()&&num(ti?.close)!=null){
      const tt=/^\\d{2}:\\d{2}:\\d{2}$/.test(String(ti?.time||''))?String(ti.time):'13:33:00';
      const ms=stamp(td,tt);if(ms!=null)idx={date:td,price:num(ti.close),prev:num(ti.previousClose),change:num(ti.change),time:tt,stamp:ms,source:'官方備援資料'};
    }
    const obj=j?.symbols||{};
    for(const code of wanted){
      const x=obj?.[code];if(!x)continue;const d=isoCompact(x.tradeDate);if(d!==today()||num(x.close)==null)continue;
      const tt='13:30:00',ms=stamp(d,tt);if(ms==null)continue;
      map.set(code,{code,date:d,price:num(x.close),prev:num(x.close)-num(x.change),change:num(x.change),open:num(x.open),high:num(x.high),low:num(x.low),volume:num(x.volume),tradeTime:tt,stamp:ms,source:'官方備援收盤資料',live:true});
    }
    return {map,idx};
  }
"""
if needle not in s: raise SystemExit('fetchMis anchor missing')
s=s.replace(needle,insert)

old="""  function acceptQuote(q){
    const old=quotes.get(q.code);if(old&&Number(old.stamp)>Number(q.stamp))return false;quotes.set(q.code,q);
    const a=series.get(q.code)||[],last=a.at(-1);if(!last||Number(last.stamp)<q.stamp)a.push({stamp:q.stamp,close:q.price,source:'MIS'});else if(Number(last.stamp)===q.stamp)last.close=q.price;
    a.sort((x,y)=>x.stamp-y.stamp);if(a.length>MAX_POINTS)a.splice(0,a.length-MAX_POINTS);series.set(q.code,a);return true;
  }
"""
new="""  function acceptQuote(q){
    const old=quotes.get(q.code);if(!newerOrEqual(old,q))return false;quotes.set(q.code,q);
    const a=series.get(q.code)||[],last=a.at(-1);if(!last||Number(last.stamp)<q.stamp)a.push({stamp:q.stamp,close:q.price,source:q.source||'行情'});else if(Number(last.stamp)===q.stamp)last.close=q.price;
    a.sort((x,y)=>x.stamp-y.stamp);if(a.length>MAX_POINTS)a.splice(0,a.length-MAX_POINTS);series.set(q.code,a);return true;
  }
  function acceptIndex(x){if(!x||!newerOrEqual(taiex,x))return false;taiex=x;return true}
"""
if old not in s: raise SystemExit('acceptQuote anchor missing')
s=s.replace(old,new)

oldpoll="""  async function poll(force=false){
    if((!marketOpen()&&!force)||busy)return;busy=true;cycle++;lastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes));let accepted=0;if(idx&&(!taiex||idx.stamp>=taiex.stamp)){taiex=idx;accepted++}for(const q of map.values()){if(acceptQuote(q))accepted++}if(accepted)lastSuccessAt=Date.now();saveToday();paintAll();
    }catch(e){paintAll();debug();window.__TW_LIVE_V091__.error=String(e?.message||e)}finally{busy=false}
  }
"""
newpoll="""  async function pollBackup(force=false){
    if(backupBusy||(!force&&Date.now()-lastBackupAt<BACKUP_INTERVAL))return false;backupBusy=true;lastBackupAt=Date.now();
    try{const codes=requestedCodes(),{map,idx}=parseBackup(await fetchBackup(),codes);let accepted=0;if(acceptIndex(idx))accepted++;for(const q of map.values())if(acceptQuote(q))accepted++;if(accepted){lastSuccessAt=Date.now();saveToday();paintAll();}return accepted>0}catch{return false}finally{backupBusy=false}
  }
  async function poll(force=false){
    if((!marketOpen()&&!force)||busy)return;busy=true;cycle++;lastPollAt=Date.now();
    try{
      const codes=requestedCodes(),{map,idx}=parse(await fetchMis(codes));let accepted=0;if(acceptIndex(idx))accepted++;for(const q of map.values()){if(acceptQuote(q))accepted++}if(accepted)lastSuccessAt=Date.now();saveToday();paintAll();
    }catch(e){await pollBackup(true);paintAll();debug();window.__TW_LIVE_V091__.error=String(e?.message||e)}finally{busy=false}
  }
"""
if oldpoll not in s: raise SystemExit('poll anchor missing')
s=s.replace(oldpoll,newpoll)

oldstart="""  function start(){
    loadToday();paintAll();poll(true);if(marketOpen())setInterval(()=>poll(false),INTERVAL);else{const p=document.getElementById('refreshPill');if(p&&!hasTodayData())p.textContent=`休市／檢查今日最終資料｜v${VERSION}`;debug()}
    addEventListener('focus',()=>poll(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll(true)});
  }
"""
newstart="""  function start(){
    loadToday();paintAll();poll(true);pollBackup(true);if(marketOpen()){setInterval(()=>poll(false),INTERVAL);setInterval(()=>pollBackup(false),BACKUP_INTERVAL)}else{const p=document.getElementById('refreshPill');if(p&&!hasTodayData())p.textContent=`休市／檢查今日最終資料｜v${VERSION}`;debug()}
    addEventListener('focus',()=>{poll(true);pollBackup(true)});document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll(true);pollBackup(true)}});
  }
"""
if oldstart not in s: raise SystemExit('start anchor missing')
s=s.replace(oldstart,newstart)

p.write_text(s,encoding='utf-8')
print('dual source patch applied')
