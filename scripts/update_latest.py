#!/usr/bin/env python3
import json, urllib.request, datetime, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'latest.json'
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
    s=str(v or '').strip().replace('.','/').replace('-','/')
    p=s.split('/')
    if len(p)==3:
        try:
            y=int(p[0]); y=y+1911 if y<1911 else y
            return f'{y:04d}-{int(p[1]):02d}-{int(p[2]):02d}'
        except: pass
    return None

def latest_trade_date():
    j=get('https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json')
    rows=j.get('data') or []
    if not rows: raise RuntimeError('TWSE FMTQIK empty')
    d=roc_to_iso(rows[-1][0])
    if not d: raise RuntimeError('Cannot parse trade date')
    return d

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

def main():
    trade_date=latest_trade_date()
    twse=fetch_twse(trade_date)
    tpex=fetch_tpex(trade_date)
    symbols={**twse,**tpex}
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload={
        'generatedAt':now,'tradeDate':trade_date,
        'counts':{'TWSE':len(twse),'TPEx':len(tpex),'total':len(symbols)},
        'symbols':symbols
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    tmp=OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    tmp.replace(OUT)
    print(json.dumps({'ok':True,'tradeDate':trade_date,'TWSE':len(twse),'TPEx':len(tpex),'total':len(symbols)},ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except Exception as e:
        print(f'ERROR: {e}',file=sys.stderr)
        raise
