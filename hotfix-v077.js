(() => {
  const INTERVAL = 10000;
  const MAX_STALE_MS = 120 * 1000;
  let timer = null;
  let lastLive = null;
  let repainting = false;

  const N = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const F = v => N(v) == null ? '—' : N(v).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
  const todayKey = () => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const g = t => p.find(x => x.type === t)?.value || '';
    return `${g('year')}${g('month')}${g('day')}`;
  };
  const hhmmss = ms => new Date(ms).toLocaleTimeString('zh-TW', { timeZone:'Asia/Taipei', hour:'2-digit', minute:'2-digit', second:'2-digit' });

  function paint(rec) {
    if (!rec || N(rec.price) == null) return false;
    const value = document.getElementById('taiex');
    const info = document.getElementById('taiexChg');
    if (!value || !info) return false;
    const ch = N(rec.change);
    repainting = true;
    value.textContent = F(rec.price);
    info.textContent = `${ch == null ? '—' : `${ch > 0 ? '+' : ''}${F(ch)}`}｜${rec.label}${rec.time ? ` ${rec.time}` : ''}`;
    info.className = 's ' + (ch == null ? 'muted' : ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat');
    requestAnimationFrame(() => { repainting = false; });
    window.__TW_TAIEX_FINAL__ = { ...rec, renderedAt: Date.now(), version:'078' };
    return true;
  }

  async function fetchJson(url, timeout=6000) {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, { cache:'no-store', signal:c.signal, headers:{'Accept':'application/json'} });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(id); }
  }

  function parseTwse(j) {
    const m = (j?.msgArray || []).find(x => String(x?.c || '') === 't00' || String(x?.ch || '') === 't00.tw') || j?.msgArray?.[0];
    if (!m) return null;
    const price = N(m.z), prev = N(m.y), d = String(m.d || ''), t = String(m.t || '');
    const tlong = N(m.tlong);
    if (price == null || d !== todayKey()) return null;
    if (tlong && Math.abs(Date.now() - tlong) > MAX_STALE_MS) return null;
    return { price, previousClose:prev, change: prev == null ? null : price - prev, label:'TWSE 盤中即時', time:t || (tlong ? hhmmss(tlong) : ''), source:'TWSE MIS', sourceTime:tlong || Date.now() };
  }

  async function fromTwseProxy() {
    const upstream = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0&_=${Date.now()}`;
    const urls = [
      `https://proxy.cors.dev/${upstream}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(upstream)}`
    ];
    let newest = null;
    for (const u of urls) {
      try {
        const rec = parseTwse(await fetchJson(u, 6500));
        if (rec && (!newest || rec.sourceTime > newest.sourceTime)) newest = rec;
      } catch (_) {}
    }
    return newest;
  }

  async function fromRawGithub() {
    try {
      const j = await fetchJson(`https://raw.githubusercontent.com/under855/twstock-ai-monitor/main/data/latest.json?ts=${Date.now()}`, 6500);
      const t = j?.taiex;
      if (!t || String(t.date || '').replaceAll('-','') !== todayKey()) return null;
      const price = N(t.close), prev = N(t.previousClose), ch = N(t.change);
      if (price == null) return null;
      return { price, previousClose: prev ?? (ch == null ? null : price - ch), change: ch, label:'TWSE 盤中備援', time:String(t.time || ''), source:'GitHub 同步快照', sourceTime:Date.parse(j.generatedAt || '') || Date.now() };
    } catch (_) { return null; }
  }

  async function refresh() {
    const live = await fromTwseProxy();
    if (live && (!lastLive || live.sourceTime >= lastLive.sourceTime)) {
      lastLive = live;
      paint(live);
      return;
    }
    if (lastLive) {
      paint({ ...lastLive, label:'TWSE 盤中即時' });
      return;
    }
    const backup = await fromRawGithub();
    if (backup) paint(backup);
  }

  function protectLiveValue() {
    const value = document.getElementById('taiex');
    const info = document.getElementById('taiexChg');
    if (!value || !info) return;
    const obs = new MutationObserver(() => {
      if (repainting || !lastLive) return;
      const expected = F(lastLive.price);
      if (value.textContent !== expected || !info.textContent.includes('TWSE 盤中')) paint(lastLive);
    });
    obs.observe(value, { childList:true, characterData:true, subtree:true });
    obs.observe(info, { childList:true, characterData:true, subtree:true });
  }

  function boot() {
    protectLiveValue();
    refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, INTERVAL);
    window.__TW_TAIEX_CONTROLLER__ = { enabled:true, interval:INTERVAL, version:'078', primary:'TWSE MIS via CORS proxy', fallback:'GitHub live snapshot', monotonic:true };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
