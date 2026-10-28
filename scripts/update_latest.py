#!/usr/bin/env python3
import json, urllib.request, urllib.parse, datetime, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'latest.json'
DIV_OUT = ROOT / 'data' / 'dividends.json'
UA = {'User-Agent':'Mozilla/5.0 twstock-ai-monitor/1.0','Accept':'application/json'}

def get(url, timeout=30):
    req=urllib.request.Request(url,headers=UA)
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8-sig'))

def n(v):
    if v is None:return None
    s=str(v).strip().replace(',','').replace('+','')
    if s in ('','--','---','-'):return None
    try:return float(s)
    except:return None

def roc_to_iso(v):
    s=str(v or '').strip().replace('年','/').replace('月','/').replace('日','').replace('.','/').replace('-','/')
    p=s.split('/')
    if len(p)==3:
        try:
            y=int(p[0]); y=y+1911 if y<1911 else y
            return f'{y:04d}-{int(p[1]):02d}-{int(p[2]):02d}'
        except: pass
    digits=''.join(ch for ch in s if ch.isdigit())
    try:
        if len(digits)==7:
            return f'{int(digits[:3])+1911:04d}-{int(digits[3:5]):02d}-{int(digits[5:7]):02d}'
        if len(digits)==8:
            return f'{int(digits[:4]):04d}-{int(digits[4:6]):02d}-{int(digits[6:8]):02d}'
    except: pass
    return None

def fmtqik_rows():
    j=get('https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json')
    rows=j.get('data') or []
    if not rows: raise RuntimeError('TWSE FMTQIK empty')
    return rows

def latest_trade_date(rows=None):
    rows=rows or fmtqik_rows()
    d=roc_to_iso(rows[-1][0])
    if not d: raise RuntimeError('Cannot parse trade date')
    return d

def fetch_taiex(trade_date, rows=None):
    rows=rows or fmtqik_rows()
    matched=None
    for r in rows:
        if r and roc_to_iso(r[0])==trade_date:
            matched=r
    if matched is None:
        matched=rows[-1]
    if len(matched)<6: raise RuntimeError('FMTQIK row missing TAIEX columns')
    return {
        'date':roc_to_iso(matched[0]),
        'close':n(matched[4]),
        'change':n(matched[5]),
        'source':'TWSE FMTQIK'
    }

def fetch_twse(trade_date):
    rows=get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
    out={}
    for r in rows if isinstance(rows,list) else []:
        c=str(r.get('Code','')).strip()
        if not c: continue
        out[c]={
            'symbol':c,'name':str(r.get('Name','')).strip(),'market':'TWSE',
            'close':n(r.get('ClosingPrice')),'open':n(r.get('OpeningPrice')),
            'high':n(r.get('HighestPrice')),'low':n(r.get('LowestPrice')),
            'volume':n(r.get('TradeVolume')),'change':n(r.get('Change')),
            'tradeDate':trade_date,'source':'TWSE STOCK_DAY_ALL'
        }
    if len(out)<500: raise RuntimeError(f'TWSE rows too few: {len(out)}')
    return out

def fetch_tpex(trade_date):
    urls=[
        'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes',
        'https://www.tpex.org.tw/openapi/v1/tpex_daily_market_value'
    ]
    last=None
    for url in urls:
        try:
            rows=get(url)
            out={}
            for r in rows if isinstance(rows,list) else []:
                c=str(r.get('SecuritiesCompanyCode') or r.get('Code') or '').strip()
                if not c: continue
                out[c]={
                    'symbol':c,
                    'name':str(r.get('CompanyName') or r.get('SecuritiesCompanyName') or r.get('SecuritiesName') or '').strip(),
                    'market':'TPEx',
                    'close':n(r.get('Close') or r.get('ClosePrice') or r.get('LatestPrice')),
                    'open':n(r.get('Open') or r.get('OpenPrice')),
                    'high':n(r.get('High') or r.get('HighPrice')),
                    'low':n(r.get('Low') or r.get('LowPrice')),
                    'volume':n(r.get('TradingShares') or r.get('TradeVolume')),
                    'change':n(r.get('Change') or r.get('ChangeAmount')),
                    'tradeDate':trade_date,'source':'TPEx OpenAPI'
                }
            if len(out)>=300:return out
            last=RuntimeError(f'TPEx rows too few: {len(out)} from {url}')
        except Exception as e:last=e
    raise last or RuntimeError('TPEx failed')

def fetch_etf_dividends(end_date):
    end=datetime.date.fromisoformat(end_date)
    start=end-datetime.timedelta(days=370)
    params=urllib.parse.urlencode({
        'stkNo':'',
        'startDate':start.strftime('%Y%m%d'),
        'endDate':end.strftime('%Y%m%d'),
        'response':'json'
    })
    j=get('https://www.twse.com.tw/rwd/zh/ETF/etfDiv?'+params, timeout=40)
    rows=j.get('data') or []
    out=[]
    for r in rows:
        if not isinstance(r,list) or len(r)<6: continue
        code=str(r[0] or '').strip()
        exd=roc_to_iso(r[2]); rec=roc_to_iso(r[3]); pay=roc_to_iso(r[4])
        if not code or not exd: continue
        out.append({
            'code':code,'name':str(r[1] or '').strip(),'type':'ETF','market':'TWSE',
            'exDate':exd,'recordDate':rec,'paymentDate':pay,'cashDividend':n(r[5]),
            'stockDividendRatio':None,'source':'TWSE ETF 收益分配','eventType':'ex-dividend'
        })
    if not any(x['code']=='0050' for x in out):
        raise RuntimeError('ETF dividend feed missing 0050')
    return out

def write_json(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    tmp.replace(path)

def main():
    market_rows=fmtqik_rows()
    trade_date=latest_trade_date(market_rows)
    taiex=fetch_taiex(trade_date,market_rows)
    twse=fetch_twse(trade_date)
    tpex=fetch_tpex(trade_date)
    symbols={**twse,**tpex}
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload={
        'generatedAt':now,'tradeDate':trade_date,'taiex':taiex,
        'counts':{'TWSE':len(twse),'TPEx':len(tpex),'total':len(symbols)},
        'symbols':symbols
    }
    write_json(OUT,payload)
    print(json.dumps({'ok':True,'tradeDate':trade_date,'taiex':taiex,'TWSE':len(twse),'TPEx':len(tpex),'total':len(symbols)},ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except Exception as e:
        print(f'ERROR: {e}',file=sys.stderr)
        raise
