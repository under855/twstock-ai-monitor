from pathlib import Path

live=Path('live-v091.js')
s=live.read_text(encoding='utf-8')
repls={
    "const VERSION='0.9.2';":"const VERSION='0.9.3';",
    "const QKEY='tw_live091_quotes_';\n  const SKEY='tw_live091_series_';":"const QKEY='tw_live091_quotes_';\n  const SKEY='tw_live091_series_';\n  const IKEY='tw_live091_index_';",
    "function loadToday(){\n    const d=today();":"function loadToday(){\n    const d=today();\n    try{const x=JSON.parse(localStorage.getItem(IKEY+d)||'null');if(x?.date===d&&sameDay(Number(x.stamp))&&num(x.price)!=null)taiex={...x,source:'本日最後盤中指數（重新連線中）'}}catch{}",
    "try{localStorage.setItem(QKEY+d,JSON.stringify(qo));localStorage.setItem(SKEY+d,JSON.stringify(so))}catch{}":"try{localStorage.setItem(QKEY+d,JSON.stringify(qo));localStorage.setItem(SKEY+d,JSON.stringify(so));if(taiex?.date===d&&sameDay(taiex.stamp))localStorage.setItem(IKEY+d,JSON.stringify(taiex))}catch{}",
}
for a,b in repls.items():
    if a not in s: raise SystemExit('missing live target: '+a[:100])
    s=s.replace(a,b,1)
live.write_text(s,encoding='utf-8')

p=Path('index.html')
h=p.read_text(encoding='utf-8')
repls2={
    '<title>台股 AI 監控台 v0.9.2 Web</title>':'<title>台股 AI 監控台 v0.9.3 Web</title>',
    "const APP_VERSION='0.9.2';":"const APP_VERSION='0.9.3';",
    'v0.9.2｜盤中即時行情・即時線圖｜15 秒更新':'v0.9.3｜盤中即時行情・即時線圖｜15 秒更新',
    '<script src="./live-v091.js?v=092"></script>':'<script src="./live-v091.js?v=093"></script>',
}
for a,b in repls2.items():
    if a not in h: raise SystemExit('missing index target: '+a[:100])
    h=h.replace(a,b,1)
p.write_text(h,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
if "const CACHE='tw-ai-monitor-v092';" not in w: raise SystemExit('missing sw v092 marker')
w=w.replace("const CACHE='tw-ai-monitor-v092';","const CACHE='tw-ai-monitor-v093';",1)
sw.write_text(w,encoding='utf-8')
print('PATCH_V093_INDEX_PERSIST_OK')
