(() => {
  'use strict';

  const STYLE_ID='split-stock-fx-style-v096';
  const ROOT_ID='stockFxSplitV095';
  const BOT_URL='https://rate.bot.com.tw/xrt?Lang=zh-TW';
  const CURRENCIES=['USD','JPY','EUR','CNY','KRW','GBP','AUD','HKD','SGD'];

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
      .botCashFx{margin-top:12px;border:1px solid #233c59;border-radius:16px;background:#0c1725;padding:12px;overflow:hidden}
      .botCashFxHead{display:flex;justify-content:space-between;gap:10px;align-items:end;margin-bottom:9px}.botCashFxTitle{font-size:15px;font-weight:900}.botCashFxTime{font-size:11px;color:#91a8c2;text-align:right}
      .botCashFxGrid{display:grid;grid-template-columns:1.05fr .8fr .8fr;gap:1px;background:#233c59;border:1px solid #233c59;border-radius:10px;overflow:hidden}.botCashFxCell{background:#101f31;padding:8px 7px;font-size:12px}.botCashFxHdr{font-weight:850;color:#a9cbff}.botCashFxCode{font-weight:900}.botCashFxNum{font-variant-numeric:tabular-nums;text-align:right}.botCashFxNote{font-size:10px;color:#91a8c2;margin-top:8px;line-height:1.45}
      @media(max-width:900px){.stockFxSplitV095{grid-template-columns:1fr}.stockFxRightV095{position:static;order:-1}.stockFxSplitV095 .fxStrip{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
      @media(max-width:560px){.stockFxSplitV095 .fxStrip{grid-template-columns:repeat(2,minmax(0,1fr))!important}.botCashFxCell{padding:7px 5px;font-size:11px}}
    `;
    document.head.appendChild(s);
  }

  function findWatchTitle(){return [...document.querySelectorAll('.sectionTitle')].find(x=>/監控牆/.test(x.textContent||''))||null;}
  function cashBox(){let b=document.getElementById('botCashFxV096');if(b)return b;b=document.createElement('section');b.id='botCashFxV096';b.className='botCashFx';b.innerHTML='<div class="botCashFxHead"><div class="botCashFxTitle">臺灣銀行｜現金買進・賣出</div><div class="botCashFxTime">讀取最新牌告…</div></div><div class="botCashFxGrid"><div class="botCashFxCell botCashFxHdr">幣別</div><div class="botCashFxCell botCashFxHdr botCashFxNum">現金買進</div><div class="botCashFxCell botCashFxHdr botCashFxNum">現金賣出</div></div><div class="botCashFxNote">銀行「買進」是銀行向你買外幣；你拿台幣買外幣現鈔時，主要看「現金賣出」。</div>';return b;}
  function parseBot(html){
    const doc=new DOMParser().parseFromString(html,'text/html'),rows=[];
    const number=v=>{
      const s=String(v??'').trim();
      return /^\d+(?:\.\d+)?$/.test(s)&&Number(s)>0?Number(s):null;
    };
    const tbody=doc.querySelector('table.table-striped tbody');
    if(!tbody)return null;
    const seen=new Set();
    for(const tr of tbody.querySelectorAll('tr')){
      const label=tr.querySelector('td[data-table="幣別"]')?.textContent||tr.textContent||'';
      const code=label.match(/\(([A-Z]{3})\)/)?.[1];
      if(!code||!CURRENCIES.includes(code)||seen.has(code))continue;
      const read=name=>number(tr.querySelector('td[data-table="'+name+'"]')?.textContent);
      const buy=read('本行現金買入'),sell=read('本行現金賣出');
      const sightBuy=read('本行即期買入'),sightSell=read('本行即期賣出');
      // Cash rates must have correct direction. Spot may legitimately be unavailable.
      if(buy===null||sell===null||buy>sell)continue;
      if(sightBuy!==null&&sightSell!==null&&sightBuy>sightSell)continue;
      rows.push({code,buy,sell,sightBuy,sightSell});seen.add(code);
    }
    if(rows.length<7||!seen.has('USD')||!seen.has('JPY'))return null;
    const text=(doc.body?.textContent||'').replace(/\s+/g,' ');
    const dateText=text.match(/牌價最新掛牌時間\s*[：:]\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/)?.[1]||'';
    // Never call a proxy retrieval timestamp a quote timestamp.
    if(!dateText)return null;
    const ms=Date.parse(dateText.replace(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/,'$1-$2-$3T$4:00+08:00'));
    if(!Number.isFinite(ms)||ms>Date.now()+300000||Date.now()-ms>7*86400000)return null;
    return {rows,time:dateText,stamp:ms};
  }
  const fmt=v=>v==null?'—':Number(v).toFixed(v<1?5:3).replace(/0+$/,'').replace(/\.$/,'');
  let cashBusy=false,lastBot=null;
  function renderBotRates(p,stale=false){
    const box=cashBox(),grid=box.querySelector('.botCashFxGrid'),time=box.querySelector('.botCashFxTime');
    if(!grid||!time)return;
    const text=p.time+'（臺灣時間）'+(stale?'｜來源暫時無法更新，以下為先前資料':'');
    if(time.textContent!==text)time.textContent=text;
    grid.querySelectorAll('.botCashFxCell:not(.botCashFxHdr)').forEach(x=>x.remove());
    const byCode=new Map(p.rows.map(x=>[x.code,x]));
    for(const code of CURRENCIES){
      const x=byCode.get(code);if(!x)continue;
      for(const value of [code,fmt(x.buy),fmt(x.sell)]){
        const c=document.createElement('div');c.className='botCashFxCell '+(value===code?'botCashFxCode':'botCashFxNum');
        c.textContent=value;grid.appendChild(c);
      }
    }
    const board=document.getElementById('fxBoardStrip');
    const status=document.getElementById('fxStamp');
    if(board){
      const names={USD:'美元',JPY:'日圓',EUR:'歐元',CNY:'人民幣',KRW:'韓元',GBP:'英鎊',AUD:'澳幣',HKD:'港幣',SGD:'新加坡幣'};
      // Bank spot SELL means TWD required to purchase one foreign currency, not an interbank midpoint.
      const frag=document.createDocumentFragment();
      for(const code of CURRENCIES){
        const x=byCode.get(code),item=document.createElement('div');
        item.className='fxItem';
        const title=document.createElement('b'),price=document.createElement('strong'),note=document.createElement('small');
        title.textContent=code+' '+names[code];
        price.textContent=x?fmt(x.sightSell):'—';
        note.textContent=x&&x.sightSell!=null?'臺銀即期賣出／1 '+code:'無即期牌告';
        item.append(title,price,note);frag.appendChild(item);
      }
      board.replaceChildren(frag);
    }
    if(status)status.textContent='臺銀掛牌 '+p.time+(stale?'｜更新失敗':'');
    const summary=document.getElementById('fxBoard');
    if(summary){
      const parts=[];
      for(const [code,name] of [['USD','美元'],['JPY','日圓']]){
        const x=byCode.get(code);
        parts.push(name+'即期賣出 '+(x?fmt(x.sightSell):'—'));
      }
      const note=document.createElement('div');note.className='muted small';
      note.textContent=parts.join('｜')+'｜掛牌 '+p.time+(stale?'（更新失敗）':'');
      summary.replaceChildren(note);
    }
  }
  async function loadBotCash(){
    if(cashBusy)return false;cashBusy=true;
    const time=cashBox().querySelector('.botCashFxTime');
    const upstream=BOT_URL+'&_='+Date.now();
    const urls=[
      'https://proxy.cors.dev/'+upstream,
      'https://api.allorigins.win/raw?url='+encodeURIComponent(upstream)
    ];
    try{
      for(const u of urls){
        try{
          const ac=new AbortController(),t=setTimeout(()=>ac.abort(),7000);
          let response;try{response=await fetch(u,{cache:'no-store',signal:ac.signal})}finally{clearTimeout(t)}
          if(!response.ok)continue;
          const next=parseBot(await response.text());
          if(!next)continue;
          if(lastBot&&next.stamp<lastBot.stamp)continue;
          lastBot=next;renderBotRates(next);return true;
        }catch{}
      }
      if(lastBot)renderBotRates(lastBot,true);
      else{
        if(time)time.textContent='臺銀官方牌告無法驗證，暫停顯示';
        const status=document.getElementById('fxStamp');
        if(status)status.textContent='官方牌告讀取失敗';
        const board=document.getElementById('fxBoardStrip');
        if(board)board.textContent='目前無法確認臺銀即期牌價，不顯示未驗證匯率';
        const summary=document.getElementById('fxBoard');if(summary)summary.textContent='臺銀牌告未取得；請以官方網站為準';
      }
      return false;
    }finally{cashBusy=false}
  }

  function buildSplit(){
    installStyle();
    const existing=document.getElementById(ROOT_ID);if(existing){const right=existing.querySelector('.stockFxRightV095');if(right&&!document.getElementById('botCashFxV096'))right.appendChild(cashBox());return true;}
    const fx=document.querySelector('.fxStrip'),watch=document.querySelector('.watch'),watchTitle=findWatchTitle();if(!fx||!watch||!watchTitle)return false;
    const split=document.createElement('section');split.id=ROOT_ID;split.className='stockFxSplitV095';const left=document.createElement('div');left.className='stockFxLeftV095';const right=document.createElement('aside');right.className='stockFxRightV095';
    const global=document.querySelector('.globalMarkets'),globalTitle=global?.previousElementSibling?.classList?.contains('sectionTitle')?global.previousElementSibling:null,anchor=globalTitle||global||watchTitle;anchor.parentNode.insertBefore(split,anchor);split.append(left,right);if(globalTitle)left.appendChild(globalTitle);if(global)left.appendChild(global);left.appendChild(watchTitle);left.appendChild(watch);right.appendChild(fx);right.appendChild(cashBox());return true;
  }

  function loadPaperTrading(){
    if(document.querySelector('script[data-paper-trading]'))return;
    const s=document.createElement('script');s.src='./paper-trading-v100.js?v=100b';s.dataset.paperTrading='1';
    s.onload=()=>{if(!document.querySelector('script[data-paper-reset]')){const r=document.createElement('script');r.src='./paper-trading-reset-v101.js?v=101b';r.dataset.paperReset='1';document.body.appendChild(r);}};
    document.body.appendChild(s);
  }
  let tries=0;function boot(){if(buildSplit()){loadBotCash();setInterval(loadBotCash,60000);loadPaperTrading();return}if(++tries<80)setTimeout(boot,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
