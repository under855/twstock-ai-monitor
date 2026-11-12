(() => {
  'use strict';
  const root=document.getElementById('taiexSectorTape');
  const track=document.getElementById('taiexSectorTrack');
  const label=document.getElementById('taiexSectorDate');
  if(!root||!track||!label)return;
  const SOURCE='./data/latest.json', PERIOD=60000;
  const ALLOW=new Set(['食品','塑膠','電機機械','生技醫療','鋼鐵','半導體','建材營造','航運','金融保險']);
  let signature='',pending=false;
  function taiwanToday(){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v=k=>p.find(x=>x.type===k)?.value||'';
    return v('year')+'-'+v('month')+'-'+v('day');
  }
  function validDate(value){
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(value)))return false;
    const date=new Date(value+'T00:00:00Z');
    const today=new Date(taiwanToday()+'T00:00:00Z');
    const age=(today-date)/86400000;
    return Number.isFinite(age)&&age>=0&&age<=14&&date.toISOString().slice(0,10)===value;
  }
  function parse(json){
    const s=json?.sectorIndices;
    if(s?.source!=='TWSE MI_INDEX'||!validDate(s.date)||!Array.isArray(s.items))return null;
    const unique=new Set(),items=[];
    for(const x of s.items){
      const name=String(x?.name||''),value=Number(x?.percent);
      if(!ALLOW.has(name)||unique.has(name)||x?.date!==s.date.replaceAll('-','')||x?.percent==null||!Number.isFinite(value)||Math.abs(value)>50)continue;
      unique.add(name);items.push({name,value});
    }
    return items.length>=5?{date:s.date,items}:null;
  }
  function item(x){
    const span=document.createElement('span');span.className='taiexSectorItem';
    const name=document.createElement('span');name.textContent=x.name+' ';
    const value=document.createElement('strong');
    value.className=x.value>0?'up':x.value<0?'down':'flat';
    value.textContent=(x.value>0?'+':'')+x.value.toFixed(2)+'%';
    span.append(name,value);return span;
  }
  function show(data){
    const key=data?JSON.stringify(data):'unavailable';
    if(signature===key)return;
    signature=key;
    if(!data){
      track.replaceChildren();
      track.style.animation='none';
      const message=document.createElement('span');message.textContent='尚無經日期驗證的類股資料';
      track.append(message);label.textContent='等待證交所盤後資料';return;
    }
    const groups=[];
    for(let i=0;i<2;i++){
      const group=document.createElement('div');group.className='taiexSectorGroup';
      for(const x of data.items)group.append(item(x));
      groups.push(group);
    }
    track.replaceChildren(...groups);
    track.style.animation='';
    const today=data.date===taiwanToday();
    label.textContent=(today?'今日盤後':'最近交易日')+' '+data.date.replaceAll('-','/')+'｜證交所';
  }
  async function refresh(){
    if(pending||document.visibilityState==='hidden')return;
    pending=true;
    try{
      const r=await fetch(SOURCE+'?_='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!r.ok)throw Error('HTTP '+r.status);
      const data=parse(await r.json());
      if(data)show(data);
      else if(!signature)show(null);
    }catch{
      if(!signature)show(null);
      // Preserve the last verified report and its date; never label it live.
    }finally{pending=false}
  }
  refresh();setInterval(refresh,PERIOD);
  addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();