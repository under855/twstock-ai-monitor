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
assert(latest.taiex?.date<=day||(
  latest.taiex?.source==='TWSE MIS live'&&
  latest.taiex?.date===new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})
),'INVALID_INDEX_TRADE_DATE');
if(latest.taiex?.source==='TWSE MIS live'){
  assert(/^\d{2}:\d{2}:\d{2}$/.test(String(latest.taiex.time||'')),'INVALID_MIS_INDEX_TIME');
  console.log('NOTE: intraday MIS index date may be newer than finalized stock rows; freshness is verified in UI, not inferred from cache generation time');
}
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
const news=JSON.parse(fs.readFileSync('data/news.json','utf8'));
const dividends=JSON.parse(fs.readFileSync('data/dividends.json','utf8'));
assert(news&&typeof news==='object','NEWS_JSON_INVALID');
assert(dividends&&typeof dividends==='object','DIVIDEND_JSON_INVALID');
assert(fs.statSync('data/dividends.json').size>1000,'DIVIDEND_DATA_EMPTY');
assert(fs.statSync('data/news.json').size>500,'NEWS_DATA_EMPTY');
const flow=JSON.parse(fs.readFileSync('data/foreign-flow.json','utf8'));
assert(flow.source==='TWSE BFI82U'&&flow.market==='TWSE','FOREIGN_FLOW_WRONG_SOURCE');
assert(/^\d{4}-\d{2}-\d{2}$/.test(flow.date),'FOREIGN_FLOW_INVALID_DATE');
assert(flow.date<=day,'FOREIGN_FLOW_FUTURE_DATE');
assert([flow.buyTWD,flow.sellTWD,flow.netTWD].every(Number.isSafeInteger),'FOREIGN_FLOW_NON_INTEGER');
assert(flow.buyTWD>=0&&flow.sellTWD>=0&&flow.netTWD===flow.buyTWD-flow.sellTWD,'FOREIGN_FLOW_NET_INCONSISTENT');
console.log('FOREIGN_FLOW_OFFICIAL_PASS',flow.date,flow.netTWD);
console.log('SECONDARY_DATA_JSON_PASS',Object.keys(news),Object.keys(dividends).slice(0,12));
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
      foreignFlow:{net:text('foreignNet'),buy:text('foreignBuy'),sell:text('foreignSell'),date:text('foreignFlowDate')},
      layout:{breadthGone:!document.getElementById('breadthUp')&&!document.querySelector('.watchBreadthCard'),indexFontPx:parseFloat(getComputedStyle(document.getElementById('taiex')).fontSize),indexCardWidth:document.querySelector('.taiexCard')?.getBoundingClientRect().width||0,foreignWidth:document.querySelector('.foreignFlowCard')?.getBoundingClientRect().width||0,visibleCards:[...document.querySelectorAll('.market>.marketCard')].filter(x=>getComputedStyle(x).display!=='none').length},
      live:window.__TW_LIVE_V091__?{version:window.__TW_LIVE_V091__.version,intervalMs:window.__TW_LIVE_V091__.intervalMs,marketWindow:window.__TW_LIVE_V091__.marketWindow,receivedAt:window.__TW_LIVE_V091__.lastMisReceivedAt,stocks:window.__TW_LIVE_V091__.stocks,indexFreshness:window.__TW_LIVE_V091__.indexFreshness,indexAgeSeconds:window.__TW_LIVE_V091__.indexAgeSeconds,indexPrice:window.__TW_LIVE_V091__.taiex?.price||null,errors:window.__TW_LIVE_V091__.lastError||''}:null,
      rows:[...document.querySelectorAll('#watch article.row')].map(r=>({code:r.querySelector('.sym')?.textContent?.trim(),price:r.querySelector('.price')?.textContent?.trim(),meta:r.querySelector('.meta')?.textContent?.trim()})),
      fx:window.__TW_BANK_FX_STATUS__?.(),fxRows:document.querySelectorAll('#botCashFxV096 .botCashFxCode').length,fxCodes:[...document.querySelectorAll('#botCashFxV096 .botCashFxCode')].map(x=>x.textContent.trim()),
      oldFX:[...document.scripts].some(s=>s.textContent?.includes('open.er-api.com')),
      paper:!!document.getElementById('paperTradeBtn'),
      paperScript:[...document.scripts].some(s=>s.src.includes('paper-trading-v100.js'))
    };
  });
  console.log('RUNTIME_'+opt.name.toUpperCase(),JSON.stringify(d));
  assert(d.rows.length>0,'NO_STOCK_ROWS '+opt.name);
  const expectedFlow=(Math.abs(flow.netTWD)/1e8).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
  // Official flow is retained in data/foreign-flow.json but its display card is currently disabled by design.
  // If a card is later restored, do NOT skip validating its figures, source date or non-live label.
  if(d.layout.foreignWidth>0||d.foreignFlow.net||d.foreignFlow.date){
    assert(d.foreignFlow.net.includes(expectedFlow),'FOREIGN_FLOW_NET_MISMATCH '+opt.name);
    assert(d.foreignFlow.net.startsWith(flow.netTWD<0?'賣超':flow.netTWD>0?'買超':'買賣平衡'),'FOREIGN_FLOW_SIGN_MISMATCH '+opt.name);
    assert(d.foreignFlow.date.includes(flow.date.replaceAll('-','/')),'FOREIGN_FLOW_SOURCE_DATE_MISSING '+opt.name);
    assert(d.foreignFlow.date.includes('非即時'),'FOREIGN_FLOW_NOT_LABELED_AS_POST_CLOSE '+opt.name);
    console.log('FOREIGN_FLOW_DISPLAY_'+opt.name.toUpperCase(),JSON.stringify(d.foreignFlow));
  }else console.log('FOREIGN_FLOW_HIDDEN_BY_DESIGN_'+opt.name.toUpperCase(),flow.date);

  assert(d.layout.breadthGone,'BREADTH_PANEL_STILL_VISIBLE '+opt.name);
  assert(d.layout.indexFontPx>=38,'TAIEX_FONT_TOO_SMALL '+opt.name);
  assert(d.layout.indexCardWidth>0,'INDEX_CARD_MISSING '+opt.name);
  assert.equal(d.layout.visibleCards,2,'UNUSED_TOP_MARKET_SLOT '+opt.name);
  console.log('TOP_MARKET_LAYOUT_'+opt.name.toUpperCase(),JSON.stringify(d.layout));
  assert(d.live?.version==='0.9.8.17'&&d.live?.intervalMs===6000,'OUTDATED_QUOTE_ENGINE '+opt.name);
  // The rendered stock prices and closing index must match the versioned exchange data file.
  for(const row of d.rows){
    const expected=latest.symbols[row.code];
    if(!d.live.marketWindow&&expected&&expected.tradeDate===day){
      const displayed=Number(String(row.price||'').replaceAll(',',''));
      const isFinal=['TWSE MI_INDEX','TPEx dailyQuotes'].includes(expected.source);
      if(isFinal){
        assert(Math.abs(displayed-expected.close)<.001,'OFFICIAL_FINAL_PRICE_MISMATCH '+opt.name+' '+row.code);
        assert(/官方收盤/.test(row.meta),'OFFICIAL_FINAL_SOURCE_UNLABELED '+row.code);
      }else{
        // The daily cache can contain today's *provisional* TPEx MIS quote while the
        // independently polled last-trade snapshot is newer. Never assert equal prices
        // without equal source timestamps; accept only a dated, identified source.
        assert(Number.isFinite(displayed)&&displayed>0,'NO_VERIFIED_DELAYED_CLOSE '+opt.name+' '+row.code);
        assert(/MIS|備援|快照|最近交易日|非正式收盤/.test(row.meta),'PROVISIONAL_SOURCE_UNLABELED '+opt.name+' '+row.code);
      }
    }
  }
  const indexNum=Number(String(d.index).replaceAll(',',''));
  if(d.live.marketWindow){
    if(d.live.indexFreshness==='fresh'){
      assert(Number.isFinite(indexNum)&&Math.abs(indexNum-Number(d.live.indexPrice))<.011,'LIVE_INDEX_MISMATCH '+opt.name);
    }else{
      assert(d.index==='—','STALE_INDEX_MUST_NOT_SHOW_AS_LIVE '+opt.name);
      assert(/行情延遲|無法確認即時|即時行情暫時無法確認/.test(d.indexLabel),'MISSING_INDEX_DELAY_WARNING '+opt.name);
    }
  }else if(latest.taiex.source==='TWSE MI_INDEX'&&latest.taiex.time==='13:30:00'){
    assert(Math.abs(indexNum-latest.taiex.close)<.011,'OFFICIAL_CLOSE_DIFF '+opt.name);
  }
  console.log('INDEX_FRESHNESS_'+opt.name.toUpperCase(),JSON.stringify({freshness:d.live.indexFreshness,ageSeconds:d.live.indexAgeSeconds,display:d.index,indexLabel:d.indexLabel}));
  assert(d.paper&&d.paperScript,'PAPER_TRADING_MISSING '+opt.name);
  assert(!d.oldFX,'OLD_FX_SOURCE '+opt.name);
  assert(['verified','unverified'].includes(d.fx?.state),'BANK_TIME_UNVERIFIED '+opt.name);
  if(d.fx.state==='unverified')assert(d.fxRows===0,'STALE_BANK_RATES_VISIBLE '+opt.name);
  if(d.fx.state==='unverified')assert.equal(d.fxCodes.length,0,'BANK_FX_UNVERIFIED_CODES_VISIBLE '+opt.name);
  if(d.fx.state==='verified'){assert.equal(d.fxRows,6,'BANK_RATES_NOT_SIX '+opt.name);assert.deepEqual(d.fxCodes,['USD 美元','JPY 日圓','EUR 歐元','GBP 英鎊','SGD 新加坡幣','CNY 人民幣'],'BANK_FX_CURRENCIES_MISMATCH '+opt.name);}
  // Detail panel, chart pilot, research and trading controls must load without crashing.
  const detailRow=page.locator('#watch article.row').filter({hasText:'00878'}).first();
  await detailRow.click();await page.waitForTimeout(1400);
  const detail=await page.evaluate(()=>({
    open:document.getElementById('sheet')?.classList.contains('show'),
    title:document.getElementById('dTitle')?.textContent,
    price:document.getElementById('dPrice')?.textContent,
    chart:!!document.getElementById('pilot00878canvas'),
    news:!!document.getElementById('news'),
    dividend:!!document.getElementById('dividendEvents')
  }));
  console.log('DETAIL_'+opt.name.toUpperCase(),JSON.stringify(detail));
  assert(detail.open&&detail.title?.includes('00878'),'DETAIL_NAV_FAIL '+opt.name);
  assert(detail.chart,'PILOT_CHART_MISSING '+opt.name);
  assert(Number(String(detail.price||'').replaceAll(',',''))>0,'DETAIL_PRICE_MISSING '+opt.name);
  await page.locator('#closeBtn').click();
  await page.locator('#paperTradeBtn').click();
  await page.waitForTimeout(250);
  const trade=await page.evaluate(()=>({
    open:document.getElementById('paperTradeModal')?.classList.contains('show'),
    reset:!!document.getElementById('ptReset'),
    cash:document.getElementById('ptSummary')?.textContent||'',
    limit:!!document.getElementById('ptLimit'),
    message:document.querySelector('#paperTradeModal .notice')?.textContent||''
  }));
  console.log('TRADING_'+opt.name.toUpperCase(),JSON.stringify(trade));
  assert(trade.open&&trade.reset&&trade.limit,'PAPER_TRADE_FORM_MISSING '+opt.name);
  assert(trade.cash.includes('1,000,000'),'INITIAL_CASH_NOT_1M '+opt.name);
  await page.locator('#ptClose').click();
  await page.locator('#code').fill('2330');
  await page.locator('#searchBtn').click();
  const match=page.locator('#searchResults .searchHit').filter({hasText:'2330'}).first();
  await match.waitFor({state:'visible',timeout:5000});
  await match.locator('button').click();
  await page.waitForTimeout(350);
  const selected=await page.evaluate(()=>({
    open:document.getElementById('sheet')?.classList.contains('show'),
    title:document.getElementById('dTitle')?.textContent||'',
    score:document.getElementById('scoreParts')?.textContent||'',
    news:!!document.getElementById('news'),
    dividend:!!document.getElementById('dividendEvents')
  }));
  assert(selected.open&&selected.title.includes('2330'),'SEARCH_DETAIL_FAIL '+opt.name);
  assert(selected.news&&selected.dividend,'RESEARCH_AND_DIVIDEND_UI_MISSING '+opt.name);
  console.log('SEARCH_'+opt.name.toUpperCase(),JSON.stringify(selected));
  await ctx.close();
}
await browser.close();
assert.equal(errors.length,0,'JS_ERRORS '+errors.join(' | '));
console.log('WHOLE_SYSTEM_AUDIT_PASS');
