#!/usr/bin/env python3
from pathlib import Path

# 1) Keep actual source dates in latest.json generation.
p=Path('scripts/update_latest.py')
s=p.read_text(encoding='utf-8')
old="""        c=str(r.get('Code','')).strip()\n        if not c: continue\n        out[c]={\n"""
new="""        c=str(r.get('Code','')).strip()\n        if not c: continue\n        row_date=roc_to_iso(r.get('Date'))\n        if not row_date: continue\n        out[c]={\n"""
if old not in s: raise SystemExit('TWSE insert marker missing')
s=s.replace(old,new,1)
old="'tradeDate':trade_date,'source':'TWSE STOCK_DAY_ALL'"
new="'tradeDate':row_date,'source':'TWSE STOCK_DAY_ALL'"
if old not in s: raise SystemExit('TWSE tradeDate marker missing')
s=s.replace(old,new,1)
old="""                c=str(r.get('SecuritiesCompanyCode') or r.get('Code') or '').strip()\n                if not c: continue\n                out[c]={\n"""
new="""                c=str(r.get('SecuritiesCompanyCode') or r.get('Code') or '').strip()\n                if not c: continue\n                row_date=roc_to_iso(r.get('Date'))\n                if not row_date: continue\n                out[c]={\n"""
if old not in s: raise SystemExit('TPEx insert marker missing')
s=s.replace(old,new,1)
old="'tradeDate':trade_date,'source':'TPEx OpenAPI'"
new="'tradeDate':row_date,'source':'TPEx OpenAPI'"
if old not in s: raise SystemExit('TPEx tradeDate marker missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# 2) Do not let an old localStorage universe cache prevent a fresh network load.
p=Path('index.html')
s=p.read_text(encoding='utf-8')
old="""   if(!force&&loadUniverseCache())return universeMap;\n   $('universePill').textContent='台股名冊：載入中…';\n"""
new="""   $('universePill').textContent='台股名冊：載入中…';\n"""
if old not in s: raise SystemExit('cache-first marker missing')
s=s.replace(old,new,1)
s=s.replace('// 2026/10/22 最近有效交易日快照：讓 file://、休市、來源暫斷時仍有可驗證畫面。','// 2026/10/28 最近有效交易日快照：讓 file://、休市、來源暫斷時仍有可驗證畫面。',1)
p.write_text(s,encoding='utf-8')

print('integrity patch applied')
