/* Gold & CPC fuel card: read-only verified snapshot, no live-stock engine hooks. */
(() => {
 'use strict';
 const el=id=>document.getElementById(id),fmt=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:2,minimumFractionDigits:0}):'—';
 const day=s=>{const d=new Date(String(s||''));return Number.isNaN(d.getTime())?null:d};
 const todayTW=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const isValidGold=g=>g&&Number.isFinite(g.bankBuy)&&Number.isFinite(g.bankSell)&&g.bankBuy>1000&&g.bankBuy<g.bankSell&&g.unit==='TWD/g'&&g.source==='BOT gold passbook'&&day(g.quoteAt);
 const isValidOil=o=>o&&o.source==='CPC official open data'&&o.unit==='TWD/L'&&/^\d{4}-\d{2}-\d{2}$/.test(o.effectiveFrom||'')&&["92","95","98","diesel"].every(k=>Number.isFinite(o.prices?.[k])&&o.prices[k]>5&&o.prices[k]<80);
 function fuelStatus(o,now){
   if(!isValidOil(o))return '官方油價資料未確認';
   const start=day(o.effectiveFrom+'T00:00:00+08:00');
   const tw=new Date(now);
   const dow=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',weekday:'short'}).format(tw)==='Mon');
   const ahead=start>tw;
   if(ahead)return '下週已公告｜'+o.effectiveFrom+' 起生效';
   const age=Math.floor((tw-start)/86400000);
   if(age>14)return '最近一次已核實油價（資料過期，請核對中油）｜'+o.effectiveFrom+' 生效';
   return age>=7?'上週油價（尚未取得本週新公告）':'已公告油價｜'+o.effectiveFrom+' 起生效';
 }
 function changeLabel(v,label){return label+' '+(v>0?'漲':v<0?'跌':'持平')+' '+Math.abs(v).toFixed(1)+' 元／公升';}
 function oilChangeSummary(o){
   const c=o?.change;
   if(!c||!['92','95','98','diesel'].every(k=>Number.isFinite(c[k])))return {gas:'汽油｜尚無可核實的前週差額',diesel:'柴油｜尚無可核實的前週差額',gasState:'pending',dieselState:'pending'};
   const labels=['92','95','98'];
   const uniform=labels.every(k=>Math.abs(c[k]-c['92'])<0.001);
   const gas=uniform?changeLabel(c['92'],'汽油'):labels.map(k=>changeLabel(c[k],k)).join('｜');
   return {gas,diesel:changeLabel(c.diesel,'柴油'),gasState:uniform?(c['92']>0?'rise':c['92']<0?'fall':'flat'):'flat',dieselState:c.diesel>0?'rise':c.diesel<0?'fall':'flat'};
 }
 function renderOilDelta(o){
   const gas=el('oilGasDelta'),diesel=el('oilDieselDelta');
   if(!gas||!diesel)return;
   const values=isValidOil(o)?oilChangeSummary(o):{gas:'等待官方汽油資料',diesel:'等待官方柴油資料',gasState:'pending',dieselState:'pending'};
   if(gas.textContent!==values.gas)gas.textContent=values.gas;
   if(diesel.textContent!==values.diesel)diesel.textContent=values.diesel;
   gas.className='oilWeeklyDelta '+values.gasState;
   diesel.className='oilWeeklyDelta '+values.dieselState;
 }
 function display(data,now=new Date()){
   const gold=data?.gold,oil=data?.oil;
   const goldEl=el('goldPriceBody'),oilEl=el('oilPriceBody'),goldMeta=el('goldPriceTime'),oilMeta=el('oilPriceTime');
   if(!goldEl||!oilEl)return;
   if(isValidGold(gold)){
     const stamp=day(gold.quoteAt),age=(now-stamp)/60000;
     goldEl.textContent='臺銀買進 '+fmt(gold.bankBuy)+'／賣出 '+fmt(gold.bankSell)+' 元／公克';
     goldMeta.textContent='臺銀黃金存摺｜牌價 '+gold.quoteAt.replace('T',' ').slice(0,16)+(age>60?'｜歷史牌價，非即時':'｜依銀行實際牌價時間');
   }else{goldEl.textContent='—';goldMeta.textContent='尚無驗證通過的臺銀黃金牌價'}
   if(isValidOil(oil)){
     oilEl.textContent='92 '+fmt(oil.prices["92"])+'｜95 '+fmt(oil.prices["95"])+'｜98 '+fmt(oil.prices["98"])+'｜柴油 '+fmt(oil.prices.diesel)+' 元／公升';
     oilMeta.textContent=fuelStatus(oil,now)+(oil.comparisonDate?'｜比較週 '+oil.comparisonDate:'｜前週比較尚未取得');
     renderOilDelta(oil);
   }else{oilEl.textContent='—';oilMeta.textContent='尚未取得中油正式公告，請以中油網站為準';renderOilDelta(null)}
 }
 async function refresh(){
   if(document.visibilityState==='hidden')return;
   try{
     const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),7000);
     let res;
     try{res=await fetch('./data/gold-oil.json?t='+Math.floor(Date.now()/300000),{signal:ac.signal,cache:'no-store'})}finally{clearTimeout(timer)}
     if(!res.ok)throw Error('snapshot unavailable');
     const data=await res.json();display(data);
   }catch{
     // Never transform missing official data into fake prices or affect stock/FX modules.
     if(!el('goldPriceBody')?.textContent?.trim())el('goldPriceBody').textContent='—';
     if(!el('oilPriceBody')?.textContent?.trim())el('oilPriceBody').textContent='—';
   }
 }
 window.__GOLD_OIL_BOARD_TEST__={isValidGold,isValidOil,fuelStatus,oilChangeSummary,display};
 function init(){if(!el('goldOilBoard'))return;void refresh();setInterval(refresh,300000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();