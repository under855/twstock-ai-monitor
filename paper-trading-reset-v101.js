(() => {
'use strict';
const KEY='twPaperTradingV100';

function ensureReset(){
  const modal=document.getElementById('paperTradeModal');
  const head=modal?.querySelector('.ptHead');
  if(!modal||!head)return false;

  if(!document.getElementById('ptReset')){
    const close=document.getElementById('ptClose');
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;gap:7px;align-items:center';

    const reset=document.createElement('button');
    reset.id='ptReset';
    reset.className='danger';
    reset.textContent='重新開始';
    reset.title='清除全部虛擬交易紀錄，資金重設為 100 萬元';

    if(close&&close.parentNode===head)head.removeChild(close);
    wrap.appendChild(reset);
    if(close)wrap.appendChild(close);
    head.appendChild(wrap);

    reset.onclick=()=>{
      const ok=confirm('重新開始會永久清除目前所有持股、成交紀錄、損益與現金帳，並把初始資金重設為 1,000,000 元。\n\n已成交交易不能單筆取消或反悔。確定要整個重新開始嗎？');
      if(!ok)return;
      localStorage.removeItem(KEY);
      location.reload();
    };
  }

  const notice=modal.querySelector('.notice');
  if(notice&&!notice.dataset.irreversible){
    notice.dataset.irreversible='1';
    notice.insertAdjacentHTML('afterbegin','<strong style="color:#ffd166">交易規則：初始資金 1,000,000 元；每筆買進／賣出一旦成交即永久記帳，不能取消、刪除或反悔。只有「重新開始」能清空整個帳戶並回到 100 萬元。</strong><br><br>');
  }
  return true;
}

function install(){
  ensureReset();
  const observer=new MutationObserver(()=>ensureReset());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',()=>queueMicrotask(ensureReset),true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();