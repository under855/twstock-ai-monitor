(() => {
  'use strict';
  // Presentation only: does not fetch quotes or alter stock prices.
  const watch=document.getElementById('watch');
  if(!watch)return;
  const number=v=>{
    const m=String(v??'').replaceAll(',','').match(/[-+]?\d+(?:\.\d+)?/);
    if(!m)return null;
    const x=Number(m[0]);return Number.isFinite(x)?x:null;
  };
  function update(row){
    const price=row.querySelector('.price'),change=row.querySelector('.chg');
    if(!price||!change)return;
    const value=number(change.textContent);
    // Unknown or stale values are not given an invented movement direction.
    const kind=value==null?'flat':value>0?'up':value<0?'down':'flat';
    const wanted='quote-'+kind;
    for(const el of [price,change]){
      for(const cls of ['quote-up','quote-down','quote-flat'])if(cls!==wanted&&el.classList.contains(cls))el.classList.remove(cls);
      if(!el.classList.contains(wanted))el.classList.add(wanted);
    }
  }
  let scheduled=false;
  function refresh(){
    scheduled=false;
    watch.querySelectorAll('article.row').forEach(update);
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(refresh);
  }
  new MutationObserver(schedule).observe(watch,{childList:true,subtree:true,characterData:true});
  refresh();
})();