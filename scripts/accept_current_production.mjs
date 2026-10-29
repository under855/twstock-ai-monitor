import { chromium } from 'playwright-core';

const SITE='https://under855.github.io/twstock-ai-monitor/';
const codes=['0050','3711','3293','2002','00878','00919'];
const channels=['tse_t00.tw','tse_0050.tw','tse_3711.tw','otc_3293.tw','tse_2002.tw','tse_00878.tw','tse_00919.tw'];
const upstream=`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels.join('|'))}&json=1&delay=0&_=${Date.now()}`;
const expectedJson=await (await fetch('https://proxy.cors.dev/'+upstream,{headers:{'user-agent':'Mozilla/5.0'}})).json();
const expected={};let expectedIndex=null;
for(const m of expectedJson.msgArray||[]){
  if(String(m.c)==='t00'){expectedIndex={date:String(m.d),price:Number(m.z),time:String(m.t)};continue;}
  if(codes.includes(String(m.c))) expected[String(m.c)]={date:String(m.d),price:Number(m.trade?.z??m.z),time:String(m.trade?.t??m.t)};
}
if(!expectedIndex||codes.some(c=>!expected[c])) throw new Error('Expected MIS payload incomplete');
console.log('EXPECTED',expectedIndex,expected);

const browser=await chromium.launch({executablePath:process.env.CHROME,headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,timezoneId:'Asia/Taipei',locale:'zh-TW',serviceWorkers:'allow'});
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(SITE+'?prodaccept='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(20000);
const state=await page.evaluate(()=>{
  const dbg=window.__TW_LIVE_V091__||{};
  const rows={};
  for(const r of document.querySelectorAll('#watch article.row')){
    const code=r.querySelector('.sym')?.textContent?.trim();if(!code)continue;
    const c=r.querySelector('canvas.spark');let ink=0;
    if(c){try{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>0)ink++}catch{}}
    rows[code]={price:r.querySelector('.price')?.textContent||'',day:r.querySelector('.dayline')?.textContent||'',meta:r.querySelector('.meta')?.textContent||'',state:r.dataset.liveState||'',date:r.dataset.liveDate||'',domPrice:Number(r.dataset.livePrice||NaN),ink,canvas:!!c};
  }
  return {dbg,taiex:document.getElementById('taiex')?.textContent||'',taiexChg:document.getElementById('taiexChg')?.textContent||'',status:document.getElementById('marketStatus')?.textContent||'',pill:document.getElementById('refreshPill')?.textContent||'',rows};
});
console.log('STATE',JSON.stringify(state,null,2),'ERRORS',errors);
if(errors.length)throw new Error('Production page errors: '+errors.join(' | '));
if(state.dbg?.taiex?.date!==expectedIndex.date||Math.abs(Number(state.dbg?.taiex?.price)-expectedIndex.price)>.001)throw new Error('TAIEX does not match MIS');
if(!state.status.includes('今日收盤')||!state.pill.includes('今日收盤'))throw new Error('Post-close status not current');
for(const code of codes){
  const d=state.dbg?.stocks?.[code],r=state.rows[code],e=expected[code];
  if(!d||d.date!==e.date||Math.abs(Number(d.price)-e.price)>.001)throw new Error(`${code} debug quote stale`);
  if(!r||r.date!==e.date||Math.abs(Number(r.domPrice)-e.price)>.001)throw new Error(`${code} DOM quote stale`);
  if(!r.day.includes(e.time)||!r.meta.includes('TWSE MIS'))throw new Error(`${code} row fields not from current MIS`);
  if(!r.canvas||r.ink<=0)throw new Error(`${code} line chart missing`);
}
await page.locator('#watch article.row').filter({hasText:'0050'}).first().click();
await page.waitForTimeout(800);
const detail=await page.evaluate(()=>({price:document.getElementById('dPrice')?.textContent||'',time:document.getElementById('dTime')?.textContent||'',range:document.getElementById('dRange')?.textContent||'',volume:document.getElementById('dVolume')?.textContent||''}));
console.log('DETAIL',detail);
if(!detail.time.includes('TWSE MIS')||detail.price==='—'||detail.range.includes('—')||detail.volume==='—')throw new Error('Current detail fields missing');
await browser.close();
