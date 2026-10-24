const CACHE='tw-ai-monitor-v050';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  // Never intercept/cache cross-origin market/news/API requests.
  if(u.origin!==self.location.origin) return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});} return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
