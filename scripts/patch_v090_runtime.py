from pathlib import Path
p=Path('live-v090.js')
s=p.read_text(encoding='utf-8')
a="observer.observe(watch,{childList:true,subtree:true});"
b="observer.observe(watch,{childList:true,subtree:false});"
if a not in s:
    raise SystemExit('observer target missing')
s=s.replace(a,b,1)
p.write_text(s,encoding='utf-8')
print('PATCH_V090_RUNTIME_OK')
