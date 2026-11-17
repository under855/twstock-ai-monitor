import fs from 'node:fs';
const TZ='Asia/Taipei';
const now=new Date();
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
const get=x=>parts.find(p=>p.type===x)?.value||'';
const date=`${get('year')}-${get('month')}-${get('day')}`,compact=date.replaceAll('-','');
const minutes=Number(get('hour'))*60+Number(get('minute'));
const js=fs.readFileSync('live-v091.js','utf8');
const holidayBlock=js.match(/NON_TRADING_DATES=new Set\(\[([\s\S]*?)\]\)/)?.[1]||'';
const holidays=new Set((holidayBlock.match(/'20\d{6}'/g)||[]).map(x=>x.slice(1,-1)));
const tradingDay=!['Sat','Sun'].includes(get('weekday'))&&!holidays.has(compact);
const previewWindow=minutes>=510&&minutes<540;
const mis='https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw%7Ctse_0050.tw%7Ctse_3711.tw%7Cotc_3293.tw%7Ctse_2002.tw%7Ctse_00878.tw%7Ctse_00919.tw&json=1&delay=0';
const probes=[
 {name:'MIS_CORSDEV',url:'https://proxy.cors.dev/'+mis,type:'mis'},
 {name:'MIS_ALLORIGINS',url:'https://api.allorigins.win/raw?url='+encodeURIComponent(mis),type:'mis'},
 {name:'OFFICIAL_INTRADAY_SNAPSHOT',url:'https://raw.githubusercontent.com/under855/twstock-ai-monitor/market-data/data/intraday/latest.json',type:'snapshot'},
 {name:'OFFICIAL_DAILY_CACHE',url:'https://under855.github.io/twstock-ai-monitor/data/latest.json',type:'daily'},
 {name:'PUBLIC_WEB_APP',url:'https://under855.github.io/twstock-ai-monitor/',type:'web'}
];
function assess(type,data){
 if(type==='mis'){
   if(!Array.isArray(data?.msgArray)||!data.msgArray.length)throw Error('MIS msgArray empty');
   const rows=data.msgArray.filter(x=>['t00','0050','3711','3293','2002','00878','00919'].includes(String(x?.c||'')));
   const todayRows=rows.filter(x=>String(x?.d||'')===compact&&/^\d{2}:\d{2}:\d{2}$/.test(String(x?.t||x?.trade?.t||'')));
   if(!rows.length)throw Error('MIS target codes missing');
   if(tradingDay&&previewWindow&&!todayRows.length)throw Error('試撮時段未收到今日行情日期及時間');
   return {rows:rows.length,todayRows:todayRows.length,
     samples:todayRows.slice(0,3).map(x=>({code:x.c,date:x.d,time:x.t||x.trade?.t||'',hasSimulatedFields:['pz','z','b','a','trade'].some(k=>x?.[k]!=null)})),
     previewNote:'開盤前資料為模擬撮合或買賣申報資訊，不得當成正式成交'};
 }
 if(type==='snapshot'){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data?.date||''))||data.source!=='TWSE MIS official snapshots')throw Error('快照來源或日期無效');
   return {date:data.date,generatedAt:data.generatedAt||'',note:'上次成交快照，開盤前不要求今日新成交'};
 }
 if(type==='daily'){
   if(!data?.symbols?.['0050']||!data.taiex)throw Error('官方每日資料缺少股票或指數');
   return {tradeDate:data.tradeDate||'',note:'官方盤後資料，非試撮行情'};
 }
 if(type==='web'){
   if(!/APP_VERSION='0\.9\.8\.\d+'/.test(data)||!data.includes('live-v091.js'))throw Error('網頁缺少行情程式');
   return {version:data.match(/APP_VERSION='([^']+)'/)?.[1]||''};
 }
 throw Error('unknown probe type');
}
async function probe({name,url,type}){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);
 try{
  const r=await fetch(url+(url.includes('?')?'&':'?')+'preopen='+Date.now(),{signal:ac.signal,cache:'no-store',headers:{'accept':'application/json,text/html;q=0.8','user-agent':'TWStockPreopenSourceAudit/1.0'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const txt=await r.text();return {name,ok:true,details:assess(type,type==='web'?txt:JSON.parse(txt))};
 }catch(e){return{name,ok:false,error:String(e?.message||e)}}
 finally{clearTimeout(timer)}
}
function summary(rows){
 const ok=n=>rows.find(x=>x.name===n)?.ok===true;
 const a=ok('MIS_CORSDEV'),b=ok('MIS_ALLORIGINS');
 return {primary:a,secondary:b,backup:ok('OFFICIAL_INTRADAY_SNAPSHOT'),daily:ok('OFFICIAL_DAILY_CACHE'),web:ok('PUBLIC_WEB_APP'),
   critical:tradingDay&&previewWindow&&!(a||b),issues:rows.filter(x=>!x.ok).map(x=>x.name+': '+x.error)};
}
if(process.argv.includes('--self-test')){
 const j={msgArray:[{c:'0050',d:'20261118',t:'08:42:04',pz:'96.50',b:'96.45'}]};
 if(assess('mis',j).rows!==1)throw Error('preview fixture rejected');
 if(summary([{name:'MIS_CORSDEV',ok:false},{name:'MIS_ALLORIGINS',ok:true}]).primary!==false)throw Error('routing fixture rejected');
 console.log('PREOPEN_SOURCE_AUDIT_SELFTEST_PASS');process.exit(0);
}
if(!tradingDay||!previewWindow){
 console.log('PREOPEN_NOT_A_TRADING_PREVIEW_WINDOW',JSON.stringify({date,time:`${get('hour')}:${get('minute')}`,tradingDay}));
 process.exit(0);
}
const results=await Promise.all(probes.map(probe)),s=summary(results);
const report={checkedAt:now.toISOString(),taipeiDate:date,mode:'TWSE 08:30–09:00 simulated matching connectivity and data date/time verification',results,summary:s};
fs.mkdirSync('source-health',{recursive:true});
fs.writeFileSync('source-health/latest.json',JSON.stringify(report,null,2)+'\n');
const md=['# 開盤前試撮行情接收檢查','','臺灣日期：'+date+'；時間：'+get('hour')+':'+get('minute'),
  '','注意：試撮價格不是成交價格；本測試不要求開盤前有今日實際成交，也不以90秒判定價值錯誤。','',
  '| 通道 | 檢查 | 內容 |','|---|---|---|',
  ...results.map(x=>'| '+x.name+' | '+(x.ok?'正常':'異常')+' | '+(x.ok?JSON.stringify(x.details):x.error).replaceAll('|','/')+' |'),
  '','第一 MIS 通道：'+(s.primary?'成功':'失敗'),
  '第二 MIS 通道：'+(s.secondary?'成功':'失敗'),
  'GitHub 第三備援：'+(s.backup?'可讀':'無法讀取'),
  '有問題的通道：'+(s.issues.join('；')||'無'),'',
  '注意：兩通道皆來自 TWSE MIS，轉接路徑不同不代表行情供應商獨立。'].join('\n');
fs.writeFileSync('source-health/summary.md',md+'\n');
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
console.log(md);
if(s.critical){console.error('PREOPEN_BOTH_MIS_CHANNELS_FAILED');process.exitCode=1}
else if(s.issues.length)console.warn('PREOPEN_PARTIAL_SOURCE_WARNING');
else console.log('PREOPEN_SOURCE_AUDIT_PASS');
