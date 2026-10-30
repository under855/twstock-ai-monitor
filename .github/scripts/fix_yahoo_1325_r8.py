from pathlib import Path
p=Path('extras-v090.js')
s=p.read_text()
stock="if(hm<'09:00'||hm>'13:30')continue;"
index="if(day===today&&hm>='09:00'&&hm<='13:30')out.push({time:d,close})"
if stock not in s:
    raise SystemExit('stock intraday filter pattern missing')
if index not in s:
    raise SystemExit('TAIEX intraday filter pattern missing')
s=s.replace(stock,"if(hm<'09:00'||hm>'13:30'||hm==='13:25')continue;",1)
s=s.replace(index,"if(day===today&&hm>='09:00'&&hm<='13:30'&&hm!=='13:25')out.push({time:d,close})",1)
p.write_text(s)
print('filtered Yahoo 13:25 anomalous bar in stock and TAIEX intraday paths')
