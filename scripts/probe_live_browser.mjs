import {chromium} from 'playwright-core';
const chrome=process.env.CHROME;
if(!chrome)throw Error('CHROME_REQUIRED');
const b=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
 const ctx=await b.newContext({timezoneId:'Asia/Taipei',locale:'zh-TW',viewport:{width:1280,height:900}});
 const page=await ctx.newPage(),issues=[],network=[];
 page.on('pageerror',e=>issues.push('JS '+e.message.slice(0,200)));
 page.on('requestfailed',r=>{if(/mis\.twse|cors\.dev|allorigins|intraday\/latest/.test(r.url()))network.push({channel:r.url().includes('allorigins')?'secondary':r.url().includes('cors.dev')?'primary':'backup',error:r.failure()?.errorText||''})});
 page.on('response',r=>{if(/mis\.twse|cors\.dev|allorigins|intraday\/latest/.test(r.url()))network.push({channel:r.url().includes('allorigins')?'secondary':r.url().includes('cors.dev')?'primary':'backup',status:r.status()})});
 await page.goto('https://under855.github.io/twstock-ai-monitor/?healthprobe='+Date.now(),{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(19000);
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
}catch(e){console.error('BROWSER_PROBE_ERROR',String(e.stack||e));process.exitCode=1}
finally{await b.close()}
