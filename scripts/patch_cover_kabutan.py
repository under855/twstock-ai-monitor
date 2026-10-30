#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'foreign-live-test.js'
s=p.read_text(encoding='utf-8')
start=s.index('  async function cover(){')
end=s.index('  function safeRun',start)
new=r'''  async function cover(){
    const card=document.getElementById('coverValidation');if(card)card.dataset.realTime='false';
    const upstream='https://kabutan.jp/stock/?code=5253&_='+Date.now(),u='https://proxy.cors.dev/'+upstream,r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text();
    const pm=t.match(/<span class="kabuka">\s*([0-9][0-9,]*(?:\.[0-9]+)?)円<\/span>/i),price=pm?num(pm[1]):null;
    const block=t.match(/<h2[^>]*>[\s\S]*?5253[\s\S]*?カバー[\s\S]*?<\/h2>[\s\S]{0,1800}/i)?.[0]||t;
    const tm=block.match(/<time[^>]*datetime="[^"]*T(\d{2}:\d{2})\+09:00"[^>]*>\s*([^<]+)\s*<\/time>/i),ts=tm?(tm[2]||tm[1]).trim():'—';
    const cm=block.match(/class="si_i1_dl1"[\s\S]{0,800}?([+-][0-9][0-9,]*(?:\.[0-9]+)?)/i),chg=cm?num(cm[1]):null;
    if(price==null)throw Error('COVER delayed quote missing');
    const key=ts+'|'+price,s=states.COVER;if(key!==s.lastTs){s.lastTs=key;s.accepted++;s.points.push({p:price,t:Date.now()});if(s.points.length>80)s.points.shift()}
    document.getElementById('coverPrice').textContent='¥'+price.toLocaleString('zh-TW');document.getElementById('coverSourceTime').textContent=ts+' JST';document.getElementById('coverCount').textContent=String(s.accepted);document.getElementById('coverChange').textContent=chg==null?'—':(chg>=0?'+':'')+chg.toLocaleString('zh-TW');
    if(card){card.dataset.accepted=String(s.accepted);card.dataset.sourceTime=ts;card.dataset.price=String(price);card.dataset.realTime='false'}draw(document.getElementById('coverChart'),s.points)
  }
'''
s=s[:start]+new+s[end:]
s=s.replace('JPX 官方說明：免費個股行情至少延遲 15 分鐘；本卡以 Google Finance 作公開價格交叉顯示，僅驗證日股資料流與延遲標示，不作即時行情依據。台股與評分不使用本來源。','JPX 官方說明：免費個股行情至少延遲 15 分鐘；本卡以日本株探（Kabutan）公開延遲行情作交叉顯示，僅驗證 COVER 資料流與延遲標示，不作即時行情依據。台股與評分不使用本來源。')
s=s.replace('const s=states.NVDA;if(ts!==s.lastTs){s.lastTs=ts;s.accepted++;s.points.push({p:price,t:Date.now()});if(s.points.length>80)s.points.shift()}','const s=states.NVDA,key=ts+"|"+price;if(key!==s.lastTs){s.lastTs=key;s.accepted++;s.points.push({p:price,t:Date.now()});if(s.points.length>80)s.points.shift()}')
p.write_text(s,encoding='utf-8')
print('COVER source switched to Kabutan delayed HTML; NVDA accepts official price changes')
