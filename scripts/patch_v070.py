#!/usr/bin/env python3
import pathlib,re

# ---- dividend UI: same-origin first, server-computed fill status ----
p=pathlib.Path('dividend-enhance.js');s=p.read_text(encoding='utf-8')

new_event_label="""function eventLabel(e){
    if(e?.eventType==='distribution') return '股利分派';
    const k=String(e?.kind||e?.eventText||'');
    if(k.includes('權')&&k.includes('息'))return '除權息';
    if(k.includes('權'))return '除權';
    if(k.includes('息'))return '除息';
    const hasCash=(e.cashDividend??0)>0,hasStock=(e.stockDividendRatio??0)>0||(e.stockSharesPer1000??0)>0;
    if(hasCash&&hasStock)return '除權息';if(hasStock)return '除權';return '除息';
  }"""
s,n=re.subn(r"function eventLabel\(e\)\{.*?\n  \}",new_event_label,s,count=1,flags=re.S)
if n!=1:raise SystemExit('eventLabel patch failed')

anchor="""eventCache.loading=(async()=>{
      const [twsePre,tpexPre,tpexDaily,twseDist]=await Promise.allSettled(["""
replacement="""eventCache.loading=(async()=>{
      // v070: 正式資料優先讀本站由 GitHub 端預先整理的官方資料，避免手機跨網域失敗。
      try{
        const r=await fetch(`./data/dividends.json?ts=${Date.now()}`,{cache:'no-store'});
        if(r.ok){
          const j=await r.json(),rows=Array.isArray(j?.items)?j.items:[];
          if(rows.length){eventCache.rows=rows;eventCache.loaded=true;return rows;}
        }
      }catch{}
      const [twsePre,tpexPre,tpexDaily,twseDist]=await Promise.allSettled(["""
if anchor in s:s=s.replace(anchor,replacement,1)
elif 'v070: 正式資料優先讀本站' not in s:raise SystemExit('corporate local-data anchor missing')
s=s.replace("['SecuritiesCompanyCode','Code','股票代號']","['SecuritiesCompanyCode','Code','股票代號','代號']")

new_fill="""function fillStatus(event,h){
    const target=num(event?.fillTarget??event?.preClose);
    const kind=event?.fillKind||(eventLabel(event)==='除權'?'填權':eventLabel(event)==='除權息'?'填權息':'填息');
    if(event?.fillState==='filled'&&num(event.fillTradingDays)!=null){
      const days=Math.round(num(event.fillTradingDays));
      return {text:`${days} 個交易日完成${kind}${event.fillDate?`（${event.fillDate}）`:''}`,days,target};
    }
    if(event?.fillState==='unfilled'){
      const observed=num(event.fillTradingDays)!=null?Math.round(num(event.fillTradingDays)):null;
      const suffix=[event.checkedThrough?`截至 ${event.checkedThrough}`:'',observed!=null?`已觀察 ${observed} 個交易日`:''].filter(Boolean).join('，');
      return {text:`尚未${kind}${suffix?`（${suffix}）`:''}`,days:null,target};
    }
    if(!event?.exDate||!Array.isArray(h)||h.length<2)return {text:'資料不足',days:null,target};
    const ex=dateMs(event.exDate);if(!Number.isFinite(ex))return {text:'資料不足',days:null,target};
    const rows=h.map(x=>({...x,ms:dateMs(x.date)})).filter(x=>Number.isFinite(x.ms)).sort((a,b)=>a.ms-b.ms);
    const prev=[...rows].reverse().find(x=>x.ms<ex&&num(x.close)!=null);if(!prev)return {text:'資料不足',days:null,target};
    const after=rows.filter(x=>x.ms>=ex);if(!after.length)return {text:'尚無除權息後交易資料',days:null,target:prev.close};
    const hit=after.findIndex(x=>(num(x.high)??num(x.close))>=prev.close);
    return hit>=0?{text:`${hit+1} 個交易日完成${kind}`,days:hit+1,target:prev.close}:{text:`尚未${kind}`,days:null,target:prev.close};
  }"""
s,n=re.subn(r"function fillStatus\(event,h\)\{.*?\n  \}",new_fill,s,count=1,flags=re.S)
if n!=1:raise SystemExit('fillStatus patch failed')

new_dedupe="""function dedupeEvents(rows){
    const m=new Map();
    for(const e of rows){
      const key=e.eventType==='distribution'?`${e.code}|dist|${e.dividendYear}|${e.decisionDate||''}`:`${e.code}|${e.exDate}`;
      const old=m.get(key);
      if(!old){m.set(key,e);continue;}
      m.set(key,{...old,...e,
        cashDividend:e.cashDividend??old.cashDividend,
        stockDividendRatio:e.stockDividendRatio??old.stockDividendRatio,
        stockSharesPer1000:e.stockSharesPer1000??old.stockSharesPer1000,
        paymentDate:e.paymentDate??old.paymentDate,recordDate:e.recordDate??old.recordDate,
        preClose:e.preClose??old.preClose,fillTarget:e.fillTarget??old.fillTarget,
        fillState:e.fillState??old.fillState,fillDate:e.fillDate??old.fillDate,
        fillTradingDays:e.fillTradingDays??old.fillTradingDays,fillKind:e.fillKind??old.fillKind,
        checkedThrough:e.checkedThrough??old.checkedThrough,kind:e.kind??old.kind
      });
    }
    return [...m.values()];
  }"""
s,n=re.subn(r"function dedupeEvents\(rows\)\{.*?\n  \}",new_dedupe,s,count=1,flags=re.S)
if n!=1:raise SystemExit('dedupeEvents patch failed')

old_stock="const stock=e.stockDividendRatio!=null&&e.stockDividendRatio!==0?`<div>股票股利／配股：${F(e.stockDividendRatio,4)} 元／股</div>`:'';"
new_stock="const stock=e.stockSharesPer1000!=null&&e.stockSharesPer1000!==0?`<div>股票股利／配股：每千股配 ${F(e.stockSharesPer1000,4)} 股</div>`:(e.stockDividendRatio!=null&&e.stockDividendRatio!==0?`<div>股票股利／配股：${F(e.stockDividendRatio,4)} 元／股</div>`:'');"
if old_stock in s:s=s.replace(old_stock,new_stock,1)
elif new_stock not in s:raise SystemExit('stock display anchor missing')

old_long="""if(!browserQa&&dated.some(e=>dateMs(e.exDate)<=now)){
      longHistory(code).then(h=>{if(Array.isArray(h)&&h.length)renderRows(h)}).catch(()=>{});
    }"""
new_long="""const needsFallbackHistory=dated.some(e=>dateMs(e.exDate)<=now&&!['filled','unfilled'].includes(e.fillState));
    if(!browserQa&&needsFallbackHistory){
      longHistory(code).then(h=>{if(Array.isArray(h)&&h.length)renderRows(h)}).catch(()=>{});
    }"""
if old_long in s:s=s.replace(old_long,new_long,1)
elif 'needsFallbackHistory' not in s:raise SystemExit('long history condition anchor missing')
p.write_text(s,encoding='utf-8')

# ---- index version only; preserve current proven market/search/update logic ----
p=pathlib.Path('index.html');s=p.read_text(encoding='utf-8')
s=re.sub(r'<title>台股 AI 監控台 v[^<]+ Web</title>','<title>台股 AI 監控台 v0.7.0 Web</title>',s)
s=re.sub(r"const APP_VERSION='[^']+';","const APP_VERSION='0.7.0';",s)
s=s.replace('dividend-enhance.js?v=069','dividend-enhance.js?v=070')
s=s.replace('近期新聞</h3>','近期新聞（最近 1 個月）</h3>')
s=s.replace('最近 1 個月除權息／股利事件','配股／配息與填權息')
p.write_text(s,encoding='utf-8')

# ---- service worker version/cache ----
p=pathlib.Path('sw.js');s=p.read_text(encoding='utf-8')
s=re.sub(r"const CACHE='tw-ai-monitor-v\d+';","const CACHE='tw-ai-monitor-v070';",s)
s=s.replace('dividend-enhance.js?v=069','dividend-enhance.js?v=070')
p.write_text(s,encoding='utf-8')

# ---- latest market updater must no longer overwrite the richer dividend file every 5 minutes ----
p=pathlib.Path('scripts/update_latest.py');s=p.read_text(encoding='utf-8')
s=s.replace("    dividends=fetch_etf_dividends(trade_date)\n",'')
s=s.replace("    div_payload={'generatedAt':now,'throughDate':trade_date,'count':len(dividends),'items':dividends}\n",'')
s=s.replace("    write_json(DIV_OUT,div_payload)\n",'')
s=s.replace(",'dividends':len(dividends),'0050':sum(1 for x in dividends if x['code']=='0050')",'')
p.write_text(s,encoding='utf-8')

p=pathlib.Path('.github/workflows/update-latest.yml');s=p.read_text(encoding='utf-8')
s=s.replace('git add data/latest.json data/dividends.json','git add data/latest.json')
p.write_text(s,encoding='utf-8')

# ---- daily dividend/fill refresh, separate from the 5-minute market updater ----
workflow=pathlib.Path('.github/workflows/update-dividends.yml')
workflow.write_text('''name: Update official dividend and fill data\n\non:\n  workflow_dispatch:\n  schedule:\n    - cron: '45 10 * * 1-5'\n\npermissions:\n  contents: write\n\njobs:\n  update:\n    runs-on: ubuntu-latest\n    timeout-minutes: 25\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - name: Build official dividend and fill dataset\n        run: python scripts/update_dividends.py\n      - name: Validate before commit\n        run: |\n          python - <<'PY'\n          import json\n          d=json.load(open('data/dividends.json',encoding='utf-8'))\n          past=[x for x in d['items'] if x.get('exDate') and x['exDate']<=d['throughDate']]\n          unknown=[x for x in past if x.get('fillState')=='unknown']\n          assert past and len(unknown)/len(past)<=0.08,(len(unknown),len(past))\n          PY\n      - name: Commit dividend data if changed\n        run: |\n          git config user.name "github-actions[bot]"\n          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"\n          git add data/dividends.json\n          if git diff --cached --quiet; then\n            echo "No dividend data change"\n          else\n            git commit -m "Update official dividend and fill data"\n            git push\n          fi\n''',encoding='utf-8')

print('PATCH_V070_OK')
