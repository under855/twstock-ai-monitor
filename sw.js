const CACHE='tw-ai-monitor-v066';
const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./fix.js','./dividend-enhance.js','./hotfix-v065.js','./hotfix-v066.js'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(clients.map(c=>{
    try{
      const u=new URL(c.url);
      if(u.origin===self.location.origin) return c.navigate(c.url);
    }catch{}
    return Promise.resolve();
  }));
})()));

function injectScripts(html){
  let out=html;
  if(!out.includes('fix.js?v=066')) out=out.replace('</body>','<script src="./fix.js?v=066"></script></body>');
  if(!out.includes('dividend-enhance.js?v=066')) out=out.replace('</body>','<script src="./dividend-enhance.js?v=066"></script></body>');
  if(!out.includes('hotfix-v065.js?v=066')) out=out.replace('</body>','<script src="./hotfix-v065.js?v=066"></script></body>');
  if(!out.includes('hotfix-v066.js?v=066')) out=out.replace('</body>','<script src="./hotfix-v066.js?v=066"></script></body>');
  return out;
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin) return;

  const isPage=e.request.mode==='navigate' || u.pathname.endsWith('/index.html') || u.pathname.endsWith('/twstock-ai-monitor/');
  if(isPage){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(async r=>{
          if(!r.ok) throw new Error('HTTP '+r.status);
          const html=injectScripts(await r.text());
          const out=new Response(html,{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
          caches.open(CACHE).then(c=>c.put('./index.html',out.clone())).catch(()=>{});
          return out;
        })
        .catch(()=>caches.match('./index.html').then(async r=>{
          if(!r) return new Response('離線且無快取頁面',{status:503});
          const html=injectScripts(await r.text());
          return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
        }))
    );
    return;
  }

  e.respondWith(
    fetch(e.request,{cache:'no-store'}).then(r=>{
      if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
