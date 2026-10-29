from pathlib import Path

p=Path('index.html')
s=p.read_text(encoding='utf-8')
repls={
    '<title>台股 AI 監控台 v0.9.0 Web</title>':'<title>台股 AI 監控台 v0.9.1 Web</title>',
    "const APP_VERSION='0.9.0';":"const APP_VERSION='0.9.1';",
    'v0.9.0｜盤中即時行情・即時線圖｜15 秒更新':'v0.9.1｜盤中即時行情・即時線圖｜15 秒更新',
    '<script src="./live-v090.js?v=090"></script>':'<script src="./live-v091.js?v=091"></script>',
}
for a,b in repls.items():
    if a not in s: raise SystemExit(f'missing target {a[:100]}')
    s=s.replace(a,b,1)
p.write_text(s,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
w=w.replace("const CACHE='tw-ai-monitor-v090';","const CACHE='tw-ai-monitor-v091';",1)
w=w.replace("'./live-v090.js'","'./live-v091.js'",1)
sw.write_text(w,encoding='utf-8')
print('PATCH_V091_CORE_OK')
