/* 記帳簿 體驗版：以頁內模擬伺服器取代 Google Apps Script。
 * - 所有資料只存在記憶體，重新整理即重設；不讀寫真正的 localStorage（即使與正式版同一網域也不會互相影響）
 * - 示範數據全部虛構
 * 由 tools/build_demo.py 嵌入 demo.html，請勿直接載入 */
(() => {
  // ---- 記憶體儲存：取代 localStorage／sessionStorage ----
  const memStore = () => {
    const m = new Map();
    return {
      getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
      setItem: (k, v) => { m.set(String(k), String(v)); },
      removeItem: k => { m.delete(String(k)); },
      clear: () => m.clear(),
      key: i => [...m.keys()][i] ?? null,
      get length() { return m.size; }
    };
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    try { Object.defineProperty(window, name, { value: memStore(), configurable: true }); } catch (e) {}
  }

  const BASE = 'https://demo.invalid/exec';
  localStorage.setItem('expenseCfg', JSON.stringify({ url: BASE, token: 'demo', sheetUrl: '' }));

  // ---- 工具 ----
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const r2 = n => Math.round(n * 100) / 100;
  const now = new Date(), today = ymd(now), thisYm = today.slice(0, 7);
  let seed = 20261124;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const uid = () => 'm' + Math.random().toString(36).slice(2, 10);

  // ---- 示範數據 ----
  const R = [];
  const add = (date, section, item, amount, remark = '', extra = {}) => {
    const amt = r2(amount);
    R.push({ id: uid(), date, section, item, amount: amt, remark, createdAt: `${date}T${pad(1 + Math.floor(rnd() * 13))}:${pad(Math.floor(rnd() * 60))}:00.000Z`,
      fixedId: '', currency: 'HKD', fxRate: 1, origAmount: amt, trip: '', ...extra });
  };
  const startYm = ymd(new Date(now.getFullYear(), now.getMonth() - 6, 1)).slice(0, 7);
  const FIXED = [
    { id: 'fx1', item: '保險', amount: 1280, remark: '人壽保險', startYm, active: true, history: '', cycle: 'M' },
    { id: 'fx2', item: '月票', amount: 500, remark: '港鐵月票', startYm, active: true, history: '', cycle: 'M' },
    { id: 'fx3', item: '電話費', amount: 198, remark: '手機月費', startYm, active: true, history: '', cycle: 'M' },
    { id: 'fx4', item: '上網', amount: 168, remark: '家居寬頻', startYm, active: true, history: '', cycle: 'M' },
    { id: 'fx5', item: '訂閱', amount: 78, remark: '串流影音', startYm, active: true, history: '2026-08: 68→78', cycle: 'M' }
  ];
  const MEALS = { 早餐: [['茶餐廳', 32, 45], ['麥當勞', 28, 40], ['便利店', 18, 30]],
    午餐: [['大快活', 48, 68], ['米線店', 52, 70], ['日式定食', 75, 110], ['公司飯堂', 38, 50]],
    晚餐: [['壽司店', 120, 220], ['火鍋', 180, 320], ['家常小炒', 70, 120], ['拉麵店', 85, 120]] };
  for (let k = 5; k >= 0; k--) {
    const first = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const last = k === 0 ? now.getDate() : dim;
    FIXED.forEach(f => add(ymd(first), '固定', f.item, f.amount, f.remark, { fixedId: f.id }));
    for (let d = 1; d <= last; d++) {
      const date = ymd(new Date(first.getFullYear(), first.getMonth(), d)), wk = new Date(first.getFullYear(), first.getMonth(), d).getDay();
      const meal = (it, p) => { if (rnd() < p) { const [rm, a, b] = pick(MEALS[it]); add(date, '日常', it, between(a, b), rm); } };
      meal('早餐', 0.55); meal('午餐', wk > 0 && wk < 6 ? 0.9 : 0.5); meal('晚餐', 0.6);
      if (rnd() < 0.4) add(date, '日常', '飲品', between(18, 38), pick(['手搖茶', '咖啡店', '']));
      if (rnd() < 0.25) add(date, '日常', '交通', between(12, 60), pick(['的士', '小巴', '']));
      if (rnd() < 0.12) add(date, '日常', '零食', between(15, 45), '');
      if (rnd() < 0.08) add(date, '日常', '日用品', between(40, 160), pick(['超市', '藥房']));
      if (rnd() < 0.07) add(date, '其他', pick(['衣服', '娛樂', '補充品', '醫療', '禮物']), between(120, 680), pick(['', '網購', '生日禮物']));
    }
  }
  // 旅程：兩個月前 5 日東京，機票出發前 40 日購買
  const tS = new Date(now.getFullYear(), now.getMonth() - 2, 10), tE = new Date(tS.getFullYear(), tS.getMonth(), 14);
  const TRIP = '東京 5 日遊', RATE = 0.051;
  const TRIPS = [{ name: TRIP, start: ymd(tS), end: ymd(tE), currency: 'JPY', note: '' }];
  add(ymd(new Date(tS.getTime() - 40 * 864e5)), '旅遊', '機票', 3280, '航空公司', { trip: TRIP });
  const jp = (d, item, yen, rm) => add(ymd(new Date(tS.getFullYear(), tS.getMonth(), d)), '旅遊', item, yen * RATE, rm, { currency: 'JPY', fxRate: RATE, origAmount: yen, trip: TRIP });
  jp(10, '酒店', 68000, '新宿酒店 4 晚'); jp(10, '交通', 3200, '機場快線'); jp(11, '餐飲', 4800, '壽司'); jp(11, '門票', 3600, '展覽館');
  jp(12, '購物', 15800, '電器'); jp(12, '餐飲', 2900, '拉麵'); jp(13, '餐飲', 6200, '燒肉'); jp(13, '交通', 1800, '地鐵'); jp(14, '購物', 8400, '手信');

  // 分帳：上星期五打邊爐（我先付，已結算，阿明已還）
  const spD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3), spDate = ymd(spD);
  const SPLITS = [{ id: 'spdemo1', name: '週五打邊爐', date: spDate, currency: 'HKD', fxRate: 1, trip: '', status: 'settled',
    settledAt: new Date(Date.now() - 2 * 864e5).toISOString(), updatedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
    data: { people: ['我', '阿明', '小美', '阿傑'], done: { '阿明|我|32000': true }, unit: 100,
      expenses: [{ id: 'e1', desc: '火鍋', amt: '1,280', payer: '我', mode: 'eq', inc: {}, w: {}, x: {}, sec: '日常', item: '晚餐' }],
      transfers: [{ from: '阿明', to: '我', amt: 32000, done: true }, { from: '小美', to: '我', amt: 32000, done: false }, { from: '阿傑', to: '我', amt: 32000, done: false }] } }];
  add(spDate, '日常', '晚餐', 320, 'AA：週五打邊爐·火鍋', { id: 'spdemo1_e1', splitId: 'spdemo1' });
  const ITEMS = {};
  const SETTINGS = { 'budget.var': 6500, 'budget.total': 9000 };
  const hh = h => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 12).toISOString();
  const INBOX = [
    { id: 'ib1', ts: hh(12), source: '信用卡 8166', merchant: 'WECHAT PAY HONG KONG', currency: 'HKD', origAmount: 68.5, amount: 68.5, date: today,
      raw: '（示範）您的信用卡 8166 在 "WECHAT PAY HONG KONG" 有一項簽賬，金額為 HKD 68.50。', suggest: { section: '日常', item: '@meal', remark: '', generic: true } },
    { id: 'ib2', ts: hh(9), source: '信用卡 0015', merchant: 'ACME COFFEE ROASTERS', currency: 'HKD', origAmount: 42, amount: 42, date: today,
      raw: '（示範）您的信用卡 0015 於今日在 ACME COFFEE ROASTERS 交易 HKD42.00。', suggest: { section: '日常', item: '@meal', remark: 'ACME COFFEE ROASTERS' } }
  ];
  const MERCH = [{ merchant: 'HK TRAVEL AGENCY', section: '旅遊', item: '機票', remark: '旅行社', mode: 'auto', count: 2 }];
  const mealOf = iso => { const h = new Date(iso).getHours(); return h >= 5 && h < 11 ? '早餐' : h < 16 ? '午餐' : h >= 17 && h < 23 ? '晚餐' : '零食'; };

  // ---- 模擬 API ----
  const get = p => {
    switch (p.action) {
      case 'splits': return { rows: SPLITS };
      case 'info': return { sheetUrl: '', version: 8, lastBackup: new Date(Date.now() - 2 * 864e5).toISOString(), serverTime: new Date().toISOString(), signal: false, lastWatchdog: new Date(Date.now() - 20 * 60000).toISOString(), notifyQueue: 0 };
      case 'list': return { rows: R.filter(r => r.date.slice(0, 7) === p.month) };
      case 'fixed': return { rows: FIXED };
      case 'items': return { items: ITEMS };
      case 'settings': return { settings: SETTINGS };
      case 'summary': {
        const months = {};
        R.forEach(r => { const m = r.date.slice(0, 7); if (m < p.from || m > p.to) return; const o = months[m] = months[m] || { _n: 0 }; o[r.section] = (o[r.section] || 0) + r.amount; o._n++; });
        return { months };
      }
      case 'search': {
        const q = String(p.q || '').toLowerCase(), from = p.from || '0000-00';
        const hit = R.filter(r => r.date.slice(0, 7) >= from && [r.section, r.item, r.remark].some(x => String(x).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
        return { rows: hit.slice(0, 300), count: hit.length, total: hit.reduce((a, r) => a + r.amount, 0) };
      }
      case 'inbox': return { rows: INBOX };
      case 'merchants': return { rows: MERCH };
      case 'trips': {
        const map = {};
        TRIPS.forEach(t => map[t.name] = { ...t, total: 0, count: 0, byItem: {}, byCur: {} });
        R.forEach(r => { if (!r.trip) return; const t = map[r.trip] = map[r.trip] || { name: r.trip, start: '', end: '', currency: '', total: 0, count: 0, byItem: {}, byCur: {} };
          t.total += r.amount; t.count++; t.byItem[r.item] = (t.byItem[r.item] || 0) + r.amount; if (r.currency !== 'HKD') t.byCur[r.currency] = (t.byCur[r.currency] || 0) + r.origAmount; });
        return { trips: Object.values(map).sort((a, b) => String(b.start).localeCompare(String(a.start))) };
      }
    }
    throw new Error('unknown action');
  };
  const post = b => {
    const find = id => R.find(r => r.id === id);
    switch (b.action) {
      case 'add': {
        if (find(b.id)) return { dup: true };
        let fixedId = '';
        if (b.section === '固定') { fixedId = uid(); FIXED.push({ id: fixedId, item: b.item, amount: b.amount, remark: b.remark || '', startYm: b.date.slice(0, 7), active: true, history: '', cycle: b.cycle === 'Y' ? 'Y' : 'M' }); }
        R.push({ id: b.id, date: b.date, section: b.section, item: b.item, amount: Number(b.amount), remark: b.remark || '', createdAt: new Date().toISOString(), fixedId,
          currency: b.currency || 'HKD', fxRate: Number(b.fxRate) || 1, origAmount: Number(b.origAmount ?? b.amount), trip: b.trip || '' });
        return {};
      }
      case 'updateRecord': { const r = find(b.id); if (!r) throw new Error('找不到此紀錄'); Object.assign(r, { date: b.date, item: b.item, amount: Number(b.amount), remark: b.remark || '', currency: b.currency, fxRate: Number(b.fxRate), origAmount: Number(b.origAmount), trip: b.trip ?? r.trip }); if (!r.fixedId) r.section = b.section; return {}; }
      case 'deleteRecord': { const i = R.findIndex(r => r.id === b.id); if (i >= 0) R.splice(i, 1); return {}; }
      case 'updateFixed': {
        const f = FIXED.find(x => x.id === b.id); if (!f) throw new Error('找不到固定項目');
        if (f.amount !== Number(b.amount)) f.history = (f.history ? f.history + '; ' : '') + `${thisYm}: ${f.amount}→${b.amount}`;
        Object.assign(f, { amount: Number(b.amount), remark: b.remark || '' }); if (b.cycle) f.cycle = b.cycle;
        if (b.applyThisMonth) R.forEach(r => { if (r.fixedId === b.id && r.date.slice(0, 7) === thisYm) Object.assign(r, { amount: f.amount, origAmount: f.amount, remark: f.remark }); });
        return {};
      }
      case 'toggleFixed': { const f = FIXED.find(x => x.id === b.id); if (f) f.active = !!b.active; return {}; }
      case 'saveItems': { if (b.items && b.items.length) ITEMS[b.section] = b.items; else delete ITEMS[b.section]; return {}; }
      case 'saveSettings': { Object.entries(b.settings || {}).forEach(([k, v]) => { if (v === '' || v == null) delete SETTINGS[k]; else SETTINGS[k] = v; }); return {}; }
      case 'confirmInbox': {
        const i = INBOX.findIndex(x => x.id === b.id); if (i < 0) throw new Error('此通知已處理');
        const x = INBOX.splice(i, 1)[0], item = b.item === '@meal' ? mealOf(x.ts) : b.item;
        R.push({ id: x.id, date: b.date || x.date, section: b.section, item, amount: x.amount, remark: b.remark || '', createdAt: new Date().toISOString(), fixedId: '', currency: x.currency, fxRate: 1, origAmount: x.origAmount, trip: '' });
        if ((b.remember === 'auto' || b.remember === 'ask') && !x.suggest.generic) MERCH.push({ merchant: x.merchant.toUpperCase(), section: b.section, item: b.item, remark: b.remark || '', mode: b.remember, count: 0 });
        return { item };
      }
      case 'dismissInbox': {
        const i = INBOX.findIndex(x => x.id === b.id); if (i < 0) return {};
        const x = INBOX.splice(i, 1)[0];
        if (b.remember === 'ignore' && !x.suggest.generic) MERCH.push({ merchant: x.merchant.toUpperCase(), section: '', item: '', remark: '', mode: 'ignore', count: 0 });
        return {};
      }
      case 'saveRule': { const m = MERCH.find(x => x.merchant === b.merchant); if (m) m.mode = b.mode; return {}; }
      case 'deleteRule': { const i = MERCH.findIndex(x => x.merchant === b.merchant); if (i >= 0) MERCH.splice(i, 1); return {}; }
      case 'saveTrip': {
        const old = b.oldName || b.name, t = TRIPS.find(x => x.name === old);
        if (old !== b.name && TRIPS.some(x => x.name === b.name)) throw new Error('已有同名旅程');
        const v = { name: b.name, start: b.start, end: b.end, currency: b.currency || '', note: '' };
        if (t) Object.assign(t, v); else TRIPS.push(v);
        if (old !== b.name) R.forEach(r => { if (r.trip === old) r.trip = b.name; });
        return {};
      }
      case 'saveSplit': {
        const sp = b.split, i = SPLITS.findIndex(x => x.id === sp.id);
        if (i >= 0) SPLITS[i] = sp; else SPLITS.push(sp);
        const want = Object.fromEntries((b.records || []).map(x => [x.id, x]));
        for (let k = R.length - 1; k >= 0; k--) { const r = R[k]; if (r.splitId !== sp.id) continue; if (!want[r.id]) R.splice(k, 1); else { Object.assign(r, want[r.id]); delete want[r.id]; } }
        Object.values(want).forEach(x => R.push({ ...x, createdAt: new Date().toISOString(), fixedId: '', splitId: sp.id }));
        return {};
      }
      case 'deleteSplit': {
        const i = SPLITS.findIndex(x => x.id === b.id); if (i >= 0) SPLITS.splice(i, 1);
        for (let k = R.length - 1; k >= 0; k--) if (R[k].splitId === b.id) R.splice(k, 1);
        return {};
      }
      case 'deleteTrip': { const i = TRIPS.findIndex(x => x.name === b.name); if (i >= 0) TRIPS.splice(i, 1); return {}; }
    }
    throw new Error('unknown action');
  };

  // ---- 攔截網絡請求 ----
  const json = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://open.er-api.com/')) // 示範用固定匯率（1 HKD = ? 外幣）
      return json({ result: 'success', rates: { HKD: 1, JPY: 19.6, CNY: 0.92, USD: 0.1285, TWD: 4.15, KRW: 178, THB: 4.4, SGD: 0.17, MYR: 0.57, MOP: 1.03, EUR: 0.118, GBP: 0.1, AUD: 0.196, CAD: 0.18, NZD: 0.215, CHF: 0.108, VND: 3300, PHP: 7.4, IDR: 2050 } });
    if (!url.startsWith(BASE)) return realFetch(input, init);
    await new Promise(r => setTimeout(r, 200 + Math.random() * 250)); // 模擬網絡延遲
    try {
      const isPost = String(init.method || 'GET').toUpperCase() === 'POST';
      return json({ ok: true, ...(isPost ? post(JSON.parse(init.body)) : get(Object.fromEntries(new URL(url).searchParams))) });
    } catch (e) { return json({ ok: false, error: e.message }); }
  };
})();
