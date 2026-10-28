#!/usr/bin/env python3
import pathlib,re

p=pathlib.Path('scripts/update_dividends.py')
s=p.read_text(encoding='utf-8')

new_tpex=r'''def tpex_daily(date):
    ds=date.strftime('%Y/%m/%d')
    q=urllib.parse.urlencode({'date':ds,'type':'EW','response':'json'})
    j=request_json('https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?'+q,timeout=30,attempts=3)
    if str(j.get('stat','')).lower()!='ok':
        return {}
    out={}
    for t in j.get('tables') or []:
        fields=t.get('fields') or []
        ci=field_index(fields,['代號','股票代號','證券代號'])
        hi=field_index(fields,['最高','最高價'])
        cl=field_index(fields,['收盤','收盤價'])
        if ci is None or cl is None:continue
        for r in t.get('data') or []:
            if not isinstance(r,list):continue
            code=str(rv(r,ci) or '').strip();high=n(rv(r,hi));close=n(rv(r,cl))
            if code and (high is not None or close is not None):
                out[code]={'high':high,'close':close}
        if len(out)>100:return out
    return out


def fill_kind'''
pat=r'def tpex_daily\(date\):.*?\n\ndef fill_kind'
s2,n=re.subn(pat,new_tpex,s,count=1,flags=re.S)
if n!=1:raise SystemExit(f'tpex_daily patch count={n}')
p.write_text(s2,encoding='utf-8')
print('PATCH_TPEX_DAILY_V070_OK')
