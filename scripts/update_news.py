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
    '3711':['日月光投控','日月光'],
    '0050':['元大台灣50','0050'],
    '3293':['鈊象','3293'],
    '2002':['中鋼','2002'],
    '00878':['國泰永續高股息','00878'],
    '00919':['群益台灣精選高息','00919'],
    '2330':['台積電','台灣積體電路','2330'],
}
TRUSTED = ['鉅亨網','MoneyDJ','中央社','經濟日報','工商時報','自由財經','聯合新聞網','Yahoo奇摩股市']
UA = 'Mozilla/5.0 (compatible; twstock-ai-monitor/1.0)'

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

def query_one(code: str, name: str):
    aliases = ALIASES.get(code,[name,code])
    q = ' OR '.join(aliases) + ' 股票 when:30d'
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q':q,'hl':'zh-TW','gl':'TW','ceid':'TW:zh-Hant'})
    raw = fetch(url)
    root = ET.fromstring(raw)
    out=[]; seen=set(); cutoff=time.time()*1000-30*86400000
    for item in root.findall('.//item'):
        title=(item.findtext('title') or '').strip(); link=(item.findtext('link') or '').strip(); pub=''
        src=item.find('source')
        if src is not None and src.text: pub=src.text.strip()
        if not pub: title,pub=publisher_from_title(title)
        ts=parse_date(item.findtext('pubDate') or '')
        if not title or not link: continue
        if ts and ts < cutoff: continue
        if not any(t.lower() in pub.lower() for t in TRUSTED): continue
        key=re.sub(r'[\s　()（）\-—_·,，.。:：/／]','',title.lower())
        if key in seen: continue
        seen.add(key)
        out.append({'title':title,'link':link,'publisher':pub,'time':ts})
        if len(out)>=8: break
    return out

def main():
    data={'generatedAt':datetime.now(timezone.utc).isoformat(),'stocks':{}}
    for code,name in STOCKS.items():
        try:
            items=query_one(code,name)
            data['stocks'][code]=items
            print(code,name,len(items))
        except Exception as e:
            print(code,name,'ERROR',repr(e))
            data['stocks'][code]=[]
        time.sleep(0.4)
    Path('data').mkdir(exist_ok=True)
    Path('data/news.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    for code in ('3711','3293'):
        if len(data['stocks'].get(code,[]))<1:
            raise SystemExit(f'{code} trusted news cache empty')

if __name__=='__main__':
    main()
