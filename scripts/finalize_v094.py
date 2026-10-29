from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
idxp=ROOT/'index.html'
idx=idxp.read_text(encoding='utf-8')

replacements={
    '<title>台股 AI 監控台 v0.9.3 Web</title>':'<title>台股 AI 監控台 v0.9.4 Web</title>',
    '<small>v0.9.3｜盤中即時行情・即時線圖｜15 秒更新</small>':'<small>v0.9.4｜盤中即時行情・即時線圖｜15 秒更新</small>',
    "const APP_VERSION='0.9.3';":"const APP_VERSION='0.9.4';",
    '<script src="./extras-v090.js?v=090"></script>':'<script src="./extras-v090.js?v=094"></script>',
    '<script src="./live-v091.js?v=093"></script>':'<script src="./live-v091.js?v=094"></script>',
}
for old,new in replacements.items():
    if old in idx:
        idx=idx.replace(old,new,1)
    elif new not in idx:
        raise SystemExit(f'missing expected marker: {old}')

new_score="""function scoreStock(row,val,h,quote){
 const code=String(row?.Code||''),close=N(quote?.price)??N(row?.ClosingPrice),pe=N(val?.PEratio)??N(SNAPSHOT?.[code]?.pe),y=N(val?.DividendYield),ch=N(quote?.change)??N(row?.Change);
 const hist=Array.isArray(h)?h.filter(x=>N(x?.close)!=null):[];
 const clamp=v=>Math.max(0,Math.min(100,v));
 const retPct=(now,base)=>now!=null&&base?((now/base)-1)*100:null;
 const parts=[],reasons=[];let trend=null,momentum=null,valuation=null,income=null;
 if(close!=null&&hist.length>=20){const base20=N(hist.at(-21)?.close??hist[0]?.close),r20=retPct(close,base20);if(r20!=null){trend=Math.round(clamp(50+r20*3.2));parts.push(['trend',trend,.36]);reasons.push(`20日價格變化 ${r20>=0?'+':''}${r20.toFixed(1)}%`)}}
 if(close!=null&&hist.length>=5){const base5=N(hist.at(-6)?.close??hist[0]?.close),r5=retPct(close,base5),prev=ch!=null?close-ch:null,dayPct=prev?ch/prev*100:null;if(r5!=null){momentum=Math.round(clamp(50+r5*5.0+(dayPct==null?0:dayPct*2.0)));parts.push(['momentum',momentum,.34]);reasons.push(`5日動能 ${r5>=0?'+':''}${r5.toFixed(1)}%${dayPct==null?'':`、當日 ${dayPct>=0?'+':''}${dayPct.toFixed(1)}%`}`)}}
 else if(close!=null&&ch!=null){const prev=close-ch,dayPct=prev?ch/prev*100:null;if(dayPct!=null){momentum=Math.round(clamp(50+dayPct*5.0));parts.push(['momentum',momentum,.20]);reasons.push(`僅有當日漲跌 ${dayPct>=0?'+':''}${dayPct.toFixed(1)}%，動能權重已降低`)}}
 if(pe!=null&&pe>0){valuation=pe<10?84:pe<15?74:pe<20?64:pe<25?55:pe<35?43:32;parts.push(['valuation',valuation,.18]);reasons.push(`本益比 ${pe.toFixed(1)} 倍`)}
 if(y!=null&&y>=0){income=y>=6?86:y>=4?76:y>=3?68:y>=2?60:y>=1?52:y>0?46:40;parts.push(['income',income,.12]);reasons.push(`殖利率 ${y.toFixed(2)}%`)}
 const coverage=parts.reduce((a,x)=>a+x[2],0),usable=coverage>=.45,total=usable?Math.round(parts.reduce((a,x)=>a+x[1]*x[2],0)/coverage):null;
 const live=/盤中|MIS|即時/.test(String(quote?.source||'')),confidence=coverage>=.82&&hist.length>=20?'高':coverage>=.60?'中':'低';
 return{total,delta:null,trend,momentum,valuation,income,mode:live?'盤中評分':'基準評分',available:parts.length,confidence,coverage:Math.round(coverage*100),reasons}
}"""
idx,n=re.subn(r'function scoreStock\(row,val,h,quote\)\{.*?\n\}\nfunction cls\(v\)',new_score+'\nfunction cls(v)',idx,count=1,flags=re.S)
if n!=1:
    raise SystemExit('scoreStock consolidation failed')

new_analysis="""function buildAnalysis(code,row,val,h,q,s){
 if(s.total==null){return `<b class=\"flat\">資料不足，暫不評分。</b><br>目前可用資料覆蓋率約 ${s.coverage??0}%。至少需要 45% 的評分權重才會產生總分。<br><span class=\"muted\">缺少的項目不以中性分數補值，避免單一資料造成看似精確的總分。</span>`}
 const tone=s.total>=65?'整體偏強':s.total<=42?'整體偏弱':'整體中性',items=(s.reasons||[]).map(x=>`<li>${String(x).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))}</li>`).join('');
 return `<b class=\"${scoreCls(s.total)}\">${tone}，目前 ${s.total}/100。</b><br>資料覆蓋率 ${s.coverage}%｜可信度 ${s.confidence}。<ul style=\"margin:8px 0 8px 18px;padding:0\">${items}</ul><span class=\"muted\">權重：趨勢 36%、短期動能 34%、估值 18%、殖利率 12%；缺少的項目不會用 50 分補值。分數代表目前資料下的相對強弱，不代表明日上漲機率。</span>`
}"""
idx,n=re.subn(r'function buildAnalysis\(code,row,val,h,q,s\)\{.*?\nasync function news\(',new_analysis+'\nasync function news(',idx,count=1,flags=re.S)
if n!=1:
    raise SystemExit('buildAnalysis consolidation failed')

idx=idx.replace("${s.delta==null?'':`｜下一交易日推動值：${s.delta>0?'+':''}${s.delta}`}","｜資料覆蓋率 ${s.coverage??0}%")
idxp.write_text(idx,encoding='utf-8')

extp=ROOT/'extras-v090.js'
ext=extp.read_text(encoding='utf-8')
ext,n=re.subn(r'\n  function clamp\(v\)\{.*?\n  function limitDividendCards\(\)', '\n  function limitDividendCards()', ext, count=1, flags=re.S)
if n==1:
    ext=ext.replace("\n    if(!installScoring())setTimeout(installScoring,0);",'')
elif 'installScoring' in ext or 'scoreStock=function' in ext:
    raise SystemExit('extras scoring override removal failed')
extp.write_text(ext,encoding='utf-8')

livep=ROOT/'live-v091.js'
live=livep.read_text(encoding='utf-8')
if "const VERSION='0.9.3';" in live:
    live=live.replace("const VERSION='0.9.3';","const VERSION='0.9.4';",1)
elif "const VERSION='0.9.4';" not in live:
    raise SystemExit('live version marker missing')
livep.write_text(live,encoding='utf-8')

swp=ROOT/'sw.js'
sw=swp.read_text(encoding='utf-8')
sw=re.sub(r"const CACHE='tw-ai-monitor-v\d+';","const CACHE='tw-ai-monitor-v094';",sw,count=1)
swp.write_text(sw,encoding='utf-8')

(ROOT/'404.html').write_text(idx,encoding='utf-8')

checks={
    'title v094':'v0.9.4 Web' in idx,
    'app constant v094':"const APP_VERSION='0.9.4';" in idx,
    'header v094':'<small>v0.9.4｜' in idx,
    'extras cache v094':'extras-v090.js?v=094' in idx,
    'live cache v094':'live-v091.js?v=094' in idx,
    'single score definition':idx.count('function scoreStock(')==1,
    'coverage gate':'coverage>=.45' in idx,
    'no tomorrow push text':'下一交易日推動值' not in idx,
    'no scoring override':'installScoring' not in ext and 'scoreStock=function' not in ext,
    'live module v094':"const VERSION='0.9.4';" in live,
    'sw cache v094':"const CACHE='tw-ai-monitor-v094';" in sw,
    '404 exact mirror':(ROOT/'404.html').read_text(encoding='utf-8')==idx,
}
bad=[k for k,v in checks.items() if not v]
print(checks)
if bad:
    raise SystemExit('FAILED: '+', '.join(bad))

blocks=re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',idx,flags=re.S)
inline='\n'.join(b for b in blocks if b.strip())
tmp=Path('/tmp/index-inline.js')
tmp.write_text(inline,encoding='utf-8')
for path in [tmp,extp,livep,ROOT/'dividend-enhance.js',swp]:
    subprocess.run(['node','--check',str(path)],check=True)
