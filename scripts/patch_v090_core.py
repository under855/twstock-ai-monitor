from pathlib import Path
import re

p=Path('index.html')
s=p.read_text(encoding='utf-8')

repls={
    '<title>台股 AI 監控台 v0.8.2 Web</title>':'<title>台股 AI 監控台 v0.9.0 Web</title>',
    "const APP_VERSION='0.8.2';":"const APP_VERSION='0.9.0';",
    'v0.8.2｜手機優先｜盤中即時行情與即時線圖、評分、新聞、近月除權息':'v0.9.0｜盤中即時行情・即時線圖｜15 秒更新',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">':'<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    '<div class="card"><h3>近 3 個月走勢</h3><canvas id="bigChart"':'<div class="card"><h3>今日盤中即時走勢</h3><canvas id="bigChart"',
}
for a,b in repls.items():
    if a not in s:
        raise SystemExit(f'missing target: {a[:100]}')
    s=s.replace(a,b,1)

# During the trading window, the core must never use a daily snapshot as a quote placeholder.
needle="async function quote(code,allowNetwork=true){if(!allowNetwork){return universeQuote(code)||snapshotQuote(code)||{price:null,change:null,prev:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'}}"
replacement="""function marketWindowTaipeiNow(){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
 const g=t=>p.find(x=>x.type===t)?.value||'',wd=g('weekday'),mins=Number(g('hour'))*60+Number(g('minute'));
 return !['Sat','Sun'].includes(wd)&&mins>=8*60+55&&mins<=13*60+35;
}
function liveLoadingQuote(code){return{code:String(code),price:'',change:'',prev:'',open:'',high:'',low:'',volume:'',time:new Date(),source:'盤中即時資料載入中'}}
async function quote(code,allowNetwork=true){if(!allowNetwork){if(marketWindowTaipeiNow())return quoteCache[code]||liveLoadingQuote(code);return universeQuote(code)||snapshotQuote(code)||{price:null,change:null,prev:null,high:null,low:null,volume:null,time:null,source:'等待行情更新'}}"""
if needle not in s:
    raise SystemExit('missing core quote target')
s=s.replace(needle,replacement,1)

# Do not paint yesterday's TAIEX while the live controller is loading during market hours.
pat=r"function showSnapshotMarket\(\)\{.*?\}\nasync function refreshRemote"
m=re.search(pat,s,re.S)
if not m:
    raise SystemExit('missing showSnapshotMarket block')
new_market="""function showSnapshotMarket(){
 if(marketWindowTaipeiNow()){$('taiex').textContent='—';$('taiexChg').textContent='盤中即時指數載入中';$('taiexChg').className='s muted';$('liveBadge').textContent='盤中資料初始化';$('liveBadge').className='liveBadge warn';$('marketStatus').textContent='盤中載入中';$('marketTime').textContent='15 秒即時更新';return}
 const ch=TAIEX_SNAPSHOT.change;$('taiex').textContent=F(TAIEX_SNAPSHOT.price,2);$('taiexChg').textContent=`${ch>0?'+':''}${F(ch,2)}｜最近交易日 ${TAIEX_SNAPSHOT.date}`;$('taiexChg').className='s '+cls(ch);$('liveBadge').textContent=`休市／最近交易日 ${SNAPSHOT_DATE}`;$('liveBadge').className='liveBadge ok';$('marketStatus').textContent='休市';$('marketTime').textContent=`最近交易日 ${SNAPSHOT_DATE}`}
async function refreshRemote"""
s=s[:m.start()]+new_market+s[m.end():]

# Remove legacy market writers. Only dividends, non-market extras, and one live controller remain.
old_scripts='''<script src="./fix.js?v=067"></script>\n<script src="./dividend-enhance.js?v=070"></script>\n<script src="./hotfix-v065.js?v=067"></script>\n<script src="./hotfix-v066.js?v=067"></script>\n<script src="./hotfix-v067.js?v=067"></script>\n<script src="./hotfix-v069.js?v=074"></script>\n<script src="./live-v081.js?v=082"></script>'''
new_scripts='''<script src="./dividend-enhance.js?v=090"></script>\n<script src="./extras-v090.js?v=090"></script>\n<script src="./live-v090.js?v=090"></script>'''
if old_scripts not in s:
    raise SystemExit('missing legacy script block')
s=s.replace(old_scripts,new_scripts,1)

# Replace foldable/iOS standalone height hacks with stable viewport sizing.
standalone_pat=r"@media \(display-mode: standalone\)\{[\s\S]*?\n\}\n\n</style>"
mobile_css="""
html{min-height:100%;background:radial-gradient(circle at 50% -10%,#13325a 0,#07111f 35%,#050b13 72%);overflow-x:hidden}
body{min-height:100vh;min-height:100svh;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.app{min-height:100vh;min-height:100svh;padding-bottom:calc(120px + env(safe-area-inset-bottom))}
@media (display-mode: standalone){
  html,body{width:100%;min-height:100%;height:auto;overflow-x:hidden;overflow-y:auto}
  body{min-height:100vh;min-height:100svh}
  .app{width:100%;height:auto;min-height:100vh;min-height:100svh}
  .sheet{inset:0;height:auto;min-height:0}
  .panel{max-height:94vh;max-height:calc(100svh - env(safe-area-inset-top));padding-bottom:calc(42px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
}
</style>"""
s2,n=re.subn(standalone_pat,mobile_css,s,count=1)
if n!=1:
    raise SystemExit(f'standalone css replacement count={n}')
s=s2

p.write_text(s,encoding='utf-8')

sw=Path('sw.js')
w=sw.read_text(encoding='utf-8')
w=re.sub(r"const CACHE='tw-ai-monitor-v\d+';","const CACHE='tw-ai-monitor-v090';",w,count=1)
w=re.sub(r"const CORE=\[[^\n]+\];","const CORE=['./','./index.html','./manifest.webmanifest','./icon.svg','./dividend-enhance.js','./extras-v090.js','./live-v090.js'];",w,count=1)
sw.write_text(w,encoding='utf-8')

print('PATCH_V090_OK')
