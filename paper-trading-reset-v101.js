(() => {
'use strict';
const KEY='twPaperTradingV100';
const INITIAL=1000000;
function install(){
  const timer=setInterval(()=>{
    const modal=document.getElementById('paperTradeModal');
    const head=modal?.querySelector('.ptHead');
    if(!modal||!head)return;
    clearInterval(timer);
    if(!document.getElementById('ptReset')){
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;gap:7px;align-items:center';
      const reset=document.createElement('button');
      reset.id='ptReset';reset.className='danger';reset.textContent='重新開始';
      reset.title='清除全部虛擬交易紀錄，資金重設為 100 萬元';
      const close=document.getElementById('ptClose');
      wrap.append(reset,close);head.appendChild(wrap);
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
  },250);
  setTimeout(()=>clearInterval(timer),15000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();