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

  function editDistance(a,b,max=2){
    a=String(a||'');b=String(b||'');
    if(Math.abs(a.length-b.length)>max)return max+1;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const cur=[i];let rowMin=i;
      for(let j=1;j<=b.length;j++){
        const v=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
        cur[j]=v;rowMin=Math.min(rowMin,v);
      }
      if(rowMin>max)return max+1;
      prev=cur;
    }
    return prev[b.length];
  }

  function semanticCodes(raw,needle){
    const codes=[];
    const text=String(raw||'').toLowerCase();
    const hasJapan=text.includes('日本')||needle.includes('日本');
    const hasRealEstate=['地產','房地產','不動產','reit','reits'].some(k=>text.includes(k)||needle.includes(k));
    if(hasJapan&&hasRealEstate)codes.push('009817');
    const exact={
      '日本地產':'009817','日本房地產':'009817','日本不動產':'009817','日本reit':'009817','日本reits':'009817',
      '日reit':'009817','日reits':'009817','日本地產etf':'009817','日本房地產etf':'009817','日本不動產etf':'009817'
    };
    const k=String(needle||'');if(exact[k])codes.push(exact[k]);
    return [...new Set(codes)];
  }

  function installFuzzySearch(){
    if(typeof searchUniverse!=='function'||typeof normalizeSearchText!=='function'||typeof universeMap==='undefined')return false;
    const baseSearch=searchUniverse;
    searchUniverse=function(term){
      const t=String(term||'').trim();if(!t)return [];
      const needle=normalizeSearchText(t);
      const normal=baseSearch(t);
      const seen=new Set(normal.map(x=>x.code));
      const extra=[];

      for(const code of semanticCodes(t,needle)){
        const x=universeMap.get(code);
        if(x&&!seen.has(code)){extra.push({...x,_fuzzyReason:'概念相符',_fuzzyRank:10});seen.add(code)}
      }

      // 純數字代號不做猜測，避免把真實證券代號誤導到別檔。
      if(needle&&!/^\d+$/.test(needle)){
        const maxDist=needle.length<=4?1:2;
        for(const x of universeMap.values()){
          if(seen.has(x.code))continue;
          const n=normalizeSearchText(x.name);
          if(!n)continue;
          const d=editDistance(needle,n,maxDist);
          if(d<=maxDist){extra.push({...x,_fuzzyReason:'名稱近似',_fuzzyRank:20+d});seen.add(x.code)}
        }
      }

      extra.sort((a,b)=>(a._fuzzyRank||99)-(b._fuzzyRank||99)||a.code.localeCompare(b.code));
      return [...normal,...extra].slice(0,30);
    };
    window.__TW_FUZZY_SEARCH__={enabled:true,version:'071'};
    return true;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadLatestExtras,{once:true});
  else loadLatestExtras();
  if(!installFuzzySearch())setTimeout(installFuzzySearch,0);
  window.__TW_MONITOR_V069__={taiex:true,fuzzySearch:true};
})();
