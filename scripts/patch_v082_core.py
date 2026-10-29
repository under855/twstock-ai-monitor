from pathlib import Path
p=Path('index.html')
s=p.read_text(encoding='utf-8')
repls={
'<title>台股 AI 監控台 v0.8.1 Web</title>':'<title>台股 AI 監控台 v0.8.2 Web</title>',
"const APP_VERSION='0.8.1';":"const APP_VERSION='0.8.2';",
'v0.8.1｜手機優先｜完整台股搜尋、盤中即時行情、評分、新聞、近月除權息':'v0.8.2｜手機優先｜盤中即時行情與即時線圖、評分、新聞、近月除權息',
'<script src="./live-v081.js?v=081"></script>':'<script src="./live-v081.js?v=082"></script>'
}
for a,b in repls.items():
    if a not in s: raise SystemExit('missing target '+a[:80])
    s=s.replace(a,b,1)
p.write_text(s,encoding='utf-8')
print('PATCH_V082_OK')
