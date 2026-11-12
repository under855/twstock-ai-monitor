(() => {
  'use strict';
  const REFRESH_MS=6*60*60*1000;
  const ROTATE_MS=6500;
  const RECENT_DAYS=120;
  const UPCOMING_DAYS=90;
  const DISABLE_KEY='twDividendTickerDisabledV0975';
  const card=document.getElementById('dividendTickerCard');
  const track=document.getElementById('dividendTickerTrack');
  const updated=document.getElementById('dividendTickerUpdated');
  const footer=document.getElementById('dividendTickerFooter');
  if(!card||!track||!updated||!footer)return;
  let allEvents=[],lastFetch=0,fetching=false,failures=0,disabled=false;
  let rotation=null,position=0,visibleSignature='',watchSignature='';
  const dayMs=86400000;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function dateOf(v){
    const digits=String(v??'').replace(/\D/g,'');
    if(digits.length!==8)return null;
    const y=Number(digits.slice(0,4)),m=Number(digits.slice(4,6)),d=Number(digits.slice(6,8));
    const ms=Date.UTC(y,m-1,d);
    const x=new Date(ms);
    return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d?ms:null;
  }
  const today=()=>{
    const s=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return dateOf(s);
  };
  function tracked(){
    if(typeof watchlist!=='function')return [];
    const values=watchlist();
    return Array.isArray(values)?[...new Set(values.map(x=>String(x).trim()).filter(Boolean))]:[];
  }
  function formatDate(v){
    const ms=dateOf(v);if(ms==null)return '';
    const d=new Date(ms);return d.getUTCFullYear()+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+String(d.getUTCDate()).padStart(2,'0');
  }
  function message(e,kind,date,code){
    const money=Number(e.cashDividend),cash=e.cashDividend!=null&&Number.isFinite(money)&&money>=0?('每股現金 '+money.toLocaleString('zh-TW',{maximumFractionDigits:4})+' 元'):'';
    const detail=kind==='除息／除權日'?'除息／除權日':kind;
    return {code,date,kind,heading:String(e.name||'').trim()||code,
      detail:[detail+' '+formatDate(date),cash].filter(Boolean).join('｜'),
      source:String(e.source||'來源未標示')};
  }
  function validEvents(){
    const codes=new Set(tracked());if(!codes.size)return [];
    const now=today();if(now==null)throw Error('無法判斷台灣日期');
    const lower=now-RECENT_DAYS*dayMs,upper=now+UPCOMING_DAYS*dayMs,out=[];
    for(const e of allEvents){
      if(!e||typeof e!=='object')continue;
      const code=String(e.code??'').trim();if(!codes.has(code))continue;
      for(const [kind,value] of [['除息／除權日',e.exDate],['股利發放日',e.paymentDate],['股利決議',e.decisionDate]]){
        const ms=dateOf(value);if(ms==null||ms<lower||ms>upper)continue;
        out.push(message(e,kind,value,code));
      }
    }
    const seen=new Set();
    return out.sort((a,b)=>Math.abs(dateOf(a.date)-now)-Math.abs(dateOf(b.date)-now)||dateOf(b.date)-dateOf(a.date))
      .filter(x=>{const k=x.code+'|'+x.kind+'|'+x.date+'|'+x.detail;if(seen.has(k))return false;seen.add(k);return true}).slice(0,20);
  }
  function stopRotate(){if(rotation!==null){clearInterval(rotation);rotation=null}}
  function display(items){
    if(disabled)return;
    const sig=JSON.stringify(items);if(sig===visibleSignature)return;
    visibleSignature=sig;stopRotate();position=0;
    track.style.transition='none';track.style.transform='translateY(0)';
    if(!items.length){
      track.innerHTML='<div class="dividendTickerItem"><span class="dividendTickerStatus">'+(tracked().length?'目前追蹤標的沒有可確認的近期股利消息':'尚未加入追蹤股票或 ETF')+'</span></div>';
      footer.textContent='依公告資料更新；未公告不顯示預估值';return;
    }
    const render=x=>'<div class="dividendTickerItem"><span class="tickerName">'+esc(x.heading)+'（'+esc(x.code)+'）</span><span class="tickerDetail">'+esc(x.detail)+'</span><span class="tickerSource">來源：'+esc(x.source)+'</span></div>';
    track.innerHTML=items.map(render).join('')+(items.length>1?render(items[0]):'');
    footer.textContent='共 '+items.length+' 則近期股利消息｜滑動播放';
    if(items.length<=1)return;
    const advance=()=>{
      if(disabled||document.visibilityState==='hidden'||card.matches(':hover'))return;
      position++;track.style.transition='transform .55s ease';
      track.style.transform='translateY(-'+(position*74)+'px)';
      if(position===items.length){
        setTimeout(()=>{
          if(disabled||position!==items.length)return;
          track.style.transition='none';position=0;track.style.transform='translateY(0)';
        },620);
      }
    };
    rotation=setInterval(advance,ROTATE_MS);
  }
  function disable(){
    disabled=true;stopRotate();card.remove();
    const market=document.querySelector('.market');
    if(market)market.style.gridTemplateColumns='1fr';
    window.__TW_DIVIDEND_TICKER_DISABLED__=true;
    try{localStorage.setItem(DISABLE_KEY,'1')}catch{}
  }
  function fail(err){
    failures++;
    updated.textContent='股利消息更新失敗（'+failures+'/3）';
    footer.textContent='保留已確認內容｜依來源週期重試';
    if(failures>=3)disable();
  }
  async function refresh(force=false){
    if(disabled||fetching||document.visibilityState==='hidden')return;
    const now=Date.now();
    if(!force&&lastFetch&&now-lastFetch<REFRESH_MS)return;
    fetching=true;
    try{
      if(typeof window.__TW_DIVIDEND_FEED__!=='function')throw Error('股利資料讀取介面不存在');
      const rows=await window.__TW_DIVIDEND_FEED__();
      if(!Array.isArray(rows))throw Error('股利來源格式錯誤');
      if(disabled)return;
      allEvents=rows;lastFetch=Date.now();failures=0;
      updated.textContent='股利公告｜依來源週期查核';
      display(validEvents());
    }catch(err){if(!disabled)fail(err)}
    finally{fetching=false}
  }
  function check(){
    if(disabled||document.visibilityState==='hidden')return;
    try{
      const key=tracked().join('|');
      if(key!==watchSignature){watchSignature=key;visibleSignature='';display(validEvents())}
      if(!lastFetch||Date.now()-lastFetch>=REFRESH_MS)refresh();
    }catch(err){fail(err)}
  }
  const start=()=>{
    try{
      try{if(localStorage.getItem(DISABLE_KEY)==='1'){disable();return}}catch{}
      check();setInterval(check,20000);
      window.addEventListener('focus',check);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
      window.__TW_DIVIDEND_TICKER_STATUS__=()=>({disabled,failures,lastFetch,items:validEvents().length});
    }catch(err){fail(err)}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();