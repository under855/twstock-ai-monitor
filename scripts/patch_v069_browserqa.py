#!/usr/bin/env python3
import pathlib

p=pathlib.Path('dividend-enhance.js')
s=p.read_text(encoding='utf-8')
old="""    if(dated.some(e=>dateMs(e.exDate)<=now)){
      longHistory(code).then(h=>{if(Array.isArray(h)&&h.length)renderRows(h)}).catch(()=>{});
    }"""
new="""    const browserQa=new URLSearchParams(location.search).get('browserqa')==='1';
    if(!browserQa&&dated.some(e=>dateMs(e.exDate)<=now)){
      longHistory(code).then(h=>{if(Array.isArray(h)&&h.length)renderRows(h)}).catch(()=>{});
    }"""
if old in s:s=s.replace(old,new)
elif "const browserQa=new URLSearchParams(location.search).get('browserqa')==='1';" not in s:raise SystemExit('dividend browserqa anchor missing')
p.write_text(s,encoding='utf-8')

p=pathlib.Path('index.html')
s=p.read_text(encoding='utf-8')
old="tick();setInterval(tick,1000);boot().then(runQaIfRequested);const liveParams=new URLSearchParams(location.search);if(liveParams.get('qa')!=='1'&&liveParams.get('browserqa')!=='1'){setTimeout(()=>Promise.resolve(render(true)).catch(()=>{}),1500);setInterval(()=>Promise.resolve(render(true)).catch(()=>{}),15000);}"
new="tick();setInterval(tick,1000);boot().then(runQaIfRequested);const liveParams=new URLSearchParams(location.search);if(liveParams.get('browserqa')==='1'&&liveParams.get('autodetail')){setTimeout(()=>Promise.resolve(show(liveParams.get('autodetail'),{news:false})).catch(()=>{}),1200);}else if(liveParams.get('qa')!=='1'){setTimeout(()=>Promise.resolve(render(true)).catch(()=>{}),1500);setInterval(()=>Promise.resolve(render(true)).catch(()=>{}),15000);}"
if old in s:s=s.replace(old,new)
elif "liveParams.get('autodetail')" not in s:raise SystemExit('index browserqa anchor missing')
p.write_text(s,encoding='utf-8')
print('PATCH_V069_BROWSERQA_OK')
