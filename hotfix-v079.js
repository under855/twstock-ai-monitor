(() => {
  const INTERVAL = 15000;
  let timer = null;
  let busy = false;
  let baseRender = null;

  const num = v => {
    if (v == null) return null;
    const s = String(v).trim().replaceAll(',', '').replaceAll('+', '');
    if (!s || s === '-' || s === '--' || s === '---') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (v, d=2) => num(v) == null ? '—' : num(v).toLocaleString('zh-TW', { maximumFractionDigits:d });
  const cls = v => num(v) == null ? 'flat' : num(v) > 0 ? 'up' : num(v) < 0 ? 'down' : 'flat';

  function installMobileLayoutFix() {
    if (document.getElementById('pwa-mobile-v079')) return;
    const s = document.createElement('style');
    s.id = 'pwa-mobile-v079';
    s.textContent = `
@media (display-mode: standalone) {
  html { min-height:100%; height:auto!important; overflow-y:auto!important; }
  body { min-height:100%; height:auto!important; overflow-y:auto!important; -webkit-overflow-scrolling:touch; }
  .app { min-height:0!important; height:auto!important; padding-bottom:calc(120px + env(safe-area-inset-bottom))!important; }
  .sheet { top:0!important; right:0!important; bottom:0!important; left:0!important; height:auto!important; min-height:0!important; }
  .panel { max-height:calc(100% - env(safe-area-inset-top))!important; padding-bottom:calc(42px + env(safe-area-inset-bottom))!important; -webkit-overflow-scrolling:touch; }
}
@supports (-webkit-touch-callout:none) {
  @media (display-mode: standalone) {
    body { min-height:-webkit-fill-available!important; }
  }
}`;
    document.head.appendChild(s);
  }

  function installRenderGuard() {
    try {
      if (window.__TW_RENDER_GUARD_V079__) return;
      if (typeof render !== 'function') return;
      baseRender = render;
      render = async function(allowNetwork=false) {
        if (allowNetwork) return;
        return baseRender(false);
      };
      window.__TW_RENDER_GUARD_V079__ = true;
    } catch {}
  }

  async function fetchJson(url, timeout=7000) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, { cache:'no-store', signal:c.signal, headers:{Accept:'application/json'} });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(id); }
  }

  function codes() {
    try { return [...new Set((typeof watchlist === 'function' ? watchlist() : []).map(String))].slice(0,20); }
    catch { return []; }
  }

  async function fetchMisQuotes(list) {
    if (!list.length) return [];
    const channels = [];
    for (const c of list) channels.push(`tse_${c}.tw`, `otc_${c}.tw`);
    const upstream = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels.join('|'))}&json=1&delay=0&_=${Date.now()}`;
    const urls = [
      `https://proxy.cors.dev/${upstream}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`
    ];
    let lastErr;
    for (const u of urls) {
      try {
        const j = await fetchJson(u, 7500);
        if (Array.isArray(j?.msgArray) && j.msgArray.length) return j.msgArray;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('MIS unavailable');
  }

  function toQuote(m) {
    const code = String(m?.c || '').trim();
    if (!code) return null;
    let price = num(m?.trade?.z);
    if (price == null) price = num(m.z);
    if (price == null) price = num(m.a?.split?.('_')?.[0]);
    if (price == null) price = num(m.b?.split?.('_')?.[0]);
    if (price == null) return null;
    const prev = num(m.y);
    const tlong = num(m.tlong);
    let time = tlong ? new Date(tlong) : new Date();
    const tradeTime = String(m?.trade?.t || '').trim();
    if (tradeTime && String(m.d || '').length === 8) {
      const d = String(m.d);
      const iso = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${tradeTime}+08:00`;
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) time = parsed;
    }
    return {
      code,
      price,
      prev,
      change: prev == null ? null : price - prev,
      open:num(m.o), high:num(m.h), low:num(m.l), volume:num(m.v),
      time,
      source: num(m?.trade?.z) != null ? 'TWSE MIS 最新成交' : 'TWSE MIS 即時報價'
    };
  }

  function chooseNewest(items) {
    const map = new Map();
    for (const m of items) {
      const q = toQuote(m); if (!q) continue;
      const old = map.get(q.code);
      if (!old || (q.time?.getTime?.() || 0) >= (old.time?.getTime?.() || 0)) map.set(q.code, q);
    }
    return map;
  }

  function patchRow(row, code, q) {
    if (!row || !q) return;
    const price = row.querySelector('.price');
    const chg = row.querySelector('.chg');
    const day = row.querySelector('.dayline');
    const meta = row.querySelector('.meta');
    if (price) price.textContent = fmt(q.price);
    if (chg) {
      const c = q.change;
      chg.textContent = `${c > 0 ? '+' : ''}${fmt(c)}`;
      chg.className = `chg ${cls(c)}`;
    }
    if (day) day.textContent = `${q.time?.toLocaleTimeString?.('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) || ''}　開 ${fmt(q.open)}　高 ${fmt(q.high)}　低 ${fmt(q.low)}　最新 ${fmt(q.price)}　量 ${fmt(q.volume,0)}`;
    if (meta) meta.innerHTML = `<span>${q.source}</span><span>漲跌 ${q.change > 0 ? '+' : ''}${fmt(q.change)}</span>`;
    const canvas = row.querySelector('canvas.spark');
    if (canvas && typeof draw === 'function') {
      try { draw(canvas, historyCache?.[code] || [], true, q.price); } catch {}
    }
  }

  function patchRows(map) {
    document.querySelectorAll('#watch article.row').forEach(row => {
      const code = row.querySelector('.sym')?.textContent?.trim();
      if (!code) return;
      patchRow(row, code, map.get(code));
    });
  }

  function patchDetail(map) {
    try {
      if (!active || !map.has(String(active))) return;
      const q = map.get(String(active));
      const set = (id, text) => { const e=document.getElementById(id); if(e)e.textContent=text; };
      set('dPrice', fmt(q.price)); set('dOpen', fmt(q.open));
      set('dRange', `${fmt(q.high)} / ${fmt(q.low)}`); set('dVolume', fmt(q.volume,0));
      const ch=document.getElementById('dChange'); if(ch){ch.textContent=`${q.change>0?'+':''}${fmt(q.change)}`;ch.className='v '+cls(q.change);}
      set('dTime', `${q.source}｜${q.time?.toLocaleTimeString?.('zh-TW')||'—'}`);
      const c=document.getElementById('bigChart'); if(c && typeof draw==='function') draw(c,historyCache?.[String(active)]||[],false,q.price);
    } catch {}
  }

  async function refreshLiveQuotes() {
    if (busy) return;
    busy = true;
    try {
      const list = codes();
      const items = await fetchMisQuotes(list);
      const map = chooseNewest(items);
      if (!map.size) return;
      for (const [code,q] of map) {
        try { quoteCache[code] = q; } catch {}
      }
      patchRows(map);
      patchDetail(map);
      const pill=document.getElementById('refreshPill');
      if(pill) pill.textContent='盤中即時：15 秒';
      window.__TW_LIVE_QUOTES_V079__={ok:true,count:map.size,updatedAt:Date.now(),version:'079'};
    } catch (e) {
      window.__TW_LIVE_QUOTES_V079__={ok:false,error:String(e),updatedAt:Date.now(),version:'079'};
    } finally { busy = false; }
  }

  function boot() {
    installMobileLayoutFix();
    installRenderGuard();
    refreshLiveQuotes();
    if (timer) clearInterval(timer);
    timer = setInterval(refreshLiveQuotes, INTERVAL);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
