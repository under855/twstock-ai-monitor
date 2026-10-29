from pathlib import Path

# Always repair the live controller first. This is intentionally idempotent.
live=Path('live-v091.js')
l=live.read_text(encoding='utf-8')
bad="ctx.strokeStyle='rgba(120,173,255,.98)';ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.beginPath();data.forEach((p,i)=>i?ctx.lineTo(X(p),Y(num(p.close))):ctx.moveTo(X(p),Y(num(p.close)));ctx.stroke();"
good="ctx.strokeStyle='rgba(120,173,255,.98)';ctx.lineWidth=Math.max(1.5,1.8*dpr);ctx.beginPath();data.forEach((p,i)=>{if(i)ctx.lineTo(X(p),Y(num(p.close)));else ctx.moveTo(X(p),Y(num(p.close)));});ctx.stroke();"
if bad in l:
    l=l.replace(bad,good,1)
elif good not in l:
    raise SystemExit('live-v091 draw syntax target missing')
live.write_text(l,encoding='utf-8')

p=Path('index.html')
s=p.read_text(encoding='utf-8')
repls={
    '<title>台股 AI 監控台 v0.9.0 Web</title>':'<title>台股 AI 監控台 v0.9.1 Web</title>',
    "const APP_VERSION='0.9.0';":"const APP_VERSION='0.9.1';",
    'v0.9.0｜盤中即時行情・即時線圖｜15 秒更新':'v0.9.1｜盤中即時行情・即時線圖｜15 秒更新',
    '<script src="./live-v090.js?v=090"></script>':'<script src="./live-v091.js?v=091"></script>',
}
for old,new in repls.items():
    if old in s:
        s=s.replace(old,new,1)
    elif new not in s:
        raise SystemExit(f'missing both old/new target: {old[:100]}')
p.write_text(s,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
if "const CACHE='tw-ai-monitor-v090';" in w:
    w=w.replace("const CACHE='tw-ai-monitor-v090';","const CACHE='tw-ai-monitor-v091';",1)
elif "const CACHE='tw-ai-monitor-v091';" not in w:
    raise SystemExit('service worker cache marker missing')
if "'./live-v090.js'" in w:
    w=w.replace("'./live-v090.js'","'./live-v091.js'",1)
elif "'./live-v091.js'" not in w:
    raise SystemExit('service worker live script marker missing')
sw.write_text(w,encoding='utf-8')
print('PATCH_V091_CORE_OK')
