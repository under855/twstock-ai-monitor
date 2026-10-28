#!/usr/bin/env python3
import pathlib,re

p=pathlib.Path('scripts/update_dividends.py')
s=p.read_text(encoding='utf-8')
new=r'''def calculate_market_fill(events,market,start_date,end_date):
    ev=[dict(x,fillState='unknown',fillDate=None,fillTradingDays=None,fillTarget=x['preClose'],checkedThrough=None,_days=0) for x in events]
    active={}
    for i,e in enumerate(ev):active.setdefault(e['code'],[]).append(i)
    fetcher=twse_daily if market=='TWSE' else tpex_daily
    if not ev:
        return ev,{'requests':0,'tradingDates':0,'events':0,'unknown':0,'filled':0,'unfilled':0,'fetchErrors':0}

    earliest=max(start_date,min(dt.date.fromisoformat(e['exDate']) for e in ev))
    dates=[];d=earliest
    while d<=end_date:
        if d.weekday()<5:dates.append(d)
        d+=dt.timedelta(days=1)

    def fetch_one(day):
        try:
            return day,fetcher(day),None
        except Exception as exc:
            return day,{},str(exc)

    # Bounded concurrency keeps the official sources under modest load while
    # avoiding a 20+ minute serial scan. Results are sorted before calculation,
    # so fill-day counting remains deterministic and chronological.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        fetched=list(pool.map(fetch_one,dates))
    fetched.sort(key=lambda x:x[0])

    trading_dates=0;fetch_errors=0
    for day,quotes,error in fetched:
        if error:
            fetch_errors+=1
            print(f'WARN {market} daily {day}: {error}',flush=True)
        if not quotes:continue
        trading_dates+=1;ds=day.isoformat()
        for code,indexes in list(active.items()):
            q=quotes.get(code)
            if not q:continue
            for idx in indexes:
                e=ev[idx]
                if e['fillState']=='filled' or ds<e['exDate']:continue
                e['_days']+=1;e['checkedThrough']=ds
                h=q.get('high') if q.get('high') is not None else q.get('close')
                if h is not None and h>=e['preClose']:
                    e['fillState']='filled';e['fillDate']=ds;e['fillTradingDays']=e['_days']
        active={c:idxs for c,idxs in active.items() if any(ev[i]['fillState']!='filled' for i in idxs)}

    for e in ev:
        if e['fillState']!='filled' and e['_days']>0:
            e['fillState']='unfilled';e['fillTradingDays']=e['_days']
        e['fillKind']=fill_kind(e.get('kind'));e.pop('_days',None)
    return ev,{
        'requests':len(dates),'tradingDates':trading_dates,'events':len(ev),
        'unknown':sum(1 for x in ev if x['fillState']=='unknown'),
        'filled':sum(1 for x in ev if x['fillState']=='filled'),
        'unfilled':sum(1 for x in ev if x['fillState']=='unfilled'),
        'fetchErrors':fetch_errors
    }


def merge_ex_and_etf'''
pat=r'def calculate_market_fill\(events,market,start_date,end_date\):.*?\n\ndef merge_ex_and_etf'
s2,n=re.subn(pat,new,s,count=1,flags=re.S)
if n!=1:raise SystemExit(f'calculate_market_fill patch count={n}')
p.write_text(s2,encoding='utf-8')
print('PARALLEL_DIVIDEND_FETCH_PATCH_OK')
