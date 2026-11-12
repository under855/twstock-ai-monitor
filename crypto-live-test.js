(() => {
  'use strict';
  // Binance public Spot trade stream: event-driven, not a delayed stock quote.
  // This probe only tests the real-time transport. It never validates TW/US/JP quote accuracy.
  const ENDPOINT='wss://stream.binance.com:9443/ws/btcusdt@trade';
  const CHECK_MS=4000, STALE_MS=15000, FUTURE_TOLERANCE_MS=5000;
  let socket=null, reconnectTimer=null, reconnectAttempt=0;
  let lastReceived=0, lastEventTime=0, lastTradeId=null, receivedCount=0;
  let connectedAt=0, status='等待連線', lastReported=null, stopped=false;
  const byId=id=>document.getElementById(id);
  function mount(){
    if(byId('cryptoValidation'))return;
    const anchor=document.querySelector('.sectionTitle');
    if(!anchor)return;
    const style=document.createElement('style');style.id='cryptoValidationStyle';
    style.textContent='.cryptoValidation{margin:9px 0 13px;padding:12px 14px;background:linear-gradient(145deg,#10223a,#0b1828);border:1px solid #213954;border-radius:13px}.cryptoValidation .top{display:flex;align-items:center;justify-content:space-between;gap:10px}.cryptoValidation small{color:#93a9c2}.cryptoValidation strong{font-size:14px}.cryptoValidation .ok{color:#63d49a}.cryptoValidation .warn{color:#ff8b8b}.cryptoValidation .metrics{font-size:11px;color:#a8bbd0;margin-top:6px;line-height:1.5}';
    document.head.appendChild(style);
    const card=document.createElement('section');card.id='cryptoValidation';card.className='cryptoValidation';
    card.innerHTML='<div class="top"><div><small>24小時即時資料驗證｜Binance BTC/USDT</small><div><strong>WebSocket 連線健康檢查</strong></div></div><strong id="cryptoStatus">等待連線</strong></div><div class="metrics" id="cryptoMetrics">每4秒檢查資料時間；即時成交到達才計為新資料。此測試不代表各國股價已驗證。</div>';
    anchor.parentNode.insertBefore(card,anchor);
  }
  function paint(){
    const state=byId('cryptoStatus'),metrics=byId('cryptoMetrics');if(!state||!metrics)return;
    if(state.textContent!==status)state.textContent=status;
    const cls=status==='即時正常'?'ok':'warn';
    if(state.className!==cls)state.className=cls;
    const age=lastReceived?Math.max(0,Math.round((Date.now()-lastReceived)/1000))+'秒':'—';
    const event=lastEventTime?new Date(lastEventTime).toLocaleTimeString('zh-TW',{hour12:false}):'—';
    const label='來源成交時間：'+event+'｜最近接收：'+age+'前｜有效成交：'+receivedCount+'筆｜每4秒檢查';
    if(metrics.textContent!==label)metrics.textContent=label;
  }
  function report(ok){
    if(lastReported===ok)return;
    lastReported=ok;
    window.__TW_UPDATE_HEALTH__?.('即時驗證 BTC/USDT',ok);
  }
  function scheduleReconnect(){
    if(stopped||reconnectTimer)return;
    const delay=Math.min(30000,1000*Math.pow(2,Math.min(5,reconnectAttempt++)));
    reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect()},delay);
  }
  function connect(){
    if(stopped)return;
    if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
    status='連線中';paint();
    let ws;
    try{ws=new WebSocket(ENDPOINT)}catch{status='更新失敗｜無法連線';report(false);paint();scheduleReconnect();return}
    socket=ws;
    ws.onopen=()=>{if(socket!==ws)return;connectedAt=Date.now();reconnectAttempt=0;status='等待第一筆成交';paint()};
    ws.onmessage=evt=>{
      if(socket!==ws)return;
      let x;try{x=JSON.parse(evt.data)}catch{return}
      if(x?.e!=='trade'||x.s!=='BTCUSDT'||!Number.isFinite(Number(x.p))||Number(x.p)<=0)return;
      const tradeTime=Number(x.T), eventTime=Number(x.E), tradeId=Number(x.t), now=Date.now();
      if(!Number.isFinite(tradeTime)||!Number.isFinite(eventTime)||!Number.isSafeInteger(tradeId))return;
      if(tradeTime>now+FUTURE_TOLERANCE_MS||now-tradeTime>STALE_MS||eventTime>now+FUTURE_TOLERANCE_MS)return;
      if(lastTradeId!==null&&tradeId<=lastTradeId)return;
      lastTradeId=tradeId;lastEventTime=tradeTime;lastReceived=now;receivedCount++;
      status='即時正常';report(true);paint();
    };
    ws.onerror=()=>{if(socket!==ws)return;status='更新失敗｜連線異常';paint()};
    ws.onclose=()=>{if(socket!==ws)return;socket=null;status='更新失敗｜正在重連';report(false);paint();scheduleReconnect()};
  }
  function check(){
    if(stopped)return;
    const now=Date.now();
    if(lastReceived&&now-lastReceived<=STALE_MS&&socket?.readyState===WebSocket.OPEN){
      status='即時正常';report(true);
    }else if(socket?.readyState===WebSocket.OPEN&&connectedAt&&now-connectedAt<=STALE_MS&&!lastReceived){
      status='等待第一筆成交';
    }else{
      status='更新失敗｜資料過期或斷線';report(false);
      if(socket?.readyState===WebSocket.OPEN&&((lastReceived&&now-lastReceived>STALE_MS)||(!lastReceived&&now-connectedAt>STALE_MS))){
        socket.close(4000,'stale trade data');
      }else if(!socket||socket.readyState===WebSocket.CLOSED) scheduleReconnect();
    }
    paint();
  }
  window.__TW_CRYPTO_REFRESH__=()=>{
    if(socket){const ws=socket;socket=null;try{ws.close(4000,'health recovery')}catch{}}
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
    lastReceived=0;lastEventTime=0;lastTradeId=null;connectedAt=0;lastReported=null;
    connect();
  };
  function start(){mount();connect();setInterval(check,CHECK_MS)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();