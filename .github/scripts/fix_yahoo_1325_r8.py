from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text()
old="if(hm<'09:00'||hm>'13:30')continue;"
count=s.count(old)
if count<2:
    raise SystemExit(f'expected at least 2 intraday filters, got {count}')
s=s.replace(old,"if(hm<'09:00'||hm>'13:30'||hm==='13:25')continue;",2)
p.write_text(s)
print('filtered Yahoo 13:25 synthetic/anomalous bar in stock and TAIEX intraday paths')
