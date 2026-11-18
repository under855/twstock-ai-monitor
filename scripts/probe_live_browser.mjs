import {chromium} from 'playwright-core';
import fs from 'node:fs';
const chrome=process.env.CHROME;
if(!chrome)throw Error('CHROME_REQUIRED');
const b=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
 const ctx=await b.newContext({timezoneId:'Asia/Taipei',locale:'zh-TW',viewport:{width:1280,height:900},serviceWorkers:'block'});
 const page=await ctx.newPage(),issues=[],network=[];
 if(process.env.PROBE_OVERRIDE_JS==='1')await page.route('**/live-v091.js?*',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync('live-v091.js','utf8')}));
 page.on('pageerror',e=>issues.push('JS '+e.message.slice(0,200)));
 page.on('requestfailed',r=>{if(/mis\.twse|cors\.dev|allorigins|intraday\/latest/.test(r.url()))network.push({channel:r.url().includes('allorigins')?'secondary':r.url().includes('cors.dev')?'primary':'backup',error:r.failure()?.errorText||''})});
 page.on('response',r=>{if(/mis\.twse|cors\.dev|allorigins|intraday\/latest/.test(r.url()))network.push({channel:r.url().includes('allorigins')?'secondary':r.url().includes('cors.dev')?'primary':'backup',status:r.status()})});
 await page.goto('https://under855.github.io/twstock-ai-monitor/?healthprobe='+Date.now(),{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(process.env.PROBE_OVERRIDE_JS==='1'?27000:19000);
 const state=await page.evaluate(()=>({
  time:new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),
  version:document.querySelector('body')?.dataset?.version||document.querySelector('script[src*="live-v091.js"]')?.src,
  market:window.__TW_SCHEDULER_STATE__?.(),live:window.__TW_LIVE_V091__&&{
  version:window.__TW_LIVE_V091__.version,marketWindow:window.__TW_LIVE_V091__.marketWindow,lastMisReceivedAt:window.__TW_LIVE_V091__.lastMisReceivedAt,cycle:window.__TW_LIVE_V091__.cycle,failures:window.__TW_LIVE_V091__.failures,lastError:window.__TW_LIVE_V091__.lastError,secondarySource:window.__TW_LIVE_V091__.secondarySource,backupSource:window.__TW_LIVE_V091__.backupSource,taiex:window.__TW_LIVE_V091__.taiex,
  stocks:Object.fromEntries(Object.entries(window.__TW_LIVE_V091__.stocks||{}).slice(0,12).map(([k,v])=>[k,{date:v.date,price:v.price,tradeTime:v.tradeTime,freshness:v.freshness,source:v.source,domPrice:v.domPrice,domState:v.domState,invalidReason:v.invalidReason}]))
  },
  indicator:document.getElementById('liveBadge')?.textContent,refreshPill:document.getElementById('refreshPill')?.textContent,
  taiexText:document.getElementById('taiex')?.textContent,rows:[...document.querySelectorAll('#watch article.row')].slice(0,12).map(e=>({code:e.querySelector('.sym')?.textContent,price:e.querySelector('.price')?.textContent,meta:e.querySelector('.meta')?.textContent}))
 }));
 console.log('BROWSER_LIVE_PROBE',JSON.stringify({state,network:network.slice(-35),issues:issues.slice(-15)}));
 if(process.env.PROBE_OVERRIDE_JS==='1'&&state.market?.marketOpen&&(!state.live?.lastMisReceivedAt||!state.live?.taiex?.price||!state.rows.some(r=>r.price&&r.price!=='—')))throw Error('STAGED_BROWSER_STILL_NO_LIVE_STOCK_DATA');
 if(process.env.PROBE_OVERRIDE_JS==='1'&&!state.market?.marketOpen)console.log('OFF_HOURS_NO_INTRADAY_ASSERTION: market closed, explicit simulated failures tested separately');
 if(process.env.PROBE_REQUIRE_QUOTES==='1'&&state.market?.marketOpen){
   const validRows=state.rows.filter(r=>r.price&&r.price!=='—'&&/成交|官方收盤|備援/.test(r.meta||''));
   const today=await page.evaluate(()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('')});
   const idx=state.live?.taiex;
   if(!idx||idx.date!==today||!Number.isFinite(idx.price)||!idx.stamp||state.taiexText==='—'||validRows.length<Math.min(4,state.rows.length))throw Error('LIVE_BROWSER_VISIBLE_QUOTE_COVERAGE_FAILED '+validRows.length+'/'+state.rows.length);
   console.log('LIVE_BROWSER_VISIBLE_QUOTE_COVERAGE_PASS',validRows.length,state.rows.length);
 }
}catch(e){console.error('BROWSER_PROBE_ERROR',String(e.stack||e));process.exitCode=1}
finally{await b.close()}
