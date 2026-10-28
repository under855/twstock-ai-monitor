#!/usr/bin/env python3
import pathlib,re

p=pathlib.Path('scripts/update_dividends.py')
s=p.read_text(encoding='utf-8')
if 'import urllib.error' not in s:
    s=s.replace('import urllib.parse\nimport urllib.request\n','import urllib.parse\nimport urllib.request\nimport urllib.error\n')
new=r'''def request_json(url, *, data=None, timeout=40, attempts=3):
    body=None;headers=dict(UA)
    if data is not None:
        body=urllib.parse.urlencode(data).encode();headers['Content-Type']='application/x-www-form-urlencoded'
    last=None
    current=url
    for i in range(attempts):
        try:
            req=urllib.request.Request(current,data=body,headers=headers,method='POST' if body is not None else 'GET')
            with urllib.request.urlopen(req,timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8-sig'))
        except urllib.error.HTTPError as e:
            if e.code in (301,302,303,307,308):
                loc=e.headers.get('Location') if e.headers else None
                if loc:
                    current=urllib.parse.urljoin(current,loc)
                    last=e
                    continue
            last=e
        except Exception as e:
            last=e
        if i+1<attempts:time.sleep(i+1)
    raise last


def n'''
pat=r'def request_json\(url, \*, data=None, timeout=40, attempts=3\):.*?\n\ndef n'
s2,n=re.subn(pat,new,s,count=1,flags=re.S)
if n!=1:raise SystemExit(f'request_json patch count={n}')
p.write_text(s2,encoding='utf-8')
print('PATCH_HTTP_REDIRECT_V070_OK')
