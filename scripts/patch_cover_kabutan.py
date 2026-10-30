#!/usr/bin/env python3
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'foreign-live-test.js'
s=p.read_text(encoding='utf-8')
start=s.index('  async function cover(){')
end=s.index('  function safeRun',start)
new=r'''  async function cover(){
    const card=document.getElementById('coverValidation');if(card)card.dataset.realTime='false';
    const u='https://r.jina.ai/https://s.kabutan.jp/stocks/5253/?_='+Date.now(),r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text(),i=t.indexOf('# カバー'),body=i>=0?t.slice(i):t;
    const pm=body.match(/\n\s*([0-9][0-9,]*(?:\.[0-9]+)?)円\s*\n/),price=pm?num(pm[1]):null;
    const tm=body.match(/\((\d{2}:\d{2})\)/),ts=tm?tm[1]:'—';
    const cm=body.match(/\n\s*([+-][0-9][0-9,]*(?:\.[0-9]+)?)\s*円/),chg=cm?num(cm[1]):null;
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
print('COVER source switched to Kabutan delayed quote; NVDA accepts official price changes')
