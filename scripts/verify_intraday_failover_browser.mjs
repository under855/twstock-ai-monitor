import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({timezoneId:'Asia/Taipei',locale:'zh-TW'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const epoch=Date.parse('2026-11-16T02:15:00Z');
  let mode='primary-offline',stockRequests=0;
  const point=(price,age=20000)=>({stamp:epoch-age,close:price,time:'10:14:40',source:'TWSE MIS'});
  const snapshot={date:'2026-11-16',generatedAt:'2026-11-16T10:15:00+08:00',source:'TWSE MIS official snapshots',stocks:{'0050':[point(100)]},taiex:[point(42000)]};
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/market-data/data/intraday/latest.json')){
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot),headers:{'access-control-allow-origin':'*'}});
    }else if(url.includes('proxy.cors.dev')||url.includes('api.allorigins.win')){
      stockRequests++;
      if(mode==='primary-online'||(mode==='secondary-only'&&url.includes('api.allorigins.win'))){
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({msgArray:[
          {c:'t00',d:'20261116',t:mode==='secondary-only'?'10:14:54':'10:14:55',z:'42050',y:'41900'},
          {c:'0050',d:'20261116',t:mode==='secondary-only'?'10:14:54':'10:14:55',z:mode==='secondary-only'?'102':'101',y:'99'}
        ]}),headers:{'access-control-allow-origin':'*'}});
      }else await route.fulfill({status:503,body:'simulated primary outage',headers:{'access-control-allow-origin':'*'}});
    }else await route.abort();
  });
  await page.clock.install({time:new Date(epoch)});
  await page.setContent('<div id="liveBadge"></div><div id="marketStatus"></div><div id="marketTime"></div><div id="refreshPill"></div><div id="qualityState"></div><div id="qualityDetails"></div><div id="taiex">—</div><div id="taiexChg"></div><div id="watch"><article class="row"><span class="sym">0050</span><span class="price">—</span><span class="chg">—</span><span class="dayline"></span><span class="meta"></span><span class="scoreNum"></span><span class="scoreLabel"></span></article></div>');
  await page.evaluate(()=>{
    window.watchlist=()=>['0050'];
    window.universeMap=new Map([['0050',{market:'TWSE'}]]);
    window.active=null;
    window.universeQuote=()=>null;window.snapshotQuote=()=>null;
    window.__TW_LATEST_JSON__=async()=>({});
  });
  await page.addScriptTag({path:'live-v091.js'});
  const price=()=>page.locator('.price').textContent();
  await page.waitForFunction(()=>document.querySelector('.price')?.textContent==='100',{timeout:12000});
  assert.equal((await price())?.trim(),'100','BACKUP_DID_NOT_RENDER');
  assert.match(await page.locator('.meta').textContent(),/GitHub 官方盤中快照/,'BACKUP_NOT_LABELED');
  assert.equal((await page.locator('.scoreNum').textContent())?.trim(),'—','BACKUP_SCORE_FABRICATED');
  assert.match(await page.locator('#marketStatus').textContent(),/備援行情有效/,'BACKUP_STATUS_MISSING');
  mode='secondary-only';
  await page.evaluate(()=>window.__TW_SECONDARY_REFRESH__());
  await page.waitForFunction(()=>document.querySelector('.price')?.textContent==='102',{timeout:12000});
  assert.match(await page.locator('.meta').textContent(),/TWSE MIS 盤中最新成交/,'SECONDARY_DID_NOT_RENDER');
  mode='primary-online';
  await page.evaluate(()=>window.__TW_LIVE_REFRESH__());
  await page.waitForFunction(()=>document.querySelector('.price')?.textContent==='101',{timeout:12000});
  assert.match(await page.locator('.meta').textContent(),/TWSE MIS 盤中最新成交/,'PRIMARY_DID_NOT_RECOVER');
  mode='primary-offline';
  await page.clock.setFixedTime(new Date(epoch+140000));
  await page.evaluate(()=>window.__TW_LIVE_REFRESH__());
  await page.waitForFunction(()=>document.querySelector('.price')?.textContent==='—',{timeout:12000});
  assert.match(await page.locator('.meta').textContent(),/超過90秒/,'EXPIRED_QUOTE_NOT_MASKED');
  const schedule=await page.evaluate(()=>window.__TW_SCHEDULER_STATE__());
  assert.equal(schedule.primaryInterval,6000);
  assert.equal(schedule.secondaryInterval,10000);
  assert.equal(schedule.secondaryOffset,3000);
  await page.clock.setFixedTime(new Date('2026-12-25T02:15:00Z'));
  const priorRequests=stockRequests;
  await page.evaluate(()=>{window.__TW_LIVE_REFRESH__();window.__TW_SECONDARY_REFRESH__();});
  await page.waitForTimeout(300);
  assert.equal(stockRequests,priorRequests,'HOLIDAY_CREATED_MIS_REQUESTS');
  assert.deepEqual(errors,[],'BROWSER_SCRIPT_ERRORS');
  console.log('DUAL_SOURCE_BROWSER_PASS: GitHub backup, independent 10-second gateway, primary 6-second recovery, stale masking, holiday suspension, no runtime error');
  await context.close();
}finally{await browser.close()}
