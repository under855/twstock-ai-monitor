(() => {
'use strict';
const KEY='twPaperTradingV100';
const INITIAL=1000000;
const COMMISSION=0.001425;
const MIN_COMMISSION=20;
const STOCK_TAX=0.003;
const ETF_TAX=0.001;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:0});
const px=n=>Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});
function nowTW(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Taipei'}));}
function ymd(d=nowTW()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function marketTime(){const d=nowTW(),m=d.getHours()*60+d.getMinutes(),wd=d.getDay();return wd>=1&&wd<=5&&m>=9*60&&m<13*60+25;}
function blank(){return{version:1,initialCash:INITIAL,cash:INITIAL,positions:{},trades:[],cashLedger:[{id:crypto.randomUUID?.()||String(Date.now()),time:new Date().toISOString(),type:'INIT',amount:INITIAL,balance:INITIAL,note:'虛擬帳戶初始資金'}],actions:[],createdAt:new Date().toISOString()}}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&x.positions&&Array.isArray(x.trades))return x}catch{}return blank()}
let acct=load();
function save(){localStorage.setItem(KEY,JSON.stringify(acct));render()}
function isETF(code,name=''){return /^00/.test(String(code))||/ETF|指數|高股息|台灣50|台50/.test(String(name))}
function commission(gross){return Math.max(MIN_COMMISSION,Math.floor(gross*COMMISSION))}
function taxFor(code,name,gross){return Math.floor(gross*(isETF(code,name)?ETF_TAX:STOCK_TAX))}
function liveQuote(code){
  const q=typeof quote==='function'?quoteCache?.[code]:null;
  if(q?.live&&q?.date){const d=String(q.date).replace(/\//g,'-');if(d===ymd()||d===ymd().replaceAll('-',''))return q}
  const row=[...document.querySelectorAll('#watch article.row')].find(r=>r.querySelector('.sym')?.textContent?.trim()===code);
  if(row?.dataset.liveState==='live'&&row.dataset.liveDate){const d=String(row.dataset.liveDate).replace(/\//g,'-');if(d===ymd()||d===ymd().replaceAll('-',''))return{price:Number(row.dataset.livePrice),live:true,date:row.dataset.liveDate,stamp:Number(row.dataset.liveStamp)||Date.now(),source:'TWSE MIS 盤中最新成交'};}
  return null;
}
function priceNum(value){if(value==null)return null;const s=String(value).trim().replaceAll(',','');if(!/^\d+(?:\.\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)&&n>0?n:null}
function tickSize(price,etf=false){
  if(etf)return price<50?.01:.05;
  if(price<10)return .01;
  if(price<50)return .05;
  if(price<100)return .1;
  if(price<500)return .5;
  if(price<1000)return 1;
  return 5;
}
function onTick(value,etf=false){const step=tickSize(value,etf);return Math.abs(value/step-Math.round(value/step))<0.00001}
let depthPending=null;
async function fetchOrderBook(code,market){
  const exchange=market==='TPEx'?'otc':'tse';
  const u='https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch='+encodeURIComponent(exchange+'_'+code+'.tw')+'&json=1&delay=0&_='+Date.now();
  const paths=['https://proxy.cors.dev/'+u,'https://api.allorigins.win/raw?url='+encodeURIComponent(u)];
  let lastError=null;
  for(const path of paths){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const res=await fetch(path,{signal:controller.signal,cache:'no-store'});
      if(!res.ok)throw Error('HTTP '+res.status);
      const data=await res.json();
      const m=(data?.msgArray||[]).find(x=>String(x?.c||'')===code&&String(x?.ex||'')===exchange);
      if(!m||String(m.d||'')!==ymd().replaceAll('-',''))throw Error('無今日交易所報價');
      const stamp=Number(m.tlong)>1e12?Number(m.tlong):Date.parse(ymd()+'T'+String(m.t||'')+'+08:00');
      if(!Number.isFinite(stamp)||stamp>Date.now()+30000||Date.now()-stamp>90000)throw Error('買賣盤報價時間過期');
      const prices=side=>String(m?.[side]||'').split('_').map(priceNum);
      const volumes=side=>String(m?.[side]||'').split('_').map(x=>{const v=Number(x);return Number.isFinite(v)&&v>0?v:null});
      const bids=prices('b'),asks=prices('a'),bidVolumes=volumes('g'),askVolumes=volumes('f');
      // TWSE MIS bids use b/g; asks use a/f. Quantities are disclosed in exchange lots.
      const bidLevels=bids.map((price,i)=>({price,lots:bidVolumes[i]})).filter(x=>x.price!==null&&x.lots!==null).sort((a,b)=>b.price-a.price);
      const askLevels=asks.map((price,i)=>({price,lots:askVolumes[i]})).filter(x=>x.price!==null&&x.lots!==null).sort((a,b)=>a.price-b.price);
      if(!bidLevels.length||!askLevels.length||bidLevels[0].price>=askLevels[0].price)throw Error('買賣五檔資料不足或異常');
      return{bid:bidLevels[0],ask:askLevels[0],stamp,source:'TWSE MIS 五檔買賣報價'};
    }catch(e){lastError=e}finally{clearTimeout(timeout)}
  }
  throw Error('無法確認目前有效的買賣五檔價格，為避免虛擬錯誤成交，交易暫停。'+(lastError?'（'+lastError.message+'）':''));
}
async function ensureLive(code,market){
  if(!marketTime())throw Error('只有台股 09:00～13:25 逐筆交易時段開放虛擬立即成交。收盤集合競價時段不以買賣五檔直接模擬成交。');
  return await fetchOrderBook(code,market);
}
function pos(code){return acct.positions[code]||{code,name:(typeof stockName==='function'?stockName(code,rowForCode?.(code)):code),shares:0,cost:0,avg:0,realized:0,dividends:0}}
function addLedger(type,amount,note){acct.cash=Number((acct.cash+amount).toFixed(2));acct.cashLedger.unshift({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),time:new Date().toISOString(),type,amount,balance:acct.cash,note})}
let tradeBusy=false;
async function trade(side,code,shares,limitPriceText=''){
  if(tradeBusy)throw Error('上一筆委託仍在驗證，請勿重複送出。');
  tradeBusy=true;
  try{
    code=String(code||'').trim();shares=Number(shares);
    if(!/^\d+$/.test(String(shares))||shares<=0)throw Error('請輸入正確的股票代號與股數。');
    if(shares%1000!==0)throw Error('目前以整股盤五檔為成交依據，僅支援每筆 1,000 股的整張交易。零股必須使用獨立零股報價，尚未開放模擬成交。');
    try{if(typeof loadFullUniverse==='function')await loadFullUniverse()}catch{}
    const u=typeof universeMap!=='undefined'?universeMap.get(code):null;
    if(!u)throw Error('完整台股名冊找不到此代號。');
    if(!['TWSE','TPEx'].includes(String(u.market||'')))throw Error('第一版先支援上市、上櫃現股。');
    if(!['BUY','SELL'].includes(side))throw Error('買賣方向不正確。');
    const p=pos(code),name=u.name||p.name||code;
    if(side==='SELL'&&shares>p.shares)throw Error('持股不足，目前持有 '+money(p.shares)+' 股。');
    const book=await ensureLive(code,u.market),best=side==='BUY'?book.ask:book.bid,price=best.price;
    const limitRaw=String(limitPriceText??'').trim();
    const limit=limitRaw===''?null:priceNum(limitRaw);
    if(limitRaw!==''&&(limit===null||!onTick(limit,isETF(code,name))))throw Error('委託價格格式或升降單位不正確，請輸入有效限價。');
    if(limit!==null&&((side==='BUY'&&limit<price)||(side==='SELL'&&limit>price))){
      throw Error('此限價尚未達到成交條件，目前最佳'+(side==='BUY'?'賣':'買')+'價 '+px(price)+' 元。本遊戲暫不掛單，這筆沒有成交。');
    }
    // Strict, no fabricated liquidity: single-price fill only if visible top-of-book volume is sufficient.
    if(shares>best.lots*1000)throw Error('最佳'+(side==='BUY'?'賣':'買')+'價可見委託量不足（'+money(best.lots*1000)+' 股）。目前不支援拆單，這筆不成交。');
    const gross=Math.round(price*shares),fee=commission(gross);
    if(side==='BUY'){
      const total=gross+fee;
      if(total>acct.cash)throw Error('現金不足。需要 '+money(total)+' 元，可用 '+money(acct.cash)+' 元。');
      addLedger('BUY',-total,'買進 '+name+' '+code+' '+shares+' 股 @ '+px(price)+'；手續費 '+money(fee));
      p.cost+=total;p.shares+=shares;p.avg=p.shares?p.cost/p.shares:0;p.name=name;acct.positions[code]=p;
      acct.trades.unshift({id:crypto.randomUUID?.()||String(Date.now()),time:new Date().toISOString(),side,code,name,shares,price,gross,fee,tax:0,net:total,limitPrice:limit,bookTime:new Date(book.stamp).toISOString(),quoteSource:book.source});
    }else{
      const tax=taxFor(code,name,gross),net=gross-fee-tax,costOut=p.avg*shares,realized=net-costOut;
      addLedger('SELL',net,'賣出 '+name+' '+code+' '+shares+' 股 @ '+px(price)+'；手續費 '+money(fee)+'；交易稅 '+money(tax));
      p.shares-=shares;p.cost=Math.max(0,p.cost-costOut);p.realized+=realized;p.avg=p.shares?p.cost/p.shares:0;p.name=name;if(p.shares===0){p.cost=0;p.avg=0}acct.positions[code]=p;
      acct.trades.unshift({id:crypto.randomUUID?.()||String(Date.now()),time:new Date().toISOString(),side,code,name,shares,price,gross,fee,tax,net,realized,limitPrice:limit,bookTime:new Date(book.stamp).toISOString(),quoteSource:book.source});
    }
    save();return{price,name,fee,book};
  }finally{tradeBusy=false}
}
function applyCashDividend(code,perShare,payDate,note='現金股利'){
  const p=pos(code),amt=Math.round(p.shares*Number(perShare||0));if(!p.shares||amt<=0)return false;addLedger('DIVIDEND',amt,`${p.name} ${code} ${note}：每股 ${perShare}，${p.shares} 股`);p.dividends+=amt;acct.positions[code]=p;acct.actions.unshift({time:new Date().toISOString(),effectiveDate:payDate||ymd(),type:'CASH_DIVIDEND',code,shares:p.shares,perShare:Number(perShare),amount:amt,note});save();return true;
}
function applyStockDividend(code,ratio,effectiveDate,note='股票股利'){
  const p=pos(code),add=Math.floor(p.shares*Number(ratio||0));if(!p.shares||add<=0)return false;p.shares+=add;p.avg=p.cost/p.shares;acct.positions[code]=p;acct.actions.unshift({time:new Date().toISOString(),effectiveDate:effectiveDate||ymd(),type:'STOCK_DIVIDEND',code,addedShares:add,ratio:Number(ratio),note});save();return true;
}
function currentValue(p){const q=liveQuote(p.code);const u=typeof universeMap!=='undefined'?universeMap.get(p.code):null;const price=Number(q?.price??u?.close??0);return{price,value:Math.round(price*p.shares)}}
function style(){if(document.getElementById('paperTradeStyle'))return;const s=document.createElement('style');s.id='paperTradeStyle';s.textContent=`.ptBtn{background:#6b4eff!important;border-color:#8c78ff!important}.ptModal{position:fixed;inset:0;z-index:90;background:#000a;display:none;align-items:center;justify-content:center;padding:14px}.ptModal.show{display:flex}.ptPanel{width:min(980px,100%);max-height:92vh;overflow:auto;background:#081424;border:1px solid #31557a;border-radius:18px;padding:14px}.ptHead{display:flex;justify-content:space-between;gap:10px;align-items:center}.ptHead h2{margin:0;font-size:20px}.ptStatus{padding:8px 10px;border-radius:10px;background:#102138;color:#bcd1e8;margin:10px 0;font-size:12px}.ptStatus.open{color:#aef3ce;border:1px solid #245d43}.ptGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ptK{background:#102138;border:1px solid #213954;border-radius:11px;padding:10px}.ptK small{color:#93a9c2}.ptK b{display:block;margin-top:4px;font-size:18px}.ptOrder{display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:7px;margin:12px 0}.ptOrder input{min-width:0;padding:10px;border-radius:10px;border:1px solid #31557a;background:#071425;color:#fff}.ptTable{width:100%;border-collapse:collapse;font-size:12px}.ptTable th,.ptTable td{padding:8px 6px;border-bottom:1px solid #1d3552;text-align:right}.ptTable th:first-child,.ptTable td:first-child{text-align:left}.ptTabs{display:flex;gap:6px;margin:12px 0 6px}.ptTab.active{background:#2868a8}.ptMsg{min-height:20px;font-size:12px;color:#ffd166;margin:6px 0}@media(max-width:720px){.ptGrid{grid-template-columns:1fr 1fr}.ptOrder{grid-template-columns:1fr 1fr}.ptOrder button{width:100%}.ptTable{font-size:11px}}`;document.head.appendChild(s)}
function modal(){let m=document.getElementById('paperTradeModal');if(m)return m;m=document.createElement('div');m.id='paperTradeModal';m.className='ptModal';m.innerHTML=`<div class="ptPanel"><div class="ptHead"><h2>虛擬台股交易帳戶</h2><button id="ptClose" class="ghost">關閉</button></div><div id="ptStatus" class="ptStatus"></div><div id="ptSummary" class="ptGrid"></div><div class="ptOrder"><input id="ptCode" placeholder="股票代號，例如 2330"><input id="ptShares" type="number" min="1" step="1" placeholder="股數"><input id="ptLimit" type="number" min="0" step="0.01" inputmode="decimal" placeholder="限價（空白＝最佳對手價）"><button id="ptBuy" class="primary">買進</button><button id="ptSell" class="danger">賣出</button></div><div id="ptMsg" class="ptMsg"></div><div class="ptTabs"><button class="ptTab active" data-tab="positions">庫存</button><button class="ptTab" data-tab="trades">成交紀錄</button><button class="ptTab" data-tab="ledger">現金帳</button></div><div id="ptBody"></div><div class="notice">虛擬交易：只在台股交易時段開放，限價買進須不低於最佳賣價，限價賣出須不高於最佳買價，才可能立即成交；本模擬採最佳對手方一檔可見量作為全數成交門檻，不提供掛單、拆單與真實撮合。僅支援整張，零股暫停。無融資、融券或放空。一般股票賣出交易稅 0.3%，ETF 0.1%；券商手續費以牌告 0.1425% 計，最低 20 元。本功能不會送出真實券商委託。</div></div>`;document.body.appendChild(m);m.querySelector('#ptClose').onclick=()=>m.classList.remove('show');m.onclick=e=>{if(e.target===m)m.classList.remove('show')};for(const b of m.querySelectorAll('.ptTab'))b.onclick=()=>{m.querySelectorAll('.ptTab').forEach(x=>x.classList.remove('active'));b.classList.add('active');m.dataset.tab=b.dataset.tab;renderBody()};m.querySelector('#ptBuy').onclick=()=>doTrade('BUY');m.querySelector('#ptSell').onclick=()=>doTrade('SELL');return m}
async function doTrade(side){
  const m=modal(),msg=m.querySelector('#ptMsg'),code=m.querySelector('#ptCode').value.trim(),shares=m.querySelector('#ptShares').value;
  const limit=m.querySelector('#ptLimit').value;
  msg.textContent='查詢交易所買賣五檔並確認委託價格…';
  m.querySelector('#ptBuy').disabled=true;m.querySelector('#ptSell').disabled=true;
  try{
    const r=await trade(side,code,shares,limit);
    msg.textContent=(side==='BUY'?'買進':'賣出')+'模擬成交：'+r.name+' '+shares+' 股 @ '+px(r.price)+'（'+(side==='BUY'?'最佳賣價':'最佳買價')+'）';
  }catch(e){msg.textContent=e.message||String(e)}
  finally{render()}
}
function renderBody(){const m=modal(),tab=m.dataset.tab||'positions',body=m.querySelector('#ptBody');if(tab==='positions'){const rows=Object.values(acct.positions).filter(p=>p.shares>0).map(p=>{const v=currentValue(p),pl=v.value-p.cost;return`<tr><td>${esc(p.name)}<br><small>${esc(p.code)}</small></td><td>${money(p.shares)}</td><td>${px(p.avg)}</td><td>${px(v.price)||'—'}</td><td>${money(v.value)}</td><td class="${pl>=0?'up':'down'}">${pl>=0?'+':''}${money(pl)}</td></tr>`}).join('');body.innerHTML=`<table class="ptTable"><thead><tr><th>持股</th><th>股數</th><th>均價</th><th>現價</th><th>市值</th><th>未實現</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無持股</td></tr>'}</tbody></table>`}else if(tab==='trades'){body.innerHTML=`<table class="ptTable"><thead><tr><th>時間／股票</th><th>買賣</th><th>股數</th><th>成交價</th><th>手續費</th><th>稅</th></tr></thead><tbody>${acct.trades.slice(0,100).map(t=>`<tr><td>${new Date(t.time).toLocaleString('zh-TW')}<br>${esc(t.name)} ${esc(t.code)}</td><td>${t.side==='BUY'?'買':'賣'}</td><td>${money(t.shares)}</td><td>${px(t.price)}</td><td>${money(t.fee)}</td><td>${money(t.tax)}</td></tr>`).join('')||'<tr><td colspan="6">尚無成交</td></tr>'}</tbody></table>`}else{body.innerHTML=`<table class="ptTable"><thead><tr><th>時間／摘要</th><th>金額</th><th>餘額</th></tr></thead><tbody>${acct.cashLedger.slice(0,150).map(x=>`<tr><td>${new Date(x.time).toLocaleString('zh-TW')}<br>${esc(x.note)}</td><td class="${x.amount>=0?'up':'down'}">${x.amount>=0?'+':''}${money(x.amount)}</td><td>${money(x.balance)}</td></tr>`).join('')}</tbody></table>`}}
function render(){const m=document.getElementById('paperTradeModal');if(!m)return;const vals=Object.values(acct.positions).filter(p=>p.shares>0).map(currentValue),market=vals.reduce((a,x)=>a+x.value,0),cost=Object.values(acct.positions).reduce((a,p)=>a+(p.cost||0),0),realized=Object.values(acct.positions).reduce((a,p)=>a+(p.realized||0),0),divs=Object.values(acct.positions).reduce((a,p)=>a+(p.dividends||0),0);m.querySelector('#ptStatus').textContent=marketTime()?'台股交易中｜虛擬買賣開放':'目前非逐筆交易時段｜模擬交易暫停（09:00～13:25）';m.querySelector('#ptStatus').classList.toggle('open',marketTime());m.querySelector('#ptSummary').innerHTML=`<div class="ptK"><small>可用現金</small><b>${money(acct.cash)}</b></div><div class="ptK"><small>股票市值</small><b>${money(market)}</b></div><div class="ptK"><small>總資產</small><b>${money(acct.cash+market)}</b></div><div class="ptK"><small>已實現＋股息</small><b>${realized+divs>=0?'+':''}${money(realized+divs)}</b></div>`;m.querySelector('#ptBuy').disabled=!marketTime()||tradeBusy;m.querySelector('#ptSell').disabled=!marketTime()||tradeBusy;renderBody()}
function install(){style();const top=document.querySelector('.toolbar');if(top&&!document.getElementById('paperTradeBtn')){const b=document.createElement('button');b.id='paperTradeBtn';b.className='pill ptBtn';b.textContent='虛擬交易';b.onclick=()=>{modal().classList.add('show');render()};top.appendChild(b)}modal();render();setInterval(render,15000);window.__PAPER_TRADING__={open:()=>{modal().classList.add('show');render()},account:()=>structuredClone(acct),applyCashDividend,applyStockDividend};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();