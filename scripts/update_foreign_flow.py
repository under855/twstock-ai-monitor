#!/usr/bin/env python3
"""Capture official TWSE listed-market foreign-investor daily buy/sell value.

The TWSE BFI82U report is a *post-close aggregate*, not a live intraday feed.
Never rewrite a quote date to today's date or generate fabricated interim values.
"""
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'foreign-flow.json'
TZ=ZoneInfo('Asia/Taipei')
URL='https://www.twse.com.tw/rwd/zh/fund/BFI82U'
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; twstock-ai-monitor/1.0)',
         'Accept':'application/json','Referer':'https://www.twse.com.tw/'}

def value(v):
    if isinstance(v,bool): raise ValueError('boolean not a number')
    if isinstance(v,(int,float)): return int(v)
    text=str(v).strip().replace(',','').replace('−','-')
    if not re.fullmatch(r'[+-]?\d+',text): raise ValueError('Non-integer monetary value: '+text)
    return int(text)

def report_date(j):
    text=str(j.get('date') or j.get('title') or '')
    m=re.search(r'(\d{3,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日',text)
    if m:
        yr=int(m.group(1)); yr=yr+1911 if yr<1911 else yr
        return dt.date(yr,int(m.group(2)),int(m.group(3))).isoformat()
    m=re.search(r'(?<!\d)(20\d{2})[-/]?(\d{1,2})[-/]?(\d{1,2})(?!\d)',text)
    if m:return dt.date(int(m.group(1)),int(m.group(2)),int(m.group(3))).isoformat()
    m=re.search(r'(?<!\d)(\d{3})/(\d{1,2})/(\d{1,2})(?!\d)',text)
    if m:return dt.date(int(m.group(1))+1911,int(m.group(2)),int(m.group(3))).isoformat()
    return None

def parse(j,requested_day):
    if j.get('stat')!='OK':raise ValueError('TWSE status not OK')
    date=report_date(j)
    if date!=requested_day:raise ValueError('Source date does not match requested day: '+repr(date))
    fields=j.get('fields') or []
    if len(fields)<4:raise ValueError('Missing four monetary headers')
    required=['買進金額','賣出金額','買賣差額']
    for idx,label in enumerate(required,1):
        if label not in str(fields[idx]):raise ValueError('Unexpected BFI82U field '+str(fields[idx]))
    matches=[row for row in j.get('data',[]) if isinstance(row,list) and row
        and ('外資及陸資' in str(row[0]) or '外資及陸資' in str(row[0]).replace(' ',''))
        and '不含外資自營商' in str(row[0]).replace(' ','')]
    if len(matches)!=1:raise ValueError('Expected exactly one foreign excluding dealers row')
    row=matches[0]
    if len(row)<4:raise ValueError('Incomplete foreign row')
    buy,sell,net=map(value,row[1:4])
    if buy<0 or sell<0 or net!=buy-sell:raise ValueError('Foreign buy/sell/net accounting mismatch')
    if max(buy,sell)>10**15:raise ValueError('Unexpectedly large transaction amount')
    return {'date':date,'market':'TWSE','category':'外資及陸資（不含外資自營商）',
        'buyTWD':buy,'sellTWD':sell,'netTWD':net,'unit':'TWD',
        'source':'TWSE BFI82U','sourceUrl':'https://www.twse.com.tw/zh/trading/foreign/bfi82u.html'}

def fetch(day):
    q=urllib.parse.urlencode({'response':'json','dayDate':day.replace('-',''),'type':'day'})
    req=urllib.request.Request(URL+'?'+q,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=22) as resp:
        return json.loads(resp.read().decode('utf-8-sig'))

def main():
    now=dt.datetime.now(TZ)
    today=now.date()
    if len(sys.argv)>1:
        today=dt.date.fromisoformat(sys.argv[1])
    if today.weekday()>=5:
        print('Non-trading weekend; preserving last validated dataset')
        return
    try:
        data=parse(fetch(today.isoformat()),today.isoformat())
    except Exception as exc:
        # Preserve the last known official day instead of storing partial / fake today's values.
        print('No validated TWSE foreign flow for '+str(today)+': '+str(exc))
        return
    if OUT.exists():
        try:
            previous=json.loads(OUT.read_text(encoding='utf-8'))
            if previous==data:
                print('Official foreign flow unchanged: '+data['date'])
                return
        except (ValueError,OSError):pass
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('OFFICIAL_FOREIGN_FLOW_WRITTEN',data['date'],data['netTWD'])

if __name__=='__main__':main()
