/* Official post-close TWSE institutional-flow display. Never label as live. */
(() => {
  'use strict';
  const PATH='./data/foreign-flow.json';
  const MAX_AGE_DAYS=14;
  let busy=false,lastRead=0;
  const elem=id=>document.getElementById(id);
  const fmt=v=>(v/1e8).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2});
  const taiwanDay=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
  const set=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};
  function parsed(payload){
    if(!payload||payload.market!=='TWSE'||payload.source!=='TWSE BFI82U'||payload.unit!=='TWD')return null;
    if(payload.category!=='外資及陸資（不含外資自營商）')return null;
    const date=String(payload.date||''),now=taiwanDay();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>now)return null;
    const age=(Date.parse(now+'T00:00:00+08:00')-Date.parse(date+'T00:00:00+08:00'))/86400000;
    if(!Number.isFinite(age)||age<0||age>MAX_AGE_DAYS)return null;
    const {buyTWD:buy,sellTWD:sell,netTWD:net}=payload;
    if(![buy,sell,net].every(Number.isSafeInteger)||buy<0||sell<0||net!==buy-sell)return null;
    return {date,buy,sell,net,age};
  }
  function render(q){
    const el=elem('foreignNet'),date=elem('foreignFlowDate');
    if(!el||!date)return;
    if(!q){
      set(el,'—');el.className='foreignNet neutral';
      set(elem('foreignBuy'),'買進 —');set(elem('foreignSell'),'賣出 —');
      set(date,'尚無通過日期驗證的官方盤後資料；不顯示推估值');
      return;
    }
    const label=q.net>0?'買超':q.net<0?'賣超':'買賣平衡';
    set(el,label+' '+fmt(Math.abs(q.net))+' 億元');
    el.className='foreignNet '+(q.net>0?'positive':q.net<0?'negative':'neutral');
    set(elem('foreignBuy'),'買進 '+fmt(q.buy)+' 億');
    set(elem('foreignSell'),'賣出 '+fmt(q.sell)+' 億');
    set(date,'證交所上市市場｜統計日 '+q.date.replaceAll('-','/')+(q.age>0?'（非今日）':'')+'｜盤後公布，非即時');
  }
  async function refresh(){
    if(busy||document.visibilityState==='hidden')return;
    busy=true;lastRead=Date.now();
    try{
      const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),7000);
      try{
        const result=await fetch(PATH+'?read='+Date.now(),{cache:'no-store',signal:ac.signal});
        if(!result.ok)throw new Error('HTTP '+result.status);
        render(parsed(await result.json()));
      }finally{clearTimeout(timeout)}
    }catch{render(null)}finally{busy=false}
  }
  function resume(){if(Date.now()-lastRead>15000)refresh()}
  const start=()=>{refresh();setInterval(refresh,10*60*1000);addEventListener('pageshow',resume);addEventListener('focus',resume);document.addEventListener('visibilitychange',resume)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
