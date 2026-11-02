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
  function parseBot(html){const doc=new DOMParser().parseFromString(html,'text/html'),rows=[];for(const tr of doc.querySelectorAll('table tbody tr')){const text=(tr.textContent||'').replace(/\s+/g,' ').trim();const m=text.match(/\(([A-Z]{3})\)/);if(!m||!CURRENCIES.includes(m[1]))continue;const nums=[...tr.querySelectorAll('td')].map(td=>(td.textContent||'').trim()).filter(x=>/^-?\d+(\.\d+)?$/.test(x));if(nums.length>=2)rows.push({code:m[1],buy:nums[0],sell:nums[1]});}const body=(doc.body?.textContent||'').replace(/\s+/g,' ');const tm=body.match(/牌價最新掛牌時間[：:]\s*([^取幣]+?)(?=幣別|$)/);return {rows,time:tm?tm[1].trim():''};}
  async function loadBotCash(){const box=cashBox(),grid=box.querySelector('.botCashFxGrid'),time=box.querySelector('.botCashFxTime');const urls=[`https://api.allorigins.win/raw?url=${encodeURIComponent(BOT_URL)}`,`https://proxy.cors.dev/${BOT_URL}`];for(const u of urls){try{const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);let r;try{r=await fetch(u,{cache:'no-store',signal:ac.signal});}finally{clearTimeout(t)}if(!r.ok)continue;const p=parseBot(await r.text());if(!p.rows.length)continue;grid.querySelectorAll('.botCashFxCell:not(.botCashFxHdr)').forEach(x=>x.remove());for(const x of p.rows){grid.insertAdjacentHTML('beforeend',`<div class="botCashFxCell botCashFxCode">${x.code}</div><div class="botCashFxCell botCashFxNum">${x.buy}</div><div class="botCashFxCell botCashFxNum">${x.sell}</div>`);}time.textContent=p.time?`掛牌 ${p.time}`:'臺銀最新牌告';return true;}catch{}}time.textContent='臺銀牌告暫時無法讀取';return false;}

  function buildSplit(){
    installStyle();
    const existing=document.getElementById(ROOT_ID);if(existing){const right=existing.querySelector('.stockFxRightV095');if(right&&!document.getElementById('botCashFxV096'))right.appendChild(cashBox());return true;}
    const fx=document.querySelector('.fxStrip'),watch=document.querySelector('.watch'),watchTitle=findWatchTitle();if(!fx||!watch||!watchTitle)return false;
    const split=document.createElement('section');split.id=ROOT_ID;split.className='stockFxSplitV095';const left=document.createElement('div');left.className='stockFxLeftV095';const right=document.createElement('aside');right.className='stockFxRightV095';
    const global=document.querySelector('.globalMarkets'),globalTitle=global?.previousElementSibling?.classList?.contains('sectionTitle')?global.previousElementSibling:null,anchor=globalTitle||global||watchTitle;anchor.parentNode.insertBefore(split,anchor);split.append(left,right);if(globalTitle)left.appendChild(globalTitle);if(global)left.appendChild(global);left.appendChild(watchTitle);left.appendChild(watch);right.appendChild(fx);right.appendChild(cashBox());return true;
  }

  function loadPaperTrading(){if(document.querySelector('script[data-paper-trading]'))return;const s=document.createElement('script');s.src='./paper-trading-v100.js?v=100a';s.dataset.paperTrading='1';document.body.appendChild(s);}
  let tries=0;function boot(){if(buildSplit()){loadBotCash();setInterval(loadBotCash,300000);loadPaperTrading();return}if(++tries<80)setTimeout(boot,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
