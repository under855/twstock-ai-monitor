const CACHE='tw-ai-monitor-v0982-no-crypto-probe';
const CORE=['./index.html','./manifest.webmanifest','./icon.svg','./refresh-control-v0973.js','./dividend-enhance.js','./extras-v090.js','./live-v091.js','./taiex-sector-ticker.js','./stock-price-visual.js','./split-layout-v095.js','./pilot-chart-00878-v1.js','./dividend-ticker-v0975.js'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  // A single temporarily unavailable optional script must not block SW activation.
  await Promise.allSettled(CORE.map(async path=>{
    const request=new Request(path,{cache:'no-store'});
    const response=await fetch(request);
    if(response.ok)await c.put(request,response);
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('tw-ai-monitor-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  // Recovery document must never replace the cached main application shell.
  if(url.pathname.endsWith('/recovery.html'))return;
  const isMainPage=event.request.mode==='navigate'&&(url.pathname.endsWith('/index.html')||url.pathname.endsWith('/twstock-ai-monitor/'));
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw Error('HTTP '+response.status);
      if(isMainPage){
        const clone=response.clone();
        event.waitUntil(caches.open(CACHE).then(c=>c.put('./index.html',clone)).catch(()=>{}));
      }
      return response;
    }).catch(async()=>{
      if(isMainPage)return await caches.match('./index.html')||new Response('目前離線，請重新連線後開啟。',{status:503});
      return new Response('目前無法載入頁面，請檢查網路連線。',{status:503});
    }));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response.ok){
      const clone=response.clone();
      event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,clone)).catch(()=>{}));
    }
    return response;
  }).catch(async()=>await caches.match(event.request)||new Response('資源暫時無法取得',{status:503})));
});