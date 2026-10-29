import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-TW',timezoneId:'Asia/Taipei',serviceWorkers:'block'});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('https://under855.github.io/twstock-ai-monitor/?verify='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>window.__TW_LIVE_V091__?.version==='0.9.4',null,{timeout:60000});
await page.waitForFunction(()=>document.querySelectorAll('#watch article.row').length>=6,null,{timeout:60000});
await page.waitForFunction(()=>{
  const x=window.__TW_LIVE_V091__;
  return x?.lastSuccessAt>0 && x?.stocks?.['3711']?.price!=null && x?.stocks?.['3293']?.price!=null;
},null,{timeout:60000});
const results=[];
for(const code of ['3711','3293']){
  const liveBefore=await page.evaluate(c=>window.__TW_LIVE_V091__?.stocks?.[c]?.price??null,code);
  const row=page.locator('#watch article.row').filter({has:page.locator('.sym',{hasText:code})}).first();
  await row.click();
  await page.waitForSelector('#sheet.show',{timeout:15000});
  await page.waitForFunction(c=>document.getElementById('dTitle')?.textContent?.includes(c),code,{timeout:15000});
  await page.waitForFunction(()=>document.getElementById('chartMsg')?.textContent?.includes('分時備援走勢'),null,{timeout:30000});
  await page.waitForFunction(()=>document.querySelectorAll('#news .event').length>=1,null,{timeout:10000});
  await page.waitForTimeout(1000);
  const r=await page.evaluate((args)=>({
    code:args.code,
    title:document.getElementById('dTitle')?.textContent?.trim()||'',
    price:document.getElementById('dPrice')?.textContent?.trim()||'',
    livePrice:window.__TW_LIVE_V091__?.stocks?.[args.code]?.price??null,
    liveBefore:args.liveBefore,
    chartMsg:document.getElementById('chartMsg')?.textContent?.trim()||'',
    newsCount:document.querySelectorAll('#news .event').length,
    news:[...document.querySelectorAll('#news .event')].map(x=>x.textContent.trim()).slice(0,4),
    tabs:[...document.querySelectorAll('#detailChartTabs button')].map(b=>b.textContent.trim())
  }),{code,liveBefore});
  console.log('DETAIL_OK',JSON.stringify(r));
  if(!r.chartMsg.includes('分時備援走勢'))throw Error(code+' chart missing');
  if(r.newsCount<1)throw Error(code+' news missing');
  if(!['今日','5日','20日','60日'].every(x=>r.tabs.includes(x)))throw Error(code+' tabs missing');
  if(Number(String(r.price).replaceAll(',',''))!==Number(r.livePrice))throw Error(code+` detail price ${r.price} != live ${r.livePrice}`);
  results.push(r);
  await page.locator('#closeBtn').click();
  await page.waitForFunction(()=>!document.getElementById('sheet')?.classList.contains('show'),null,{timeout:10000});
}
if(errors.length)throw Error('page errors '+errors.join(' | '));
console.log('PROD_R5_PASS',JSON.stringify(results));
await browser.close();
