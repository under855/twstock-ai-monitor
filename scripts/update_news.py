from __future__ import annotations
import json, re, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

STOCKS = {
    '0050':'元大台灣50',
    '3711':'日月光投控',
    '3293':'鈊象',
    '2002':'中鋼',
    '00878':'國泰永續高股息',
    '00919':'群益台灣精選高息',
    '2330':'台積電',
}
ALIASES = {
    '3711':['日月光投控','日月光','3711'],
    '0050':['元大台灣50','0050'],
    '3293':['鈊象','3293'],
    '2002':['中鋼','2002'],
    '00878':['國泰永續高股息','00878'],
    '00919':['群益台灣精選高息','00919'],
    '2330':['台積電','台灣積體電路','2330'],
}
TRUSTED = ['鉅亨網','MoneyDJ','中央社','經濟日報','工商時報','自由財經','聯合新聞網','Yahoo奇摩股市']
UA = 'Mozilla/5.0 (compatible; twstock-ai-monitor/1.0)'
MAX_AGE_MS = 30 * 86400000


def fetch(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language':'zh-TW,zh;q=0.9'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_date(s: str) -> int | None:
    if not s: return None
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp()*1000)
    except Exception:
        return None


def publisher_from_title(title: str) -> tuple[str,str]:
    m = re.search(r'\s+-\s+([^\-]+)$', title)
    if not m: return title.strip(), ''
    return title[:m.start()].strip(), m.group(1).strip()


def norm(s: str) -> str:
    return re.sub(r'[\s　()（）\-—_·,，.。:：/／]','',str(s or '').lower())


def is_relevant(title: str, code: str, aliases: list[str]) -> bool:
    t = norm(title)
    return norm(code) in t or any(len(norm(a)) >= 2 and norm(a) in t for a in aliases)


def valid_item(x: dict, code: str, name: str) -> bool:
    if not isinstance(x, dict) or not x.get('title') or not x.get('link'): return False
    pub = str(x.get('publisher') or '')
    if not any(t.lower() in pub.lower() for t in TRUSTED): return False
    ts = x.get('time')
    if isinstance(ts, (int,float)) and ts < time.time()*1000-MAX_AGE_MS: return False
    return is_relevant(str(x.get('title')), code, ALIASES.get(code,[name,code]))


def query_variant(code: str, name: str, q: str):
    aliases = ALIASES.get(code,[name,code])
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q':q,'hl':'zh-TW','gl':'TW','ceid':'TW:zh-Hant'})
    root = ET.fromstring(fetch(url))
    out=[]; cutoff=time.time()*1000-MAX_AGE_MS
    for item in root.findall('.//item'):
        title=(item.findtext('title') or '').strip(); link=(item.findtext('link') or '').strip(); pub=''
        src=item.find('source')
        if src is not None and src.text: pub=src.text.strip()
        if not pub: title,pub=publisher_from_title(title)
        ts=parse_date(item.findtext('pubDate') or '')
        if not title or not link: continue
        if ts and ts < cutoff: continue
        if not any(t.lower() in pub.lower() for t in TRUSTED): continue
        if not is_relevant(title,code,aliases): continue
        out.append({'title':title,'link':link,'publisher':pub,'time':ts})
    return out


def query_one(code: str, name: str):
    aliases = ALIASES.get(code,[name,code])
    queries = [
        ' OR '.join(aliases) + ' 股票 when:30d',
        f'"{aliases[0]}" when:30d',
        f'{code} {name} when:30d',
    ]
    out=[]; seen=set(); errors=[]
    for q in queries:
        for attempt in range(2):
            try:
                rows=query_variant(code,name,q)
                for x in rows:
                    k=norm(x['title'])
                    if k and k not in seen:
                        seen.add(k); out.append(x)
                break
            except Exception as e:
                errors.append(repr(e))
                time.sleep(1.0 + attempt)
        if len(out)>=8: break
        time.sleep(0.25)
    out.sort(key=lambda x: x.get('time') or 0, reverse=True)
    if errors and not out: print(code,'query errors:',errors[-2:])
    return out[:8]


def load_old():
    p=Path('data/news.json')
    if not p.exists(): return {'stocks':{}}
    try: return json.loads(p.read_text(encoding='utf-8'))
    except Exception: return {'stocks':{}}


def main():
    old=load_old(); old_stocks=old.get('stocks') or {}
    data={'generatedAt':datetime.now(timezone.utc).isoformat(),'stocks':{},'refreshStatus':{}}
    for code,name in STOCKS.items():
        fresh=[]
        try:
            fresh=query_one(code,name)
        except Exception as e:
            print(code,name,'ERROR',repr(e))
        previous=[x for x in (old_stocks.get(code) or []) if valid_item(x,code,name)]
        if fresh:
            data['stocks'][code]=fresh
            data['refreshStatus'][code]='fresh'
            print(code,name,len(fresh),'fresh')
        elif previous:
            data['stocks'][code]=previous[:8]
            data['refreshStatus'][code]='retained-previous'
            print(code,name,len(previous[:8]),'retained previous cache')
        else:
            data['stocks'][code]=[]
            data['refreshStatus'][code]='empty'
            print(code,name,0,'empty')
        time.sleep(0.25)
    Path('data').mkdir(exist_ok=True)
    for code in ('3711','3293'):
        if len(data['stocks'].get(code,[]))<1:
            raise SystemExit(f'{code} final trusted news cache empty; preserving existing file')
    Path('data/news.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':
    main()
