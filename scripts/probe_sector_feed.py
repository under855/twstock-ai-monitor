#!/usr/bin/env python3
"""Read-only sector feed probe. Never changes production data."""
import datetime, json, urllib.request, re, sys
from html import escape
CATEGORIES = ['電子類指數','金融保險類指數','航運類指數','鋼鐵類指數','半導體類指數','塑膠類指數','食品類指數','電機機械類指數','建材營造類指數','生技醫療類指數']
def numeric(v):
    if v is None:return None
    s=str(v).replace(',','').replace('＋','+').strip()
    if s in ('','--','---','-'):return None
    try:return float(s)
    except (ValueError,TypeError):return None
def extract(report, date):
    assert report.get('stat')=='OK',f"TWSE report status: {report.get('stat')}"
    matched=[]
    for table in report.get('tables',[]):
        title=str(table.get('title',''))
        if '價格指數(臺灣證券交易所)' not in title:continue
        roc=f'{int(date[:4])-1911}年{int(date[4:6]):02d}月{int(date[6:8]):02d}日'
        if roc not in title:raise ValueError('index table date mismatch '+title)
        for row in table.get('data',[]):
            if len(row)<5:continue
            name=str(row[0]).strip()
            if name not in CATEGORIES:continue
            direction=re.sub(r'<[^>]*>','',str(row[2])).strip()
            points=numeric(row[3]);percent=numeric(row[4])
            if percent is None or direction not in ('+','-','X',''):continue
            if direction=='-' and percent>0:percent=-percent
            if direction=='+' and percent<0:raise ValueError('sign mismatch '+name)
            if not -50<=percent<=50:raise ValueError('outlier '+name)
            matched.append({'name':name.replace('類指數','').replace('指數',''),'percent':percent,'date':date})
    if len(matched)<5:
        print('DEBUG status',report.get('stat'),'tables',len(report.get('tables',[])))
        for t in report.get('tables',[]):
            print('DEBUG table',repr(t.get('title',''))[:160], 'data',len(t.get('data',[])),'sample',str(t.get('data',[])[:2])[:350])
        raise ValueError(f'insufficient categories: {len(matched)}')
    if len({x['name'] for x in matched})!=len(matched):raise ValueError('duplicate categories')
    return matched
def fetch(date):
    url=f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={date}&type=ALLBUT0999&response=json'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=25) as response: return json.load(response)
def preview(rows):
    content=''.join(f"<span>{escape(v['name'])} <b class=\"{'up' if v['percent']>0 else 'down' if v['percent']<0 else 'flat'}\">{v['percent']:+.2f}%</b></span>" for v in rows)
    assert '<script' not in content
    assert len(re.findall('<span>',content))==len(rows)
    return content
if __name__=='__main__':
    for day in ('20261111','20261112'):
        try:
            rows=extract(fetch(day),day)
            print('PASS date',day,'sectors',len(rows))
            print(json.dumps(rows,ensure_ascii=False))
            print('PREVIEW',preview(rows)[:1600])
        except Exception as exc:
            print('FAIL date',day,str(exc),file=sys.stderr)
            sys.exit(1)
