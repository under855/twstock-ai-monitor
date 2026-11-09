import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const files=['index.html','extras-v090.js','live-v091.js','foreign-live-test.js','split-layout-v095.js','paper-trading-v100.js','paper-trading-reset-v101.js','pilot-chart-00878-v1.js','dividend-enhance.js','sw.js'];
for(const file of files)assert(fs.existsSync(file),'MISSING_FILE '+file);
const html=fs.readFileSync('index.html','utf8');
for(const m of html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)){
  const f=m[1].split('?')[0].replace(/^\.\//,'');
  assert(fs.existsSync(f),'BROKEN_SCRIPT_REF '+f);
}
const latest=JSON.parse(fs.readFileSync('data/latest.json','utf8'));
assert(Object.keys(latest.symbols||{}).length>=1500,'STOCK_UNIVERSE_TOO_SMALL');
assert(Number.isFinite(Date.parse(latest.generatedAt)),'INVALID_BUILD_TIMESTAMP');
const day=String(latest.tradeDate||'');
assert(/^\d{4}-\d{2}-\d{2}$/.test(day),'INVALID_TRADE_DATE');
assert(Date.parse(day+'T00:00:00+08:00')<=Date.now(),'FUTURE_STOCK_DATE');
assert(Date.parse(latest.generatedAt)<=Date.now()+60000,'FUTURE_BUILD_TIMESTAMP');
assert(latest.taiex?.date<=day,'INDEX_DATE_AFTER_STOCK_DATE');
assert(latest.taiex?.close>5000,'INVALID_INDEX');
for(const code of ['0050','00878','00919','2330','3711','3293','2002']){
  const v=latest.symbols[code];assert(v,'MISSING_STOCK '+code);
  assert(Number.isFinite(v.close)&&v.close>0,'BAD_CLOSE '+code);
  assert(v.tradeDate<=day,'FUTURE_STOCK_QUOTE '+code);
  assert(v.tradeDate>=new Date(Date.parse(day+'T00:00:00+08:00')-10*86400000).toISOString().slice(0,10),'STALE_STOCK '+code);
  if(Number.isFinite(v.high)&&Number.isFinite(v.low)){
    assert(v.high>=v.low,'BAD_HIGH_LOW '+code);
    assert(v.close>=v.low-.0001&&v.close<=v.high+.0001,'BAD_CLOSE_RANGE '+code);
  }
}
console.log('STATIC_DATA_PASS',day,latest.taiex.close,Object.keys(latest.symbols).length);
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
const errors=[];
for(const opt of [{name:'mobile',width:390,height:844},{name:'desktop',width:1366,height:900}]){
  const ctx=await browser.newContext({viewport:{width:opt.width,height:opt.height},timezoneId:'Asia/Taipei',locale:'zh-TW',serviceWorkers:'allow'});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(opt.name+':'+e.message));
  await page.goto('https://under855.github.io/twstock-ai-monitor/?systemqa='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(16000);
  const d=await page.evaluate(()=>{
    const text=id=>document.getElementById(id)?.textContent?.trim()||'';
    return {
      index:text('taiex'),indexLabel:text('taiexChg'),
      rows:[...document.querySelectorAll('#watch article.row')].map(r=>({code:r.querySelector('.sym')?.textContent?.trim(),price:r.querySelector('.price')?.textContent?.trim(),meta:r.querySelector('.meta')?.textContent?.trim()})),
      fx:window.__TW_BANK_FX_STATUS__?.(),fxRows:document.querySelectorAll('#botCashFxV096 .botCashFxCode').length,
      oldFX:[...document.scripts].some(s=>s.textContent?.includes('open.er-api.com')),
      paper:!!document.getElementById('paperTradeBtn'),
      paperScript:[...document.scripts].some(s=>s.src.includes('paper-trading-v100.js'))
    };
  });
  console.log('RUNTIME_'+opt.name.toUpperCase(),JSON.stringify(d));
  assert(d.rows.length>0,'NO_STOCK_ROWS '+opt.name);
  assert(d.paper&&d.paperScript,'PAPER_TRADING_MISSING '+opt.name);
  assert(!d.oldFX,'OLD_FX_SOURCE '+opt.name);
  assert(['verified','unverified'].includes(d.fx?.state),'BANK_TIME_UNVERIFIED '+opt.name);
  if(d.fx.state==='unverified')assert(d.fxRows===0,'STALE_BANK_RATES_VISIBLE '+opt.name);
  if(d.fx.state==='verified')assert(d.fxRows>=7,'BANK_RATES_INCOMPLETE '+opt.name);
  await ctx.close();
}
await browser.close();
assert.equal(errors.length,0,'JS_ERRORS '+errors.join(' | '));
console.log('WHOLE_SYSTEM_AUDIT_PASS');
