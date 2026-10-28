(() => {
  async function loadLatestExtras(){
    try{
      const r=await fetch(`./data/latest.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`latest ${r.status}`);
      const j=await r.json();
      const t=j?.taiex;
      if(t&&t.close!=null){
        const ch=Number(t.change||0);
        const taiex=document.getElementById('taiex');
        const taiexChg=document.getElementById('taiexChg');
        if(taiex)taiex.textContent=Number(t.close).toLocaleString('zh-TW',{maximumFractionDigits:2});
        if(taiexChg){
          taiexChg.textContent=`${ch>0?'+':''}${Number(ch).toLocaleString('zh-TW',{maximumFractionDigits:2})}｜最近交易日 ${String(t.date||j.tradeDate||'').replaceAll('-','/')}`;
          taiexChg.className='s '+(ch>0?'up':ch<0?'down':'flat');
        }
      }
    }catch(err){console.error('[v069 taiex]',err);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadLatestExtras,{once:true});
  else loadLatestExtras();
  window.__TW_MONITOR_V069__={taiex:true};
})();
