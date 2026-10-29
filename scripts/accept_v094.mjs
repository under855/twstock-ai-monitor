import { chromium } from 'playwright-core';

const executablePath=process.env.CHROME;
if(!executablePath) throw new Error('Chrome/Chromium not found');
const b=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,timezoneId:'Asia/Taipei',locale:'zh-TW',serviceWorkers:'allow'});
const p=await ctx.newPage();
const pageErrors=[];
p.on('pageerror',e=>pageErrors.push(e.message));
await p.goto('http://127.0.0.1:8000/?qa=1',{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForFunction(()=>document.body.dataset.qa==='PASS',{timeout:30000});
const state=await p.evaluate(async()=>{
  const search=(typeof searchUniverse==='function')?searchUniverse('華航').map(x=>x.code):[];
  const row=rowForCode('2610'),q=universeQuote('2610')||snapshotQuote('2610');
  const s=scoreStock(row,{},[],q);
  const reg=await navigator.serviceWorker.ready.catch(()=>null);
  await showSearchResult('2610');
  const detailOpen=document.getElementById('sheet')?.classList.contains('show')&&document.getElementById('dTitle')?.textContent.includes('2610');
  return {
    title:document.title,
    appVersion:typeof APP_VERSION==='undefined'?null:APP_VERSION,
    qa:document.body.dataset.qa,
    searchHas2610:search.includes('2610'),
    insufficient:s.total===null && (s.coverage??0)<45,
    extras:window.__TW_EXTRAS_V090__?.version||null,
    live:window.__TW_LIVE_V091__?.version||null,
    sw:!!reg,
    detailOpen,
    scripts:[...document.scripts].map(x=>x.src).filter(Boolean)
  };
});
console.log(JSON.stringify({state,pageErrors}));
if(pageErrors.length) throw new Error('page errors: '+pageErrors.join(' | '));
if(state.qa!=='PASS'||state.appVersion!=='0.9.4'||!state.searchHas2610||!state.insufficient||state.extras!=='0.9.4'||state.live!=='0.9.4'||!state.sw||!state.detailOpen){
  throw new Error('acceptance failed '+JSON.stringify(state));
}
await b.close();
