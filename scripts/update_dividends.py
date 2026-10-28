#!/usr/bin/env python3
import concurrent.futures
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
LATEST=ROOT/'data'/'latest.json'
OUT=ROOT/'data'/'dividends.json'
UA={'User-Agent':'Mozilla/5.0 twstock-ai-monitor/0.7 (+https://github.com/under855/twstock-ai-monitor)','Accept':'application/json,text/plain,*/*'}


def request_json(url, *, data=None, timeout=40, attempts=3):
    body=None
    headers=dict(UA)
    if data is not None:
        body=urllib.parse.urlencode(data).encode()
        headers['Content-Type']='application/x-www-form-urlencoded'
    last=None
    for i in range(attempts):
        try:
            req=urllib.request.Request(url,data=body,headers=headers,method='POST' if body is not None else 'GET')
            with urllib.request.urlopen(req,timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8-sig'))
        except Exception as e:
            last=e
            if i+1<attempts: time.sleep(1.0*(i+1))
    raise last


def n(v):
    if v is None:return None
    s=str(v).strip().replace(',','').replace('+','')
    if s in ('','--','---','-','N/A','nan'):return None
    try:return float(s)
    except:return None


def iso(v):
    if v is None:return None
    s=str(v).strip().replace('年','/').replace('月','/').replace('日','').replace('.','/').replace('-','/')
    p=[x.strip() for x in s.split('/') if x.strip()!='']
    if len(p)==3:
        try:
            y=int(p[0]);y=y+1911 if y<1911 else y
            return f'{y:04d}-{int(p[1]):02d}-{int(p[2]):02d}'
        except:pass
    digits=''.join(c for c in s if c.isdigit())
    try:
        if len(digits)==7:return f'{int(digits[:3])+1911:04d}-{int(digits[3:5]):02d}-{int(digits[5:7]):02d}'
        if len(digits)==8:return f'{int(digits[:4]):04d}-{int(digits[4:6]):02d}-{int(digits[6:8]):02d}'
    except:pass
    return None


def field_index(fields, aliases):
    norm={str(x).replace(' ','').replace('\n',''):i for i,x in enumerate(fields)}
    for a in aliases:
        k=a.replace(' ','').replace('\n','')
        if k in norm:return norm[k]
    for a in aliases:
        k=a.replace(' ','').replace('\n','')
        for name,i in norm.items():
            if k and k in name:return i
    return None


def row_value(row, idx):
    return row[idx] if idx is not None and idx<len(row) else None


def fetch_etf_dividends(start_date,end_date):
    q=urllib.parse.urlencode({'stkNo':'','startDate':start_date.strftime('%Y%m%d'),'endDate':end_date.strftime('%Y%m%d'),'response':'json'})
    j=request_json('https://www.twse.com.tw/rwd/zh/ETF/etfDiv?'+q)
    out=[]
    for r in j.get('data') or []:
        if not isinstance(r,list) or len(r)<6:continue
        code=str(r[0] or '').strip(); exd=iso(r[2])
        if not code or not exd:continue
        out.append({'code':code,'name':str(r[1] or '').strip(),'type':'ETF','market':'TWSE','exDate':exd,'recordDate':iso(r[3]),'paymentDate':iso(r[4]),'cashDividend':n(r[5]),'stockDividendRatio':None,'source':'TWSE ETF 收益分配','eventType':'ex-dividend'})
    return out


def parse_exright(fields, rows, market):
    di=field_index(fields,['資料日期','除權息日期','除權除息日期','ExRrightsExDividendDate','Date'])
    ci=field_index(fields,['股票代號','證券代號','SecuritiesCompanyCode','Code'])
    ni=field_index(fields,['股票名稱','名稱','CompanyName','Name'])
    pi=field_index(fields,['除權息前收盤價','除權除息前收盤價','除權前參考價','ClosingPriceBeforeExRightExDividend','PreClose'])
    ki=field_index(fields,['權/息','除權息','權息','ExRrightsExDividend','Exdividend'])
    if di is None or ci is None or pi is None:
        raise RuntimeError(f'{market} ex-right schema unsupported fields={fields}')
    out=[]
    for r in rows:
        if not isinstance(r,list):continue
        d=iso(row_value(r,di)); code=str(row_value(r,ci) or '').strip(); pre=n(row_value(r,pi))
        if not d or not code or pre is None:continue
        kind=str(row_value(r,ki) or '').strip()
        out.append({'code':code,'name':str(row_value(r,ni) or '').strip(),'market':market,'exDate':d,'preClose':pre,'kind':kind,'source':f'{market} 除權除息計算結果','eventType':'ex-event'})
    return out


def fetch_twse_exright(start_date,end_date):
    q=urllib.parse.urlencode({'startDate':start_date.strftime('%Y%m%d'),'endDate':end_date.strftime('%Y%m%d'),'response':'json'})
    j=request_json('https://www.twse.com.tw/rwd/zh/exRight/TWT49U?'+q)
    if j.get('stat')!='OK':raise RuntimeError(f"TWSE ex-right stat={j.get('stat')}")
    return parse_exright(j.get('fields') or [],j.get('data') or [],'TWSE')


def fetch_tpex_exright(start_date,end_date):
    j=request_json('https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ',data={'startDate':start_date.strftime('%Y/%m/%d'),'endDate':end_date.strftime('%Y/%m/%d'),'id':'','response':'json'})
    table=(j.get('tables') or [None])[0]
    if not table:raise RuntimeError('TPEx ex-right table missing')
    rows=table.get('data') or []
    total=int(table.get('totalCount') or len(rows))
    if len(rows)<total:raise RuntimeError(f'TPEx ex-right truncated {len(rows)}/{total}')
    return parse_exright(table.get('fields') or [],rows,'TPEx')


def sum_fields(r,keys):
    vals=[n(r.get(k)) for k in keys];vals=[x for x in vals if x is not None]
    return sum(vals) if vals else None


def fetch_distributions():
    urls=[('TWSE','https://openapi.twse.com.tw/v1/opendata/t187ap45_L'),('TPEx','https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap39_O')]
    out=[]
    for market,url in urls:
        try:rows=request_json(url)
        except Exception as e:
            print(f'WARN distribution {market}: {e}');continue
        if not isinstance(rows,list):continue
        for r in rows:
            code=str(r.get('公司代號') or r.get('SecuritiesCompanyCode') or r.get('Code') or '').strip()
            if not code:continue
            cash=sum_fields(r,['股東配發-盈餘分配之現金股利(元/股)','股東配發-法定盈餘公積發放之現金(元/股)','股東配發-資本公積發放之現金(元/股)','CashDividend'])
            stock=sum_fields(r,['股東配發-盈餘轉增資配股(元/股)','股東配發-法定盈餘公積轉增資配股(元/股)','股東配發-資本公積轉增資配股(元/股)','StockDividend'])
            if (cash or 0)==0 and (stock or 0)==0:continue
            decision=iso(r.get('董事會（擬議）股利分派日') or r.get('股東會日期') or r.get('DecisionDate'))
            year=str(r.get('股利年度') or r.get('DividendYear') or '').strip()
            out.append({'code':code,'name':str(r.get('公司名稱') or r.get('CompanyName') or '').strip(),'market':market,'decisionDate':decision,'dividendYear':year,'cashDividend':cash,'stockDividendRatio':stock,'source':f'{market} 股利分派情形','eventType':'distribution','status':str(r.get('決議（擬議）進度') or r.get('Status') or '').strip()})
    return out


def twse_daily(date):
    q=urllib.parse.urlencode({'date':date.strftime('%Y%m%d'),'type':'ALLBUT0999','response':'json'})
    j=request_json('https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?'+q,timeout=35,attempts=2)
    tables=j.get('tables') or []
    for t in tables:
        f=t.get('fields') or []
        ci=field_index(f,['證券代號','股票代號']);hi=field_index(f,['最高價']);cl=field_index(f,['收盤價'])
        if ci is None or hi is None or cl is None:continue
        out={}
        for r in t.get('data') or []:
            code=str(row_value(r,ci) or '').strip(); high=n(row_value(r,hi));close=n(row_value(r,cl))
            if code and (high is not None or close is not None):out[code]={'high':high,'close':close}
        if len(out)>100:return out
    return {}


def roc_date(d):return f'{d.year-1911}/{d.month:02d}/{d.day:02d}'


def tpex_daily(date):
    q=urllib.parse.urlencode({'l':'zh-tw','o':'json','d':roc_date(date),'s':'0,asc,0'})
    j=request_json('https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?'+q,timeout=35,attempts=2)
    rows=j.get('aaData') or []
    out={}
    for r in rows:
        if not isinstance(r,list) or len(r)<7:continue
        code=str(r[0] or '').strip();close=n(r[2]);high=n(r[5])
        if code and (high is not None or close is not None):out[code]={'high':high,'close':close}
    return out


def fill_kind(kind):
    k=str(kind or '')
    has_r='權' in k;has_d='息' in k
    if has_r and has_d:return '填權息'
    if has_r:return '填權'
    return '填息'


def calculate_market_fill(events,market,start_date,end_date):
    ev=[dict(x,fillState='unknown',fillDate=None,fillTradingDays=None,fillTarget=x['preClose'],checkedThrough=None,_days=0) for x in events]
    active={}
    for i,e in enumerate(ev):active.setdefault(e['code'],[]).append(i)
    fetcher=twse_daily if market=='TWSE' else tpex_daily
    d=start_date
    requests=0;trading_dates=0
    while d<=end_date:
        if d.weekday()<5:
            try:quotes=fetcher(d);requests+=1
            except Exception as e:
                print(f'WARN {market} daily {d}: {e}');quotes={}
            if quotes:
                trading_dates+=1
                ds=d.isoformat()
                for code,indexes in active.items():
                    q=quotes.get(code)
                    if not q:continue
                    for idx in indexes:
                        e=ev[idx]
                        if e['fillState']=='filled' or ds<e['exDate']:continue
                        e['_days']+=1;e['checkedThrough']=ds
                        h=q.get('high') if q.get('high') is not None else q.get('close')
                        if h is not None and h>=e['preClose']:
                            e['fillState']='filled';e['fillDate']=ds;e['fillTradingDays']=e['_days']
                # shrink only when every event for a code filled
                active={c:idxs for c,idxs in active.items() if any(ev[i]['fillState']!='filled' for i in idxs)}
            time.sleep(0.10)
        d+=dt.timedelta(days=1)
    for e in ev:
        if e['fillState']!='filled':
            if e['_days']>0:
                e['fillState']='unfilled';e['fillTradingDays']=e['_days']
            e['fillKind']=fill_kind(e.get('kind'))
        else:e['fillKind']=fill_kind(e.get('kind'))
        e.pop('_days',None)
    return ev,{'requests':requests,'tradingDates':trading_dates,'events':len(ev),'unknown':sum(1 for x in ev if x['fillState']=='unknown'),'filled':sum(1 for x in ev if x['fillState']=='filled'),'unfilled':sum(1 for x in ev if x['fillState']=='unfilled')}


def merge_ex_and_etf(ex_events,etf_rows):
    by={(e['code'],e['exDate']):dict(e) for e in ex_events}
    for e in etf_rows:
        key=(e['code'],e['exDate']);old=by.get(key)
        if old:by[key]={**old,**e,'preClose':old.get('preClose'),'kind':old.get('kind'),'fillState':old.get('fillState'),'fillDate':old.get('fillDate'),'fillTradingDays':old.get('fillTradingDays'),'fillTarget':old.get('fillTarget'),'fillKind':old.get('fillKind'),'checkedThrough':old.get('checkedThrough'),'source':e['source']+' + '+old['source']}
        else:by[key]=e
    return list(by.values())


def write_json(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');tmp.replace(path)


def main():
    latest=json.loads(LATEST.read_text(encoding='utf-8'))
    through=dt.date.fromisoformat(latest['tradeDate'])
    start=through-dt.timedelta(days=370)
    print('range',start,through)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        f_etf=ex.submit(fetch_etf_dividends,start,through)
        f_tw=ex.submit(fetch_twse_exright,start,through)
        f_otc=ex.submit(fetch_tpex_exright,start,through)
        etfs=f_etf.result();tw_events=f_tw.result();otc_events=f_otc.result()
    print('events',{'ETF':len(etfs),'TWSE':len(tw_events),'TPEx':len(otc_events)})
    if len(tw_events)<50:raise RuntimeError(f'TWSE ex-right rows suspiciously low: {len(tw_events)}')
    if len(otc_events)<30:raise RuntimeError(f'TPEx ex-right rows suspiciously low: {len(otc_events)}')
    if not any(x['code']=='0050' for x in etfs):raise RuntimeError('ETF data missing 0050')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1=ex.submit(calculate_market_fill,tw_events,'TWSE',start,through)
        f2=ex.submit(calculate_market_fill,otc_events,'TPEx',start,through)
        tw_fill,tw_stats=f1.result();otc_fill,otc_stats=f2.result()
    all_fill=tw_fill+otc_fill
    stats={'TWSE':tw_stats,'TPEx':otc_stats}
    print('fill stats',json.dumps(stats,ensure_ascii=False))
    past=[x for x in all_fill if x['exDate']<=through.isoformat()]
    unknown=sum(1 for x in past if x['fillState']=='unknown')
    if past and unknown/max(1,len(past))>0.08:raise RuntimeError(f'unknown fill ratio too high: {unknown}/{len(past)}')
    distributions=fetch_distributions()
    merged=merge_ex_and_etf(all_fill,etfs)
    items=merged+distributions
    items.sort(key=lambda x:(x.get('code',''),x.get('exDate') or x.get('decisionDate') or ''),reverse=False)
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    payload={'generatedAt':now,'throughDate':through.isoformat(),'algorithm':'官方除權息前收盤價為填回目標；自除權息日起，以實際交易日最高價首次達到或超過目標計算，除權息當日為第1個交易日。','stats':stats,'count':len(items),'items':items}
    write_json(OUT,payload)
    samples={c:[x for x in items if x.get('code')==c and x.get('exDate')][-3:] for c in ['0050','0056','2002','3293','3711','6592']}
    print('samples',json.dumps(samples,ensure_ascii=False))

if __name__=='__main__':main()
