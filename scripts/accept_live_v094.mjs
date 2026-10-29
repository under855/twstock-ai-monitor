import { chromium } from 'playwright-core';

const chrome=process.env.CHROME;
if(!chrome) throw new Error('Chrome not found');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Asia/Taipei',locale:'zh-TW',serviceWorkers:'block'});
const base=Date.parse('2026-10-29T10:00:00+08:00');
await ctx.addInitScript(({base})=>{
  const R=Date,start=R.now();
  class M extends R{
    constructor(...args){super(...(args.length?args:[base+(R.now()-start)]))}
    static now(){return base+(R.now()-start)}
  }
  window.Date=M;
},{base});

let requests=0;
await ctx.route('https://proxy.cors.dev/**',async route=>{
  const url=route.request().url();
  if(!url.includes('mis.twse.com.tw')) return route.continue();
  requests++;
  const sec=(requests-1)*15;
  const mm=String(Math.floor(sec/60)).padStart(2,'0');
  const ss=String(sec%60).padStart(2,'0');
  const t=`10:${mm}:${ss}`;
  const p=107.00+requests*.10, idx=46300+requests*10;
  const mk=(c,z,y,o,h,l,v,ex='tse')=>({c,d:'20261029',t,ex,z:String(z),y:String(y),o:String(o),h:String(h),l:String(l),v:String(v),trade:{t,z:String(z),v:10}});
  const body={msgArray:[
    {c:'t00',ch:'t00.tw',d:'20261029',t,z:String(idx),y:'46290'},
    mk('0050',p,108.65,106.8,p+.2,p-.2,70000),
    mk('3711',683+requests,695,680,690,675,12000),
    mk('3293',808+requests,800,805,815,790,1300,'otc'),
    mk('2002',19.45+requests*.01,19.75,19.5,19.6,19.4,18000),
    mk('00878',35.3+requests*.01,35.65,35.2,35.4,35.1,35000),
    mk('00919',32.87+requests*.01,32.9,32.8,33,32.7,25000)
  ]};
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
});

const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.TEST_URL||'http://127.0.0.1:8000/?liveaccept=1',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(2500);
const first=await page.evaluate(()=>({
  cycle:window.__TW_LIVE_V091__?.cycle||0,
  idx:document.getElementById('taiex')?.textContent||'',
  price:[...document.querySelectorAll('#watch article.row')].find(r=>r.querySelector('.sym')?.textContent.trim()==='0050')?.querySelector('.price')?.textContent||'',
  points:window.__TW_LIVE_V091__?.stocks?.['0050']?.seriesPoints||0
}));
await page.waitForTimeout(32000);
const after=await page.evaluate(()=>{
  const r=[...document.querySelectorAll('#watch article.row')].find(r=>r.querySelector('.sym')?.textContent.trim()==='0050');
  const c=r?.querySelector('canvas.spark');let ink=0;
  if(c){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]>0)ink++}
  return {
    cycle:window.__TW_LIVE_V091__?.cycle||0,
    idx:document.getElementById('taiex')?.textContent||'',
    price:r?.querySelector('.price')?.textContent||'',
    day:r?.querySelector('.dayline')?.textContent||'',
    meta:r?.querySelector('.meta')?.textContent||'',
    points:window.__TW_LIVE_V091__?.stocks?.['0050']?.seriesPoints||0,
    ink
  };
});
console.log('FIRST',first,'AFTER',after,'REQUESTS',requests,'ERRORS',errors);
if(!(after.cycle>=3 && requests>=3 && after.price!==first.price && after.idx!==first.idx && after.points>=3 && after.ink>0 && /開/.test(after.day) && /成交/.test(after.meta) && errors.length===0)){
  throw new Error('15-second live propagation failed');
}

await page.locator('#watch article.row').filter({hasText:'0050'}).first().click();
await page.waitForTimeout(500);
const detail=await page.evaluate(()=>({
  price:document.getElementById('dPrice')?.textContent||'',
  change:document.getElementById('dChange')?.textContent||'',
  range:document.getElementById('dRange')?.textContent||'',
  volume:document.getElementById('dVolume')?.textContent||'',
  time:document.getElementById('dTime')?.textContent||''
}));
console.log('DETAIL',detail);
if(!detail.price||detail.price==='—'||!detail.range||detail.range.includes('—')||!detail.volume||detail.volume==='—'||!detail.time.includes('TWSE MIS')){
  throw new Error('detail live fields failed');
}
await browser.close();
