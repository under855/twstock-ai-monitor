import fs from 'node:fs';

const TZ='Asia/Taipei';
const now=new Date();
const date=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const mis='https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw%7Ctse_0050.tw&json=1&delay=0';
const probes=[
  {name:'MIS_CORSDEV',url:'https://proxy.cors.dev/'+mis,type:'mis'},
  {name:'MIS_ALLORIGINS',url:'https://api.allorigins.win/raw?url='+encodeURIComponent(mis),type:'mis'},
  {name:'OFFICIAL_INTRADAY_SNAPSHOT',url:'https://raw.githubusercontent.com/under855/twstock-ai-monitor/market-data/data/intraday/latest.json',type:'snapshot'},
  {name:'OFFICIAL_DAILY_CACHE',url:'https://under855.github.io/twstock-ai-monitor/data/latest.json',type:'daily'},
  {name:'PUBLIC_WEB_APP',url:'https://under855.github.io/twstock-ai-monitor/',type:'web'}
];
function assess(type,data){
  if(type==='mis'){
    if(!Array.isArray(data?.msgArray))throw Error('MIS msgArray missing');
    if(!data.msgArray.length)throw Error('MIS empty');
    const sample=data.msgArray.find(m=>m?.c==='t00'||m?.c==='0050');
    if(!sample||!(/^\d{8}$/.test(String(sample.d||''))))throw Error('MIS quote date invalid');
    return {quoteDate:sample.d,quoteTime:sample.t||'',freshness:'not tested outside market hours'};
  }
  if(type==='snapshot'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data?.date||'')))throw Error('snapshot trading date missing');
    if(data.source!=='TWSE MIS official snapshots')throw Error('snapshot provenance invalid');
    const stock=data.stocks?.['0050'];
    if(!Array.isArray(stock))throw Error('snapshot 0050 array missing');
    return {tradeDate:data.date,generatedAt:data.generatedAt||'',freshness:'not tested outside market hours'};
  }
  if(type==='daily'){
    if(!data?.symbols?.['0050']||!data?.taiex||!/^\d{4}-\d{2}-\d{2}$/.test(String(data.tradeDate)))throw Error('daily market payload missing critical symbols');
    if(Number(data.symbols['0050']?.close)<=0)throw Error('daily 0050 price invalid');
    return {tradeDate:data.tradeDate,generatedAt:data.generatedAt||'',freshness:'official close; not a live intraday quote'};
  }
  if(type==='web'){
    if(!/APP_VERSION='0\.9\.8\.\d+'/.test(data)||!data.includes('live-v091.js'))throw Error('application HTML missing quote controller');
    return {deployedVersion:data.match(/APP_VERSION='([^']+)'/)?.[1]||'unknown'};
  }
  throw Error('unsupported probe type');
}
async function probe(item){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),10000);
  try{
    const r=await fetch(item.url+'?health='+Date.now(),{cache:'no-store',signal:ac.signal,headers:{'accept':'application/json,text/html;q=0.8','user-agent':'TWStockMonitorSourceAudit/1.0'}});
    if(!r.ok)throw Error('HTTP '+r.status);
    const raw=await r.text();
    const payload=item.type==='web'?raw:JSON.parse(raw);
    return {name:item.name,ok:true,http:r.status,details:assess(item.type,payload)};
  }catch(e){return {name:item.name,ok:false,error:String(e?.message||e)}}
  finally{clearTimeout(timer)}
}
function summarize(rows){
  const ok=n=>rows.find(x=>x.name===n)?.ok===true;
  const primary=ok('MIS_CORSDEV')||ok('MIS_ALLORIGINS');
  const alternate=ok('OFFICIAL_INTRADAY_SNAPSHOT');
  const daily=ok('OFFICIAL_DAILY_CACHE');
  const app=ok('PUBLIC_WEB_APP');
  const problems=[];
  if(!primary)problems.push('Both primary CORS gateways failed');
  if(!alternate)problems.push('Official intraday GitHub backup unavailable');
  if(!daily)problems.push('Official daily cache unavailable');
  if(!app)problems.push('Published app not accessible');
  return {primary,alternate,daily,app,problems,operational:app&&daily&&(primary||alternate)};
}
if(process.argv.includes('--self-test')){
  const data={msgArray:[{c:'t00',d:'20261116',t:'13:30:00',z:'1'}]};
  if(!assess('mis',data).quoteDate)throw Error('mis fixture failed');
  if(!assess('snapshot',{date:'2026-11-16',source:'TWSE MIS official snapshots',stocks:{'0050':[]}}).tradeDate)throw Error('snapshot fixture failed');
  const sample=[{name:'MIS_CORSDEV',ok:false},{name:'MIS_ALLORIGINS',ok:true},{name:'OFFICIAL_INTRADAY_SNAPSHOT',ok:true},{name:'OFFICIAL_DAILY_CACHE',ok:true},{name:'PUBLIC_WEB_APP',ok:true}];
  if(!summarize(sample).operational)throw Error('failover fixture failed');
  if(summarize(sample.map(x=>({...x,ok:false}))).operational)throw Error('all-failed fixture failed');
  console.log('MIDNIGHT_SOURCE_AUDIT_SELFTEST_PASS');process.exit(0);
}
const results=await Promise.all(probes.map(probe));
const summary=summarize(results);
const report={checkedAt:now.toISOString(),taipeiDate:date,mode:'midnight source reachability and format only (not a live market quote validation)',results,summary};
fs.mkdirSync('source-health',{recursive:true});
fs.writeFileSync('source-health/latest.json',JSON.stringify(report,null,2)+'\n');
const md=[
  '# 午夜行情來源健康檢查',
  '',
  '臺灣日期：'+date+'；UTC：'+now.toISOString(),
  '',
  '**注意：午夜休市，通過表示來源可存取且資料格式正確，不代表次日盤中即時行情已驗證。**',
  '',
  '| 來源 | 檢查 | 回報 |',
  '|---|---|---|',
  ...results.map(x=>'| '+x.name+' | '+(x.ok?'通過':'失敗')+' | '+(x.ok?JSON.stringify(x.details):x.error).replaceAll('|','/')+' |'),
  '',
  '可用主要轉接：'+(summary.primary?'是':'否'),
  '備援 GitHub 快照可用：'+(summary.alternate?'是':'否'),
  '整體最低可用條件：'+(summary.operational?'達成':'未達成'),
  '',
  '來源切換：APP 僅會在已預先核可的 MIS 轉接與官方快照間切換；不會自動新增未知或未授權的資料供應商。',
  '',
  ...(summary.problems.length?['異常：'+summary.problems.join('；')]:['未發現連線與格式異常'])
].join('\n');
fs.writeFileSync('source-health/summary.md',md+'\n');
console.log(md);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
if(!summary.operational){console.error('MIDNIGHT_SOURCE_HEALTH_FAILED');process.exitCode=1}
else console.log('MIDNIGHT_SOURCE_HEALTH_PASS');
