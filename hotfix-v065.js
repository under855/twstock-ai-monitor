(() => {
  const previousHistory = history;
  const fallback3293 = [
    {date:'2026/09/01',open:719,high:721,low:707,close:711},
    {date:'2026/09/02',open:701,high:710,low:700,close:708},
    {date:'2026/09/03',open:705,high:710,low:702,close:703},
    {date:'2026/09/04',open:710,high:710,low:703,close:709},
    {date:'2026/09/07',open:714,high:714,low:707,close:710},
    {date:'2026/09/08',open:714,high:714,low:704,close:708},
    {date:'2026/09/09',open:711,high:711,low:705,close:708},
    {date:'2026/09/10',open:708,high:710,low:702,close:704},
    {date:'2026/09/11',open:703,high:703,low:693,close:693},
    {date:'2026/09/18',open:725,high:729,low:714,close:729},
    {date:'2026/09/21',open:723,high:725,low:709,close:724},
    {date:'2026/09/22',open:725,high:729,low:719,close:727},
    {date:'2026/09/23',open:728,high:730,low:724,close:729},
    {date:'2026/09/24',open:734,high:774,low:734,close:761},
    {date:'2026/09/29',open:774,high:796,low:766,close:779},
    {date:'2026/09/30',open:781,high:791,low:777,close:788},
    {date:'2026/10/01',open:786,high:814,low:785,close:814},
    {date:'2026/10/02',open:819,high:819,low:778,close:791},
    {date:'2026/10/05',open:797,high:798,low:787,close:794},
    {date:'2026/10/06',open:794,high:794,low:772,close:780},
    {date:'2026/10/07',open:779,high:783,low:771,close:780},
    {date:'2026/10/08',open:780,high:788,low:773,close:788},
    {date:'2026/10/12',open:790,high:803,low:783,close:797},
    {date:'2026/10/13',open:797,high:799,low:786,close:797},
    {date:'2026/10/14',open:801,high:816,low:801,close:811},
    {date:'2026/10/15',open:808,high:817,low:800,close:811},
    {date:'2026/10/16',open:789,high:808,low:775,close:795},
    {date:'2026/10/19',open:795,high:800,low:766,close:774},
    {date:'2026/10/20',open:770,high:786,low:767,close:783},
    {date:'2026/10/21',open:790,high:790,low:774,close:782},
    {date:'2026/10/22',open:781,high:793,low:777,close:787},
    {date:'2026/10/27',open:787,high:797,low:786,close:796}
  ];

  function mergeSeries(a,b){
    const map=new Map();
    for(const x of [...(a||[]),...(b||[])]) if(x?.date && N(x?.close)!=null) map.set(String(x.date),x);
    return [...map.values()].sort((x,y)=>String(x.date).localeCompare(String(y.date)));
  }

  if(!historyCache['3293']?.length) historyCache['3293']=[...fallback3293];

  history = async function(code){
    code=String(code);
    if(code==='3293'){
      let remote=[];
      try{remote=await previousHistory(code)}catch{}
      const merged=mergeSeries(fallback3293,remote);
      historyCache[code]=merged;
      return merged;
    }
    return previousHistory(code);
  };

  function trimDividendCards(){
    const box=document.getElementById('dividendEvents');
    if(!box) return;
    const cards=[...box.querySelectorAll(':scope > .event')];
    cards.slice(3).forEach(x=>x.remove());
  }

  const dividendObserver=new MutationObserver(()=>trimDividendCards());
  const observeDividend=()=>{
    const box=document.getElementById('dividendEvents');
    if(!box)return false;
    dividendObserver.observe(box,{childList:true,subtree:false});
    trimDividendCards();
    return true;
  };
  if(!observeDividend()){
    const t=setInterval(()=>{if(observeDividend())clearInterval(t)},250);
    setTimeout(()=>clearInterval(t),10000);
  }

  // v069 統一由 index 排程行情與歷史補載，避免舊版啟動預抓造成競爭。
  window.__TW_MONITOR_V065__={
    historyFallback3293:fallback3293.length,
    dividendLimit:3,
    immediatePrefetch:false
  };
})();
