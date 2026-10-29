from pathlib import Path

# Bump visible/runtime version.
p=Path('index.html')
s=p.read_text(encoding='utf-8')
repls={
    '<title>台股 AI 監控台 v0.9.1 Web</title>':'<title>台股 AI 監控台 v0.9.2 Web</title>',
    "const APP_VERSION='0.9.1';":"const APP_VERSION='0.9.2';",
    'v0.9.1｜盤中即時行情・即時線圖｜15 秒更新':'v0.9.2｜盤中即時行情・即時線圖｜15 秒更新',
    '<script src="./live-v091.js?v=091"></script>':'<script src="./live-v091.js?v=092"></script>',
}
for old,new in repls.items():
    if old in s:s=s.replace(old,new,1)
    elif new not in s:raise SystemExit(f'missing target {old[:100]}')
p.write_text(s,encoding='utf-8')

live=Path('live-v091.js')
l=live.read_text(encoding='utf-8')
if "const VERSION='0.9.1';" in l:l=l.replace("const VERSION='0.9.1';","const VERSION='0.9.2';",1)
elif "const VERSION='0.9.2';" not in l:raise SystemExit('live version target missing')
live.write_text(l,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
if "const CACHE='tw-ai-monitor-v091';" in w:w=w.replace("const CACHE='tw-ai-monitor-v091';","const CACHE='tw-ai-monitor-v092';",1)
elif "const CACHE='tw-ai-monitor-v092';" not in w:raise SystemExit('sw cache target missing')

old_activate="""self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(clients.map(c=>{
    try{const u=new URL(c.url);if(u.origin===self.location.origin)return c.navigate(c.url)}catch{}
    return Promise.resolve();
  }));
})()));"""
new_activate="""self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));"""
if old_activate in w:w=w.replace(old_activate,new_activate,1)
elif new_activate not in w:raise SystemExit('sw activate block target missing')
sw.write_text(w,encoding='utf-8')
print('PATCH_V092_PWA_OK')
