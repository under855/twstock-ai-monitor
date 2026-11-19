/* Independent holding horizon trial; never writes prices or schedules a market request. */
(() => {
 'use strict';
 const n=v=>{if(v==null||v===''||v==='-')return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null};
 const dayDiff=(a,b)=>(Date.parse(b+'T00:00:00+08:00')-Date.parse(a+'T00:00:00+08:00'))/86400000;
 function analyze(history,period,isETF){
   const year=period==='year',daysNeeded=year?300:60,pointsNeeded=year?180:38;
   const rows=Array.isArray(history)?history.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x?.date||''))&&n(x?.close)>0).map(x=>({date:x.date,close:n(x.close)})).sort((a,b)=>a.date.localeCompare(b.date)):[];
   const data=[...new Map(rows.map(x=>[x.date,x])).values()],first=data[0],last=data.at(-1);
   const span=first&&last?dayDiff(first.date,last.date):0,complete=data.length>=pointsNeeded&&span>=daysNeeded;
   const needed=isETF?'ETF 的含息總報酬、費用率、追蹤品質':'公司的財報、現金流、負債與營收';
   if(!complete)return {complete:false,count:data.length,span,returnPct:null,drawdownPct:null,date:last?.date||null,reason:'至少需要 '+pointsNeeded+' 個交易日且涵蓋 '+daysNeeded+' 天的歷史價格，另需'+needed};
   let peak=first.close,drawdown=0;
   for(const item of data){peak=Math.max(peak,item.close);drawdown=Math.min(drawdown,(item.close/peak-1)*100)}
   return {complete:true,count:data.length,span,returnPct:(last.close/first.close-1)*100,drawdownPct:drawdown,date:last.date,reason:'缺少已驗證的'+needed+'，暫不計算長期綜合評分'};
 }
 function init(){
   const card=document.getElementById('holdPilot'),out=document.getElementById('holdPilotBody');if(!card||!out)return;
   const buttons=[...card.querySelectorAll('button[data-horizon]')];let period='quarter';
   const render=()=>{
     const code=typeof active==='undefined'?'':String(active||'');
     const hist=typeof historyCache==='undefined'?[]:historyCache?.[code]||[];
     const isETF=/^00/.test(code);
     const r=analyze(hist,period,isETF);
     buttons.forEach(b=>{const on=b.dataset.horizon===period;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
     if(!code){out.textContent='請先選擇股票或 ETF';return}
     const heading=(period==='year'?'一年':'一季')+'觀察｜'+code+'｜';
     if(!r.complete){out.textContent=heading+'資料不足，不予評分。'+r.reason+'；目前只有 '+r.count+' 筆交易日資料';return}
     out.textContent=heading+'價格觀察截至 '+r.date+'｜期間價格變動 '+r.returnPct.toFixed(2)+'%｜歷史最大回落 '+r.drawdownPct.toFixed(2)+'%｜'+r.reason;
   };
   card.addEventListener('click',e=>{const button=e.target.closest('button[data-horizon]');if(button&&card.contains(button)){period=button.dataset.horizon;render()}});
   const title=document.getElementById('dTitle');if(title)new MutationObserver(()=>{out.textContent='請點選一季或一年，檢查持有評分所需資料'}).observe(title,{childList:true,characterData:true,subtree:true});
   render();
 }
 window.__TW_HOLD_SCORE_TRIAL__={analyze};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();