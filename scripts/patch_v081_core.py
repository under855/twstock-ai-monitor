from pathlib import Path
# v0.8.1 core promotion trigger
p=Path('index.html')
s=p.read_text(encoding='utf-8')
repls={
'<title>台股 AI 監控台 v0.7.0 Web</title>':'<title>台股 AI 監控台 v0.8.1 Web</title>',
"const APP_VERSION='0.7.0';":"const APP_VERSION='0.8.1';",
'<small>手機優先｜完整台股搜尋、行情、評分、新聞、近月除權息</small>':'<small>v0.8.1｜手機優先｜完整台股搜尋、盤中即時行情、評分、新聞、近月除權息</small>',
"}else if(liveParams.get('qa')!=='1'){setTimeout(()=>Promise.resolve(render(true)).catch(()=>{}),1500);setInterval(()=>Promise.resolve(render(true)).catch(()=>{}),15000);}":"}else if(liveParams.get('qa')!=='1'){setTimeout(()=>Promise.resolve(render(false)).catch(()=>{}),1500);}",
'<script src="./hotfix-v069.js?v=069"></script>\n</body>':'<script src="./hotfix-v069.js?v=074"></script>\n<script src="./live-v081.js?v=081"></script>\n</body>'
}
for a,b in repls.items():
    if a not in s:
        raise SystemExit(f'missing patch target: {a[:80]}')
    s=s.replace(a,b,1)
css='''\n@media (display-mode: standalone){\n  html,body{height:auto!important;min-height:100%!important;overflow-y:auto!important}\n  body{-webkit-overflow-scrolling:touch;min-height:-webkit-fill-available!important}\n  .app{height:auto!important;min-height:0!important;padding-bottom:calc(120px + env(safe-area-inset-bottom))!important}\n  .sheet{top:0!important;right:0!important;bottom:0!important;left:0!important;height:auto!important;min-height:0!important}\n  .panel{max-height:calc(100% - env(safe-area-inset-top))!important;padding-bottom:calc(42px + env(safe-area-inset-bottom))!important;-webkit-overflow-scrolling:touch}\n}\n'''
needle='@media(min-width:721px){.sheet{align-items:center;justify-content:center}.panel{max-width:960px;border-radius:20px;max-height:92vh;padding:14px}}\n</style>'
if needle not in s: raise SystemExit('missing css insertion target')
s=s.replace(needle,needle.replace('\n</style>',css+'\n</style>'),1)
p.write_text(s,encoding='utf-8')
print('PATCH_V081_OK')
