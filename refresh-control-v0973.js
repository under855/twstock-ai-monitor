(() => {
'use strict';
const INTERVAL=4000;
const NEWS_INTERVAL=5*60*1000;
const DIVIDEND_INTERVAL=6*60*60*1000;
const checkedAt=new Map();
function due(key,period){const now=Date.now();if(now-(checkedAt.get(key)||0)<period)return false;checkedAt.set(key,now);return true}
const stats=new Map();
let recovering=false;
let newsBusy=false;

function statusElement(){
  const bar=document.querySelector('.toolbar');if(!bar)return null;
  let el=document.getElementById('dataSyncStatus');
  if(!el){el=document.createElement('span');el.className='pill';el.id='dataSyncStatus';el.textContent='依資料來源週期檢查';bar.appendChild(el)}
  return el;
}
function updateDisplay(){
  const el=statusElement();if(!el)return;
  const failures=[...stats].filter(([,v])=>v.failures>0);
  const text=failures.length?'更新失敗：'+failures.map(([name,v])=>name+' '+v.failures+'/3').join('、')+'｜依來源週期重試':'依來源週期檢查｜正常';
  if(el.textContent!==text)el.textContent=text;
  el.title='資料未改變時保留原畫面；各來源只依官方發布時間判斷時效。';
}
async function recover(name){
  if(recovering)return;
  recovering=true;
  const el=statusElement();if(el)el.textContent=name+' 連續失敗 3 次｜自動重新取得資料';
  try{
    // Soft recovery preserves the DOM and avoids a visible full-page reload.
    // Defer until the failed request releases its single-flight lock.
    setTimeout(()=>{
      if(name==='臺銀匯率')window.__TW_FX_REFRESH__?.();
      else if(name==='台股行情')window.__TW_LIVE_REFRESH__?.();
      else if(name==='盤後行情')window.__TW_BACKUP_REFRESH__?.();
      else if(name==='新聞')window.__TW_NEWS_REFRESH__?.();
      else if(name==='即時驗證 BTC-USD')window.__TW_CRYPTO_REFRESH__?.();
      else if(name==='配股配息')window.__TW_DIVIDEND_REFRESH__?.();
    },250);
    if('serviceWorker'in navigator)navigator.serviceWorker.getRegistration().then(r=>r?.update()).catch(()=>{});
  }catch{}finally{recovering=false}
}
window.__TW_UPDATE_HEALTH__=(name,ok)=>{
  const old=stats.get(name)||{failures:0,lastSuccess:0,lastFailure:0};
  if(ok){old.failures=0;old.lastSuccess=Date.now()}
  else{old.failures++;old.lastFailure=Date.now()}
  stats.set(name,old);
  updateDisplay();
  if(!ok&&old.failures===3){recover(name)}
  if(!ok&&old.failures>3){old.failures=1}
};
window.__TW_DATA_REFRESH_STATUS__=()=>Object.fromEntries([...stats].map(([k,v])=>[k,{...v}]));
function visibleDetail(){return document.getElementById('sheet')?.classList.contains('show')&&typeof active!=='undefined'&&!!active}
async function refreshNews(){
  if(newsBusy||document.visibilityState==='hidden'||!visibleDetail()||typeof news!=='function')return;
  const code=String(active),name=typeof stockName==='function'?stockName(code,typeof rowForCode==='function'?rowForCode(code):{}):code;
  const box=document.getElementById('news'),state=document.getElementById('newsState');
  if(!box||!state)return;
  newsBusy=true;const previous=box.innerHTML;
  try{
    await news(code,name);
    if(String(active)!==code)return;
    window.__TW_UPDATE_HEALTH__?.('新聞',box.querySelector('.event')!==null);
  }catch{
    if(String(active)===code){box.innerHTML=previous;state.textContent='更新失敗｜保留最後已取得新聞';}
    window.__TW_UPDATE_HEALTH__?.('新聞',false);
  }finally{newsBusy=false}
}
window.__TW_NEWS_REFRESH__=()=>{if(!newsBusy)refreshNews()};
function checkVisible(){
  if(document.visibilityState==='hidden')return;
  statusElement();
  if(visibleDetail()){
    const symbol=String(active);
    if(due('news:'+symbol,NEWS_INTERVAL))refreshNews();
    if(due('dividend:'+symbol,DIVIDEND_INTERVAL)&&typeof window.__TW_DIVIDEND_REFRESH__==='function')window.__TW_DIVIDEND_REFRESH__();
  }
  // Four-second heartbeat only; data network fetches respect per-source intervals.
  updateDisplay();
}
setInterval(checkVisible,INTERVAL);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkVisible,{once:true});else checkVisible();
})();