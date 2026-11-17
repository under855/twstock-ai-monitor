import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
const ctx=await b.newContext({timezoneId:'Asia/Taipei',locale:'zh-TW',serviceWorkers:'block',viewport:{width:390,height:844}});
const errors=[];let failGateways=true;
const fixture={generatedAt:'2026-11-16T15:10:00Z',tradeDate:'2026-11-16',
  taiex:{date:'2026-11-16',close:41040.08,change:-2635.04,source:'TWSE FMTQIK'},
  symbols:{
    '0050':{symbol:'0050',close:96.45,tradeDate:'2026-11-16',source:'TWSE STOCK_DAY_ALL'},
    '2002':{symbol:'2002',close:18,tradeDate:'2026-11-16',source:'TWSE STOCK_DAY_ALL'},
    '3711':{symbol:'3711',close:550,tradeDate:'2026-11-16',source:'TWSE STOCK_DAY_ALL'},
    '3293':{symbol:'3293',close:775,tradeDate:'2026-11-16',source:'TPEx dailyQuotes'},
    '00878':{symbol:'00878',close:32.43,tradeDate:'2026-11-16',source:'TWSE STOCK_DAY_ALL'},
    '00919':{symbol:'00919',close:30.5,tradeDate:'2026-11-16',source:'TWSE STOCK_DAY_ALL'}
  }};
try{
 const page=await ctx.newPage();
 await page.clock.setFixedTime(new Date('2026-11-17T01:30:00Z'));
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/live-v091.js?*',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync('live-v091.js','utf8')}));
 await page.route('**/data/latest.json?*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}));
 await page.route(/proxy\.cors\.dev|api\.allorigins\.win/,async r=>{
    if(failGateways)return r.abort('failed');
    const msgArray=[{c:'t00',d:'20261117',t:'09:29:45',z:'41075',y:'41040'},{c:'0050',d:'20261117',t:'09:29:48',z:'97.2',y:'96.45'}];
    await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msgArray})});
 });
 await page.goto('https://under855.github.io/twstock-ai-monitor/?fallbackqa='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>document.querySelector('#watch article.row .price')?.textContent==='96.45',{timeout:22000});
 const off=await page.evaluate(()=>({
  index:document.getElementById('taiex')?.textContent,
  indexLabel:document.getElementById('taiexChg')?.textContent,
  rows:[...document.querySelectorAll('#watch article.row')].map(r=>({code:r.querySelector('.sym')?.textContent,price:r.querySelector('.price')?.textContent,meta:r.querySelector('.meta')?.textContent,score:r.querySelector('.scoreNum')?.textContent,state:r.dataset.liveState})),
  version:window.__TW_LIVE_V091__?.version
 }));
 assert.equal(off.index,'41,040.08','NO_PREVIOUS_DAY_OFFICIAL_INDEX');
 assert.match(off.indexLabel,/前一交易日官方收盤 2026\/11\/16/);
 assert.equal(off.rows.length,6,'WATCH_ROWS_MISSING');
 for(const row of off.rows){
   assert.equal(row.price,Number(fixture.symbols[row.code].close).toLocaleString('zh-TW',{maximumFractionDigits:2}),'OFFICIAL_CLOSE_NOT_RENDERED_'+row.code);
   assert.match(row.meta,/官方收盤備援/);
   assert.match(row.meta,/2026\/11\/16/);
   assert.equal(row.score,'—','INVALID_REALTIME_SCORE_'+row.code);
   assert.equal(row.state,'previous-close');
 }
 failGateways=false;
 await page.evaluate(async()=>window.__TW_LIVE_REFRESH__());
 await page.waitForFunction(()=>document.querySelector('#watch article.row .price')?.textContent==='97.2',{timeout:15000});
 const on=await page.evaluate(()=>({
   index:document.getElementById('taiex')?.textContent,
   row:document.querySelector('#watch article.row')?.querySelector('.price')?.textContent,
   meta:document.querySelector('#watch article.row')?.querySelector('.meta')?.textContent,
   state:document.querySelector('#watch article.row')?.dataset.liveState,
 }));
 assert.equal(on.index,'41,075','MIS_INDEX_DID_NOT_RECOVER');
 assert.equal(on.state,'live','MIS_LIVE_NOT_RESTORED');
 assert.match(on.meta,/09:29:48/);
 assert.deepEqual(errors,[],'BROWSER_RUNTIME_ERRORS');
 console.log('OFFICIAL_FALLBACK_BROWSER_PASS',JSON.stringify({offline:off,online:on}));
}catch(e){console.error('OFFICIAL_FALLBACK_BROWSER_FAIL',String(e.stack||e));process.exitCode=1}
finally{await ctx.close();await b.close()}
