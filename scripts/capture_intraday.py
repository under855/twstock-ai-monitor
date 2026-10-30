#!/usr/bin/env python3
import json, urllib.request, urllib.parse, datetime, pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'intraday'/'latest.json'
TZ=datetime.timezone(datetime.timedelta(hours=8))
CODES={
 '2330':'tse','009817':'tse','0050':'tse','3711':'tse','3293':'otc',
 '2002':'tse','00878':'tse','00919':'tse','0056':'tse','6592':'tse'
}
UA={'User-Agent':'Mozilla/5.0 twstock-ai-monitor official-capture/1.0','Accept':'application/json'}

def n(v):
    try:
        if v is None:return None
        s=str(v).strip().replace(',','').replace('+','')
        if not s or s in ('-','--','---'):return None
        return float(s)
    except:return None

def stamp(date,time):
    try:return int(datetime.datetime.strptime(date+time,'%Y%m%d%H:%M:%S').replace(tzinfo=TZ).timestamp()*1000)
    except:return None

def get(url):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=25) as r:return json.loads(r.read().decode('utf-8-sig'))

def load(day):
    try:
        j=json.loads(OUT.read_text(encoding='utf-8'))
        if j.get('date')==day:return j
    except:pass
    return {'date':day,'generatedAt':None,'source':'TWSE MIS official snapshots','stocks':{},'taiex':[]}

def append(arr,p):
    if p is None:return False
    if arr and int(arr[-1].get('stamp',0))>=int(p['stamp']):
        if int(arr[-1].get('stamp',0))==int(p['stamp']):arr[-1]=p
        return False
    arr.append(p)
    return True

def main():
    now=datetime.datetime.now(TZ)
    if now.weekday()>=5:return
    mins=now.hour*60+now.minute
    if mins<8*60+55 or mins>13*60+35:return
    day=now.strftime('%Y%m%d')
    ch=['tse_t00.tw']+[f'{m}_{c}.tw' for c,m in CODES.items()]
    u='https://mis.twse.com.tw/stock/api/getStockInfo.jsp?'+urllib.parse.urlencode({'ex_ch':'|'.join(ch),'json':'1','delay':'0','_':str(int(now.timestamp()*1000))})
    arr=get(u).get('msgArray') or []
    data=load(now.strftime('%Y-%m-%d')); changed=False
    for x in arr:
        d=str(x.get('d') or '')
        if d!=day:continue
        code=str(x.get('c') or '')
        price=n((x.get('trade') or {}).get('z')) or n(x.get('z'))
        tm=str((x.get('trade') or {}).get('t') or x.get('t') or '')
        st=stamp(d,tm)
        if price is None or st is None:continue
        p={'stamp':st,'close':price,'time':tm,'source':'TWSE MIS'}
        if code=='t00' or str(x.get('ch') or '')=='t00.tw':
            changed=append(data['taiex'],p) or changed
        elif code in CODES:
            changed=append(data['stocks'].setdefault(code,[]),p) or changed
    if changed:
        data['generatedAt']=now.isoformat()
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
        print(json.dumps({'ok':True,'date':data['date'],'taiex':len(data['taiex']),'stocks':{k:len(v) for k,v in data['stocks'].items()}},ensure_ascii=False))
    else:print(json.dumps({'ok':True,'changed':False,'date':data['date']},ensure_ascii=False))

if __name__=='__main__':main()
