from pathlib import Path
p=Path('index.html')
s=p.read_text()
needle='</body>'
script='<script src="./foreign-live-test.js?v=1"></script>\n</body>'
if 'foreign-live-test.js' not in s:
    if needle not in s: raise SystemExit('body end not found')
    s=s.replace(needle,script,1)
p.write_text(s)
print('foreign live test script attached')
