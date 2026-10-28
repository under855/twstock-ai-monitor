#!/usr/bin/env python3
import pathlib,re

# Patch dividend renderer.
p=pathlib.Path('dividend-enhance.js')
s=p.read_text(encoding='utf-8')
new_load='''async function loadEtfRows(){
    if(etfCache.loaded&&etfCache.rows.length)return etfCache.rows;
    if(etfCache.loading)return etfCache.loading;
    etfCache.loading=(async()=>{
      try{
        const r=await fetch(`./data/dividends.json?ts=${Date.now()}`,{cache:'no-store'});
        if(r.ok){
          const j=await r.json(),rows=Array.isArray(j?.items)?j.items:[];
          if(rows.length){etfCache.rows=rows;etfCache.loaded=true;return rows;}
        }
      }catch{}
      try{
        const end=new Date(),start=new Date(end);start.setFullYear(start.getFullYear()-1);
        const ymd=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        const url=`https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=&startDate=${ymd(start)}&endDate=${ymd(end)}&response=json`;
        const j=await jsonPublic(url,9000),rows=Array.isArray(j?.data)?j.data:[];
        const parsed=rows.filter(r=>Array.isArray(r)&&r.length>=6).map(r=>({
          code:String(r[0]||'').trim(),name:String(r[1]||'').trim(),type:'ETF',market:'TWSE',
          exDate:isoDate(r[2]),recordDate:isoDate(r[3]),paymentDate:isoDate(r[4]),cashDividend:num(r[5]),stockDividendRatio:null,source:'TWSE ETF 收益分配',eventType:'ex-dividend'
        })).filter(x=>x.code&&x.exDate);
        if(parsed.length){etfCache.rows=parsed;etfCache.loaded=true;}
      }catch{}
      return etfCache.rows;
    })().finally(()=>{etfCache.loading=null});
    return etfCache.loading;
  }

  async function loadCorporateEvents(){'''
s,n=re.subn(r'async function loadEtfRows\(\)\{.*?\n  async function loadCorporateEvents\(\)\{',lambda m:new_load,s,flags=re.S)
if n!=1: raise SystemExit(f'loadEtfRows patch count {n}')

new_render='''async function renderDividendDetail(code){
    code=String(code);if(active!==code)return;
    const box=$('dividendEvents');if(!box)return;
    const card=box.closest('.card'),title=card?.querySelector('h3');
    const etf=isEtfCode(code);
    if(title)title.textContent=etf?'近一年配股／配息（最近 3 次）':'配股／配息與填權息紀錄（最近 3 次）';
    box.innerHTML='<div class="muted small">載入官方配股配息資料…</div>';

    const etfs=await loadEtfRows();
    let corp=[];
    if(!etf)corp=await loadCorporateEvents();
    if(active!==code)return;
    let rows=[];
    if(etf)rows.push(...etfs.filter(x=>x.code===code));
    else rows.push(...corp.filter(x=>x.code===code));
    rows=dedupeEvents(rows);

    const now=Date.now(),yearAgo=now-366*86400000;
    let dated=rows.filter(e=>e.exDate&&dateMs(e.exDate)<=now+90*86400000);
    if(etf)dated=dated.filter(e=>dateMs(e.exDate)>=yearAgo&&dateMs(e.exDate)<=now);
    dated=dated.sort((a,b)=>dateMs(b.exDate)-dateMs(a.exDate)).slice(0,3);
    const distributions=etf?[]:rows.filter(e=>e.eventType==='distribution').sort((a,b)=>(dateMs(b.decisionDate)||0)-(dateMs(a.decisionDate)||0)).slice(0,Math.max(0,3-dated.length));

    const renderRows=h=>{
      if(active!==code)return;
      box.innerHTML='';
      for(const e of dated)box.insertAdjacentHTML('beforeend',eventHtml(e,dateMs(e.exDate)<=now?fillStatus(e,h||[]):null));
      for(const e of distributions)box.insertAdjacentHTML('beforeend',eventHtml(e,null));
      if(!box.innerHTML)box.innerHTML='<div class="muted small">目前官方資料中沒有可讀取的配股／配息紀錄。</div>';
    };

    const cached=historyCache[code]||[];
    renderRows(cached);
    if(dated.some(e=>dateMs(e.exDate)<=now)){
      longHistory(code).then(h=>{if(Array.isArray(h)&&h.length)renderRows(h)}).catch(()=>{});
    }
  }

  show=async function'''
s,n=re.subn(r'async function renderDividendDetail\(code\)\{.*?\n  show=async function',lambda m:new_render,s,flags=re.S)
if n!=1: raise SystemExit(f'renderDividendDetail patch count {n}')
p.write_text(s,encoding='utf-8')

# Patch index.
p=pathlib.Path('index.html');s=p.read_text(encoding='utf-8')
s=re.sub(r'<title>台股 AI 監控台 v[^<]+ Web</title>','<title>台股 AI 監控台 v0.6.9 Web</title>',s)
s=re.sub(r"const APP_VERSION='[^']+';","const APP_VERSION='0.6.9';",s)
s=s.replace('dividend-enhance.js?v=067','dividend-enhance.js?v=069')
if 'hotfix-v069.js?v=069' not in s:s=s.replace('</body>','<script src="./hotfix-v069.js?v=069"></script>\n</body>')
p.write_text(s,encoding='utf-8')

# Patch service worker.
p=pathlib.Path('sw.js');s=p.read_text(encoding='utf-8')
s=re.sub(r"const CACHE='tw-ai-monitor-v\d+';","const CACHE='tw-ai-monitor-v069';",s)
s=s.replace("'./hotfix-v067.js','./data/latest.json'","'./hotfix-v067.js','./hotfix-v069.js','./data/latest.json','./data/dividends.json'")
s=s.replace('dividend-enhance.js?v=067','dividend-enhance.js?v=069')
if 'hotfix-v069.js?v=069' not in s:
    needle="  if(!out.includes('hotfix-v067.js?v=067')) out=out.replace('</body>','<script src=\"./hotfix-v067.js?v=067\"></script></body>');"
    repl=needle+"\n  if(!out.includes('hotfix-v069.js?v=069')) out=out.replace('</body>','<script src=\"./hotfix-v069.js?v=069\"></script></body>');"
    if needle not in s:raise SystemExit('SW injection anchor missing')
    s=s.replace(needle,repl)
p.write_text(s,encoding='utf-8')
print('PATCH_V069_OK')
