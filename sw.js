const CACHE='tw-ai-monitor-v051';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./fix.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin) return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>{
    if(!r.ok) return r;
    const type=r.headers.get('content-type')||'';
    if(type.includes('text/html')){
      let text=await r.text();
      if(!text.includes('fix.js')) text=text.replace('</body>','<script src="./fix.js?v=051"></script></body>');
      const patched=new Response(text,{status:r.status,statusText:r.statusText,headers:r.headers});
      const copy=patched.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return patched;
    }
    const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
