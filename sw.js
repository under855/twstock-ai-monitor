const CACHE='tw-ai-monitor-v091';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./dividend-enhance.js','./extras-v090.js','./live-v091.js'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(clients.map(c=>{
    try{const u=new URL(c.url);if(u.origin===self.location.origin)return c.navigate(c.url)}catch{}
    return Promise.resolve();
  }));
})()));

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin)return;
  const isPage=e.request.mode==='navigate'||u.pathname.endsWith('/index.html')||u.pathname.endsWith('/twstock-ai-monitor/');
  if(isPage){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error('HTTP '+r.status);
      const out=new Response(await r.text(),{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      caches.open(CACHE).then(c=>c.put('./index.html',out.clone())).catch(()=>{});
      return out;
    }).catch(()=>caches.match('./index.html').then(r=>r||new Response('離線且無快取頁面',{status:503}))));
    return;
  }
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}
    return r;
  }).catch(()=>caches.match(e.request)));
});
