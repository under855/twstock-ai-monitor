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
function marketTime(){const d=nowTW(),m=d.getHours()*60+d.getMinutes(),wd=d.getDay();return wd>=1&&wd<=5&&m>=9*60&&m<=13*60+30;}
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
async function ensureLive(code){
  if(!marketTime())throw Error('台股目前已休市，虛擬交易暫停，下一個交易日開盤後才能買賣。');
  try{active=code;if(typeof quote==='function')await quote(code,true)}catch{}
  if(window.__TW_LIVE_V091__?.marketWindow===false)throw Error('目前不是台股交易時段，虛擬交易暫停。');
  let q=liveQuote(code);
  if(!q){await new Promise(r=>setTimeout(r,1800));try{if(typeof quote==='function')await quote(code,true)}catch{}q=liveQuote(code)}
  if(!q||!Number.isFinite(Number(q.price))||Number(q.price)<=0)throw Error('目前沒有取得今天的即時成交價，為避免用舊價格交易，本筆不成交。');
  return q;
}
function pos(code){return acct.positions[code]||{code,name:(typeof stockName==='function'?stockName(code,rowForCode?.(code)):code),shares:0,cost:0,avg:0,realized:0,dividends:0}}
function addLedger(type,amount,note){acct.cash=Number((acct.cash+amount).toFixed(2));acct.cashLedger.unshift({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),time:new Date().toISOString(),type,amount,balance:acct.cash,note})}
async function trade(side,code,shares){
  code=String(code||'').trim();shares=Math.floor(Number(shares));if(!code||!Number.isFinite(shares)||shares<=0)throw Error('請輸入正確的股票代號與股數。');
  try{if(typeof loadFullUniverse==='function')await loadFullUniverse()}catch{}
  const u=typeof universeMap!=='undefined'?universeMap.get(code):null;if(!u)throw Error('完整台股名冊找不到這個代號。');
  if(!['TWSE','TPEx'].includes(String(u.market||'')))throw Error('第一版先支援上市、上櫃現股。');
  const q=await ensureLive(code),price=Number(q.price),gross=Math.round(price*shares),fee=commission(gross),p=pos(code),name=u.name||p.name||code;
  if(side==='BUY'){
    const total=gross+fee;if(total>acct.cash)throw Error(`現金不足。需要 ${money(total)} 元，目前可用 ${money(acct.cash)} 元。`);
    addLedger('BUY',-total,`買進 ${name} ${code} ${shares} 股 @ ${px(price)}；手續費 ${money(fee)}`);
    p.cost+=total;p.shares+=shares;p.avg=p.shares?p.cost/p.shares:0;p.name=name;acct.positions[code]=p;
    acct.trades.unshift({id:crypto.randomUUID?.()||String(Date.now()),time:new Date().toISOString(),side,code,name,shares,price,gross,fee,tax:0,net:total,quoteSource:q.source||'即時行情'});
  }else{
    if(shares>p.shares)throw Error(`持股不足。目前只有 ${money(p.shares)} 股。`);
    const tax=taxFor(code,name,gross),net=gross-fee-tax,costOut=p.avg*shares,realized=net-costOut;
    addLedger('SELL',net,`賣出 ${name} ${code} ${shares} 股 @ ${px(price)}；手續費 ${money(fee)}；交易稅 ${money(tax)}`);
    p.shares-=shares;p.cost=Math.max(0,p.cost-costOut);p.realized+=realized;p.avg=p.shares?p.cost/p.shares:0;p.name=name;if(p.shares===0){p.cost=0;p.avg=0}acct.positions[code]=p;
    acct.trades.unshift({id:crypto.randomUUID?.()||String(Date.now()),time:new Date().toISOString(),side,code,name,shares,price,gross,fee,tax,net,realized,quoteSource:q.source||'即時行情'});
  }
  save();return{price,name,fee};
}
function applyCashDividend(code,perShare,payDate,note='現金股利'){
  const p=pos(code),amt=Math.round(p.shares*Number(perShare||0));if(!p.shares||amt<=0)return false;addLedger('DIVIDEND',amt,`${p.name} ${code} ${note}：每股 ${perShare}，${p.shares} 股`);p.dividends+=amt;acct.positions[code]=p;acct.actions.unshift({time:new Date().toISOString(),effectiveDate:payDate||ymd(),type:'CASH_DIVIDEND',code,shares:p.shares,perShare:Number(perShare),amount:amt,note});save();return true;
}
function applyStockDividend(code,ratio,effectiveDate,note='股票股利'){
  const p=pos(code),add=Math.floor(p.shares*Number(ratio||0));if(!p.shares||add<=0)return false;p.shares+=add;p.avg=p.cost/p.shares;acct.positions[code]=p;acct.actions.unshift({time:new Date().toISOString(),effectiveDate:effectiveDate||ymd(),type:'STOCK_DIVIDEND',code,addedShares:add,ratio:Number(ratio),note});save();return true;
}
function currentValue(p){const q=liveQuote(p.code);const u=typeof universeMap!=='undefined'?universeMap.get(p.code):null;const price=Number(q?.price??u?.close??0);return{price,value:Math.round(price*p.shares)}}
function style(){if(document.getElementById('paperTradeStyle'))return;const s=document.createElement('style');s.id='paperTradeStyle';s.textContent=`.ptBtn{background:#6b4eff!important;border-color:#8c78ff!important}.ptModal{position:fixed;inset:0;z-index:90;background:#000a;display:none;align-items:center;justify-content:center;padding:14px}.ptModal.show{display:flex}.ptPanel{width:min(980px,100%);max-height:92vh;overflow:auto;background:#081424;border:1px solid #31557a;border-radius:18px;padding:14px}.ptHead{display:flex;justify-content:space-between;gap:10px;align-items:center}.ptHead h2{margin:0;font-size:20px}.ptStatus{padding:8px 10px;border-radius:10px;background:#102138;color:#bcd1e8;margin:10px 0;font-size:12px}.ptStatus.open{color:#aef3ce;border:1px solid #245d43}.ptGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ptK{background:#102138;border:1px solid #213954;border-radius:11px;padding:10px}.ptK small{color:#93a9c2}.ptK b{display:block;margin-top:4px;font-size:18px}.ptOrder{display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:7px;margin:12px 0}.ptOrder input{min-width:0;padding:10px;border-radius:10px;border:1px solid #31557a;background:#071425;color:#fff}.ptTable{width:100%;border-collapse:collapse;font-size:12px}.ptTable th,.ptTable td{padding:8px 6px;border-bottom:1px solid #1d3552;text-align:right}.ptTable th:first-child,.ptTable td:first-child{text-align:left}.ptTabs{display:flex;gap:6px;margin:12px 0 6px}.ptTab.active{background:#2868a8}.ptMsg{min-height:20px;font-size:12px;color:#ffd166;margin:6px 0}@media(max-width:720px){.ptGrid{grid-template-columns:1fr 1fr}.ptOrder{grid-template-columns:1fr 1fr}.ptOrder button{width:100%}.ptTable{font-size:11px}}`;document.head.appendChild(s)}
function modal(){let m=document.getElementById('paperTradeModal');if(m)return m;m=document.createElement('div');m.id='paperTradeModal';m.className='ptModal';m.innerHTML=`<div class="ptPanel"><div class="ptHead"><h2>虛擬台股交易帳戶</h2><button id="ptClose" class="ghost">關閉</button></div><div id="ptStatus" class="ptStatus"></div><div id="ptSummary" class="ptGrid"></div><div class="ptOrder"><input id="ptCode" placeholder="股票代號，例如 2330"><input id="ptShares" type="number" min="1" step="1" placeholder="股數"><input id="ptQuote" readonly placeholder="成交價：按下交易時抓即時價"><button id="ptBuy" class="primary">買進</button><button id="ptSell" class="danger">賣出</button></div><div id="ptMsg" class="ptMsg"></div><div class="ptTabs"><button class="ptTab active" data-tab="positions">庫存</button><button class="ptTab" data-tab="trades">成交紀錄</button><button class="ptTab" data-tab="ledger">現金帳</button></div><div id="ptBody"></div><div class="notice">虛擬交易：只在台股交易時段開放，成交價使用按下買進／賣出時取得的今日即時成交價。無融資、融券或放空。一般股票賣出交易稅 0.3%，ETF 0.1%；券商手續費以牌告 0.1425% 計，最低 20 元。本功能不會送出真實券商委託。</div></div>`;document.body.appendChild(m);m.querySelector('#ptClose').onclick=()=>m.classList.remove('show');m.onclick=e=>{if(e.target===m)m.classList.remove('show')};for(const b of m.querySelectorAll('.ptTab'))b.onclick=()=>{m.querySelectorAll('.ptTab').forEach(x=>x.classList.remove('active'));b.classList.add('active');m.dataset.tab=b.dataset.tab;renderBody()};m.querySelector('#ptBuy').onclick=()=>doTrade('BUY');m.querySelector('#ptSell').onclick=()=>doTrade('SELL');return m}
async function doTrade(side){const m=modal(),msg=m.querySelector('#ptMsg'),code=m.querySelector('#ptCode').value.trim(),shares=m.querySelector('#ptShares').value;msg.textContent='正在取得最新成交價…';try{const r=await trade(side,code,shares);m.querySelector('#ptQuote').value=`${r.name}｜${px(r.price)} 元`;msg.textContent=`${side==='BUY'?'買進':'賣出'}成交：${r.name} ${shares} 股 @ ${px(r.price)}`}catch(e){msg.textContent=e.message||String(e)}render()}
function renderBody(){const m=modal(),tab=m.dataset.tab||'positions',body=m.querySelector('#ptBody');if(tab==='positions'){const rows=Object.values(acct.positions).filter(p=>p.shares>0).map(p=>{const v=currentValue(p),pl=v.value-p.cost;return`<tr><td>${esc(p.name)}<br><small>${esc(p.code)}</small></td><td>${money(p.shares)}</td><td>${px(p.avg)}</td><td>${px(v.price)||'—'}</td><td>${money(v.value)}</td><td class="${pl>=0?'up':'down'}">${pl>=0?'+':''}${money(pl)}</td></tr>`}).join('');body.innerHTML=`<table class="ptTable"><thead><tr><th>持股</th><th>股數</th><th>均價</th><th>現價</th><th>市值</th><th>未實現</th></tr></thead><tbody>${rows||'<tr><td colspan="6">尚無持股</td></tr>'}</tbody></table>`}else if(tab==='trades'){body.innerHTML=`<table class="ptTable"><thead><tr><th>時間／股票</th><th>買賣</th><th>股數</th><th>成交價</th><th>手續費</th><th>稅</th></tr></thead><tbody>${acct.trades.slice(0,100).map(t=>`<tr><td>${new Date(t.time).toLocaleString('zh-TW')}<br>${esc(t.name)} ${esc(t.code)}</td><td>${t.side==='BUY'?'買':'賣'}</td><td>${money(t.shares)}</td><td>${px(t.price)}</td><td>${money(t.fee)}</td><td>${money(t.tax)}</td></tr>`).join('')||'<tr><td colspan="6">尚無成交</td></tr>'}</tbody></table>`}else{body.innerHTML=`<table class="ptTable"><thead><tr><th>時間／摘要</th><th>金額</th><th>餘額</th></tr></thead><tbody>${acct.cashLedger.slice(0,150).map(x=>`<tr><td>${new Date(x.time).toLocaleString('zh-TW')}<br>${esc(x.note)}</td><td class="${x.amount>=0?'up':'down'}">${x.amount>=0?'+':''}${money(x.amount)}</td><td>${money(x.balance)}</td></tr>`).join('')}</tbody></table>`}}
function render(){const m=document.getElementById('paperTradeModal');if(!m)return;const vals=Object.values(acct.positions).filter(p=>p.shares>0).map(currentValue),market=vals.reduce((a,x)=>a+x.value,0),cost=Object.values(acct.positions).reduce((a,p)=>a+(p.cost||0),0),realized=Object.values(acct.positions).reduce((a,p)=>a+(p.realized||0),0),divs=Object.values(acct.positions).reduce((a,p)=>a+(p.dividends||0),0);m.querySelector('#ptStatus').textContent=marketTime()?'台股交易中｜虛擬買賣開放':'台股休市｜遊戲交易暫停至下一個交易日開盤';m.querySelector('#ptStatus').classList.toggle('open',marketTime());m.querySelector('#ptSummary').innerHTML=`<div class="ptK"><small>可用現金</small><b>${money(acct.cash)}</b></div><div class="ptK"><small>股票市值</small><b>${money(market)}</b></div><div class="ptK"><small>總資產</small><b>${money(acct.cash+market)}</b></div><div class="ptK"><small>已實現＋股息</small><b>${realized+divs>=0?'+':''}${money(realized+divs)}</b></div>`;m.querySelector('#ptBuy').disabled=!marketTime();m.querySelector('#ptSell').disabled=!marketTime();renderBody()}
function install(){style();const top=document.querySelector('.toolbar');if(top&&!document.getElementById('paperTradeBtn')){const b=document.createElement('button');b.id='paperTradeBtn';b.className='pill ptBtn';b.textContent='虛擬交易';b.onclick=()=>{modal().classList.add('show');render()};top.appendChild(b)}modal();render();setInterval(render,15000);window.__PAPER_TRADING__={open:()=>{modal().classList.add('show');render()},account:()=>structuredClone(acct),applyCashDividend,applyStockDividend};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();