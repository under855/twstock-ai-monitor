(() => {
  'use strict';

  const STYLE_ID='split-stock-fx-style-v095';
  const ROOT_ID='stockFxSplitV095';

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .stockFxSplitV095{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start;margin-top:10px}
      .stockFxLeftV095,.stockFxRightV095{min-width:0}
      .stockFxRightV095{position:sticky;top:108px}
      .stockFxSplitV095 .fxStrip{margin:0!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;align-content:start}
      .stockFxSplitV095 .fxStripTitle{grid-column:1/-1!important}
      .stockFxSplitV095 .fxItem{min-width:0}
      .stockFxLeftV095 .globalMarkets{grid-template-columns:1fr!important}
      .stockFxLeftV095 .row{grid-template-columns:minmax(120px,1fr) minmax(95px,.8fr) 62px 24px!important;grid-template-areas:"name price score open" "day day day day" "meta meta meta meta"!important}
      @media(max-width:900px){
        .stockFxSplitV095{grid-template-columns:1fr}
        .stockFxRightV095{position:static;order:-1}
        .stockFxSplitV095 .fxStrip{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      }
      @media(max-width:560px){.stockFxSplitV095 .fxStrip{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    `;
    document.head.appendChild(s);
  }

  function findWatchTitle(){
    return [...document.querySelectorAll('.sectionTitle')].find(x=>/監控牆/.test(x.textContent||''))||null;
  }

  function buildSplit(){
    installStyle();
    if(document.getElementById(ROOT_ID)) return true;
    const fx=document.querySelector('.fxStrip');
    const watch=document.querySelector('.watch');
    const watchTitle=findWatchTitle();
    if(!fx||!watch||!watchTitle) return false;

    const split=document.createElement('section');
    split.id=ROOT_ID;
    split.className='stockFxSplitV095';
    const left=document.createElement('div');
    left.className='stockFxLeftV095';
    const right=document.createElement('aside');
    right.className='stockFxRightV095';

    const global=document.querySelector('.globalMarkets');
    const globalTitle=global?.previousElementSibling?.classList?.contains('sectionTitle')?global.previousElementSibling:null;

    const anchor=globalTitle||global||watchTitle;
    anchor.parentNode.insertBefore(split,anchor);
    split.append(left,right);

    if(globalTitle) left.appendChild(globalTitle);
    if(global) left.appendChild(global);
    left.appendChild(watchTitle);
    left.appendChild(watch);
    right.appendChild(fx);
    return true;
  }

  let tries=0;
  function boot(){
    if(buildSplit()) return;
    if(++tries<80) setTimeout(boot,250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
