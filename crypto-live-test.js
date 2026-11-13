(() => {
  'use strict';
  // Coinbase Exchange public WebSocket: read-only 24h transport health probe.
  // Success validates this stream only, not TWSE/US/JP exchange quote accuracy.
  const ENDPOINT='wss://ws-feed.exchange.coinbase.com';
  const PRODUCT='BTC-USD';
  const CHECK_MS=4000, STALE_MS=15000, FUTURE_MS=5000;
  const id=k=>document.getElementById(k);
  let ws=null,reconnectTimer=null,tries=0,started=0;
  let lastTick=0,lastTradeTime=0,lastTradeId=null,total=0,lastHealth=null;
  let state='等待連線';
  function mount(){
    if(id('cryptoValidation'))return;
    const anchor=document.querySelector('.sectionTitle');if(!anchor)return;
    if(!id('cryptoValidationStyle')){
      const s=document.createElement('style');s.id='cryptoValidationStyle';
      s.textContent='.cryptoValidation{margin:9px 0 13px;padding:12px 14px;background:linear-gradient(145deg,#10223a,#0b1828);border:1px solid #213954;border-radius:13px}.cryptoValidation .top{display:flex;align-items:center;justify-content:space-between;gap:10px}.cryptoValidation small{color:#93a9c2}.cryptoValidation strong{font-size:14px}.cryptoValidation .ok{color:#63d49a}.cryptoValidation .warn{color:#ff8b8b}.cryptoValidation .metrics{font-size:11px;color:#a8bbd0;margin-top:6px;line-height:1.5}';
      document.head.appendChild(s);
    }
    const card=document.createElement('section');card.className='cryptoValidation';card.id='cryptoValidation';
    card.innerHTML='<div class="top"><div><small>24小時即時資料驗證｜Coinbase BTC-USD</small><div><strong>WebSocket 連線健康檢查</strong></div></div><strong id="cryptoStatus">等待連線</strong></div><div class="metrics" id="cryptoMetrics">每4秒檢查成交時間與連線狀態；本欄不代表台、美、日股報價已驗證。</div>';
    anchor.parentNode.insertBefore(card,anchor);
  }
  function render(){
    const el=id('cryptoStatus'),metrics=id('cryptoMetrics');if(!el||!metrics)return;
    if(el.textContent!==state)el.textContent=state;
    const cls=state==='即時正常'?'ok':'warn';if(el.className!==cls)el.className=cls;
    const age=lastTick?Math.floor((Date.now()-lastTick)/1000)+'秒':'—';
    const t=lastTradeTime?new Date(lastTradeTime).toLocaleTimeString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'}):'—';
    const details='來源成交時間：'+t+'｜最近接收：'+age+'前｜有效成交：'+total+'筆｜每4秒檢查';
    if(metrics.textContent!==details)metrics.textContent=details;
  }
  function health(ok){
    if(lastHealth===ok)return;
    lastHealth=ok;window.__TW_UPDATE_HEALTH__?.('即時驗證 BTC-USD',ok);
  }
  function retry(){
    if(reconnectTimer)return;
    const delay=Math.min(30000,1000*2**Math.min(tries++,5));
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect()},delay);
  }
  function connect(){
    if(ws&&(ws.readyState===WebSocket.CONNECTING||ws.readyState===WebSocket.OPEN))return;
    state='連線中';render();
    let socket;
    try{socket=new WebSocket(ENDPOINT)}catch{state='更新失敗｜無法連線';health(false);render();retry();return}
    ws=socket;started=Date.now();
    socket.onopen=()=>{
      if(ws!==socket)return;
      tries=0;started=Date.now();state='等待第一筆成交';render();
      socket.send(JSON.stringify({type:'subscribe',product_ids:[PRODUCT],channels:['ticker','heartbeat']}));
    };
    socket.onmessage=event=>{
      if(ws!==socket)return;
      let msg;try{msg=JSON.parse(event.data)}catch{return}
      if(msg.type!=='ticker'||msg.product_id!==PRODUCT)return;
      const price=Number(msg.price),stamp=Date.parse(msg.time),tradeId=Number(msg.trade_id),now=Date.now();
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(stamp)||!Number.isSafeInteger(tradeId))return;
      if(stamp>now+FUTURE_MS||now-stamp>STALE_MS)return;
      if(lastTradeId!==null&&tradeId<=lastTradeId)return;
      lastTradeId=tradeId;lastTradeTime=stamp;lastTick=now;total++;
      state='即時正常';health(true);render();
    };
    socket.onerror=()=>{if(ws!==socket)return;state='更新失敗｜連線異常';render()};
    socket.onclose=()=>{
      if(ws!==socket)return;ws=null;state='更新失敗｜重新連線中';health(false);render();retry();
    };
  }
  function check(){
    const now=Date.now(),open=ws?.readyState===WebSocket.OPEN;
    if(open&&lastTick&&now-lastTick<=STALE_MS){
      state='即時正常';health(true);
    }else if(open&&!lastTick&&now-started<=STALE_MS){
      state='等待第一筆成交';
    }else{
      state='更新失敗｜資料過期或斷線';health(false);
      if(open)ws.close(4000,'stale data');
      else if(!ws||ws.readyState===WebSocket.CLOSED)retry();
    }
    render();
  }
  window.__TW_CRYPTO_REFRESH__=()=>{
    const old=ws;ws=null;
    if(old)try{old.close(4000,'health recovery')}catch{}
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
    lastTick=0;lastTradeTime=0;lastTradeId=null;lastHealth=null;
    connect();
  };
  function start(){mount();connect();setInterval(check,CHECK_MS)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();