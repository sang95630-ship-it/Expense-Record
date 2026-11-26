/**** 記帳簿 後端：貼到 Google Sheet → 擴充功能 → Apps Script ****/
// TOKEN 不再寫在程式碼內：請到「專案設定 → 指令碼屬性」新增屬性 TOKEN（值 = 你的密碼）。
// 之後更新 Code.gs 可直接整份貼上；更換 TOKEN 只需改屬性值，毋須重新部署。
const API_VERSION = 12;            // 前端用來檢查 Code.gs 是否已更新
const BACKUP_FOLDER = '記帳簿備份'; // Google Drive 備份資料夾名稱
const BACKUP_KEEP = 8;            // 保留最近 8 份（約 2 個月）
const REC = 'Records', FIX = 'Fixed', ITEMS = 'Items', SETTINGS = 'Settings', INBOX = 'Inbox', MERCH = 'Merchants';
const WD_IDLE_DAYS = 3;           // 看門狗：連續 N 日沒有新增紀錄便提醒
const WD_INBOX_DAYS = 3;          // 看門狗：通知轉發器 N 日沒有回報便提醒（第 5 期啟用）
// Amount 一律為港幣；外幣支出另記 Currency / FxRate（1 外幣 = ? HKD）/ OrigAmount（原幣金額）
// Trip：旅程名稱（旅遊支出可標記所屬旅程，例如機票可在出發前購買）
const REC_HEAD = ['ID', 'Date', 'Section', 'Item', 'Amount', 'Remark', 'CreatedAt', 'FixedID', 'Currency', 'FxRate', 'OrigAmount', 'Trip', 'SplitID'];
// Cycle：M = 每月、Y = 每年（於 StartYm 的月份入帳）
const FIX_HEAD = ['ID', 'Item', 'Amount', 'Remark', 'StartYm', 'Active', 'UpdatedAt', 'History', 'Cycle'];
// 自訂快選項目；某 Section 沒有任何列時，前端使用內建預設
const ITEMS_HEAD = ['Section', 'Item', 'Emoji', 'Order'];
// 鍵值設定，例如 budget.total／budget.日常（每月預算，HKD）
const SETTINGS_HEAD = ['Key', 'Value'];
// 通知自動記帳：Inbox 收件（Status：pending／auto／confirmed／dismissed／ignored／skip）；Merchants 商戶規則（Mode：auto／ask／ignore）
const INBOX_HEAD = ['ID', 'ReceivedAt', 'Source', 'Raw', 'Merchant', 'Currency', 'OrigAmount', 'Amount', 'TxDate', 'Status', 'RecordID', 'Suggest'];
const MERCH_HEAD = ['Merchant', 'Section', 'Item', 'Remark', 'Mode', 'Count', 'UpdatedAt'];
const TRIPS = 'Trips', TRIPS_HEAD = ['Name', 'Start', 'End', 'Currency', 'Note']; // Start／End 為純文字 yyyy-MM-dd
const SPLITS = 'Splits', SPLITS_HEAD = ['ID', 'Name', 'Date', 'Currency', 'FxRate', 'Trip', 'Status', 'Data', 'UpdatedAt', 'SettledAt']; // 分帳（第 6 期）
const SPLIT_REMIND_DAYS = 3;       // 分帳確認後 N 日仍有轉帳未清 → Signal 提醒一次
const MEAL = '@meal'; // 舊規則的「按時間」項目：早／午／晚餐已合併為「餐飲」
const LEGACY_MEAL = ['早餐', '午餐', '晚餐'];
function normItem_(sec, item) { return sec === '日常' && LEGACY_MEAL.indexOf(String(item)) >= 0 ? '餐飲' : String(item); }

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function fmt_(d, p) { return Utilities.formatDate(d, tz_(), p); }
function ymd_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM-dd') : String(v).slice(0, 10); }
function ym_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM') : String(v).slice(0, 7); }
/** 舊表自動補上新增的欄位標題（Currency / FxRate / OrigAmount） */
function ensureRecHead_() {
  const sh = sheet_(REC);
  if (sh.getLastColumn() < REC_HEAD.length) sh.getRange(1, 1, 1, REC_HEAD.length).setValues([REC_HEAD]);
}
function ensureFixHead_() {
  const sh = sheet_(FIX);
  if (sh.getLastColumn() < FIX_HEAD.length) sh.getRange(1, 1, 1, FIX_HEAD.length).setValues([FIX_HEAD]);
}
function props_() { return PropertiesService.getScriptProperties(); }
function token_() {
  const t = props_().getProperty('TOKEN');
  if (!t || t.length < 16) throw new Error('伺服器未設定 TOKEN（指令碼屬性，至少 16 個字元）');
  return t;
}
function settings_() {
  const sh = sheet_(SETTINGS), o = {};
  if (sh) sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) o[r[0]] = r[1]; });
  return o;
}
/* ============ 伺服器快取（D）：Records 整表讀取結果存於 CacheService ============
 * 以「世代」防止讀寫競爭：任何寫入（doPost、monthlyJob、手動修改 Sheet 的 onEdit）都換一個新世代，
 * 舊世代的快取即作廢；讀取時世代不符一律重讀 Sheet。值分段存放（每段 ≤ 30,000 字元，中文 UTF-8 亦在 100KB 上限內） */
const RC_GEN = 'rec_gen', RC_TTL = 21600, RC_CHUNK = 30000;
function recRows_() {
  const c = CacheService.getScriptCache();
  let gen = c.get(RC_GEN);
  if (gen) {
    const meta = c.get('rec_' + gen);
    if (meta) {
      const keys = []; for (let i = 0; i < Number(meta); i++) keys.push('rec_' + gen + '_' + i);
      const got = c.getAll(keys);
      if (keys.every(k => got[k] != null)) { try { return JSON.parse(keys.map(k => got[k]).join('')); } catch (e) {} }
    }
  } else { gen = Utilities.getUuid().slice(0, 8); c.put(RC_GEN, gen, RC_TTL); }
  // 日期欄轉為文字（JSON 會把 Date 轉成 UTC，令日期差一日）
  const rows = rows_(REC).filter(r => r[0]).map(r => r.map((v, i) => v instanceof Date ? (i === 1 ? ymd_(v) : v.toISOString()) : v));
  try {
    const str = JSON.stringify(rows), parts = {}; let n = 0;
    for (let i = 0; i < str.length; i += RC_CHUNK) parts['rec_' + gen + '_' + (n++)] = str.slice(i, i + RC_CHUNK);
    c.putAll(parts, RC_TTL); c.put('rec_' + gen, String(n), RC_TTL);
  } catch (e) {} // 快取失敗不影響結果
  return rows;
}
function dropRecCache_() { try { CacheService.getScriptCache().put(RC_GEN, Utilities.getUuid().slice(0, 8), RC_TTL); } catch (e) {} }
// 簡單觸發器：在 Google Sheet 手動修改任何儲存格後，令伺服器快取失效
function onEdit() { dropRecCache_(); }

function sheet_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function rows_(n) { return sheet_(n).getDataRange().getValues().slice(1); }
function isOn_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

/** 首次執行一次：建立工作表 + 每月 1 號凌晨 1 時的 trigger */
function setup() {
  const ss = SpreadsheetApp.getActive();
  [[REC, REC_HEAD], [FIX, FIX_HEAD], [ITEMS, ITEMS_HEAD], [SETTINGS, SETTINGS_HEAD], [INBOX, INBOX_HEAD], [MERCH, MERCH_HEAD], [TRIPS, TRIPS_HEAD], [SPLITS, SPLITS_HEAD]].forEach(([n, h]) => {
    const sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if (sh.getLastRow() === 0) { sh.appendRow(h); sh.setFrozenRows(1); }
  });
  ensureRecHead_(); ensureFixHead_();
  sheet_(REC).getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sheet_(FIX).getRange('E:E').setNumberFormat('@'); // 防止 2026-11 被轉成日期
  sheet_(TRIPS).getRange('B:C').setNumberFormat('@');
  sheet_(SPLITS).getRange('C:C').setNumberFormat('@'); sheet_(SPLITS).getRange('J:J').setNumberFormat('@');
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monthlyJob').timeBased().onMonthDay(1).atHour(1).create();
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  ScriptApp.newTrigger('watchdog').timeBased().everyHours(1).create();
  if (!props_().getProperty('TOKEN')) Logger.log('⚠️ 尚未設定 TOKEN：專案設定 → 指令碼屬性 → 新增 TOKEN');
}

/** 每週日凌晨 3 時：把所有工作表複製成新試算表，放入 Drive「記帳簿備份」資料夾，保留最近 8 份。可手動執行作即時備份。
 *  只複製資料（不複製 Apps Script），備份檔不含 TOKEN。 */
function weeklyBackup() {
  const ss = SpreadsheetApp.getActive();
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const bk = SpreadsheetApp.create('記帳簿備份 ' + fmt_(new Date(), 'yyyy-MM-dd HHmm'));
  bk.setSpreadsheetTimeZone(tz_());
  const blank = bk.getSheets()[0];
  ss.getSheets().forEach(sh => sh.copyTo(bk).setName(sh.getName()));
  bk.deleteSheet(blank);
  DriveApp.getFileById(bk.getId()).moveTo(folder);
  // 清理舊備份
  const files = [];
  const fi = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (fi.hasNext()) files.push(fi.next());
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(BACKUP_KEEP).forEach(f => f.setTrashed(true));
  props_().setProperty('LAST_BACKUP', new Date().toISOString());
  return bk.getUrl();
}

/** 每月 1 號：把所有「啟用中」固定項目寫入本月（年繳項目只在起始月份的同月入帳）。回傳新增筆數。 */
function monthlyJob() {
  dropRecCache_(); // 固定項目入帳會改動 Records
  const rec = sheet_(REC), ym = fmt_(new Date(), 'yyyy-MM');
  const done = new Set(rows_(REC).filter(r => r[7] && ym_(r[1]) === ym).map(r => r[7]));
  const due = r => String(r[8] || 'M') !== 'Y' || ym_(r[4]).slice(5) === ym.slice(5);
  const add = rows_(FIX)
    .filter(r => r[0] && isOn_(r[5]) && ym_(r[4]) < ym && !done.has(r[0]) && due(r))
    .map(r => [Utilities.getUuid(), ym + '-01', '固定', r[1], Number(r[2]), r[3], new Date(), r[0], 'HKD', 1, Number(r[2])]);
  if (add.length) {
    ensureRecHead_();
    rec.getRange(rec.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
    const total = add.reduce((a, r) => a + r[4], 0);
    notify_(`📌 ${Number(ym.slice(5))}月固定支出已入帳 ${add.length} 項，合計 HK$ ${total.toLocaleString('en-US')}`);
  }
  props_().setProperty('LAST_MONTHLY', ym);
  return add.length;
}

/** 預算提醒：每個（類別, 月份, 門檻）只發一次 */
function budgetCheck_(ym) {
  const st = settings_(), budgets = Object.keys(st).filter(k => /^budget\./.test(k) && Number(st[k]) > 0);
  if (!budgets.length) return;
  const spent = { total: 0 };
  rows_(REC).forEach(r => { if (r[0] && ym_(r[1]) === ym) { spent[r[2]] = (spent[r[2]] || 0) + Number(r[4]); spent.total += Number(r[4]); } });
  spent.var = spent.total - (spent['固定'] || 0); // 可控消費 = 日常＋旅遊＋其他
  const p = props_(), done = JSON.parse(p.getProperty('BUDGET_SENT') || '{}');
  Object.keys(done).forEach(k => { if (k.indexOf(ym) < 0) delete done[k]; }); // 只保留本月
  budgets.forEach(k => {
    const sec = k.slice(7), b = Number(st[k]), used = spent[sec] || 0, pct = used / b;
    [1, 0.8].some(th => {
      if (pct < th) return false;
      const key = `${sec}|${ym}|${th}`;
      if (!done[key]) {
        done[key] = 1; if (th === 1) done[`${sec}|${ym}|0.8`] = 1;
        notify_(`${th === 1 ? '⛔' : '⚠️'} 記帳簿：${sec === 'total' ? '總支出' : sec === 'var' ? '可控消費' : sec}本月已用 HK$ ${Math.round(used).toLocaleString('en-US')}／預算 HK$ ${b.toLocaleString('en-US')}（${Math.round(pct * 100)}%）`);
      }
      return true;
    });
  });
  p.setProperty('BUDGET_SENT', JSON.stringify(done));
}

/* ---------- Signal 通知（CallMeBot）---------- */
// 指令碼屬性：SIGNAL_UUID（Bot 回覆網址中 36 字元 UUID）、SIGNAL_APIKEY。未設定則不發送。
function signalReady_() { const p = props_(); return !!(p.getProperty('SIGNAL_UUID') && p.getProperty('SIGNAL_APIKEY')); }
function sendSignal_(text) {
  const p = props_();
  const url = 'https://signal.callmebot.com/signal/send.php?phone=' + encodeURIComponent(p.getProperty('SIGNAL_UUID')) +
    '&apikey=' + encodeURIComponent(p.getProperty('SIGNAL_APIKEY')) + '&text=' + encodeURIComponent(text);
  if (url.length > 2000) throw new Error('訊息過長');
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const body = res.getContentText();
  // CallMeBot 出錯亦回 HTTP 200，須同時檢查內容
  return res.getResponseCode() === 200 && /sent|queued|apikey correct/i.test(body) && !/error|invalid/i.test(body);
}
/** 發送 Signal；失敗放入佇列（最多 20 條），由看門狗每小時補發 */
function notify_(text) {
  if (!signalReady_()) { Logger.log('Signal 未設定：' + text); return false; }
  let ok = false;
  try { ok = sendSignal_(text); } catch (e) { Logger.log(e); }
  if (!ok) {
    const q = JSON.parse(props_().getProperty('NOTIFY_QUEUE') || '[]');
    q.push(text); props_().setProperty('NOTIFY_QUEUE', JSON.stringify(q.slice(-20)));
  }
  return ok;
}
function flushNotify_() {
  const q = JSON.parse(props_().getProperty('NOTIFY_QUEUE') || '[]');
  if (!q.length || !signalReady_()) return;
  const left = [];
  q.forEach(t => { let ok = false; try { ok = sendSignal_(t); } catch (e) {} if (!ok) left.push(t); Utilities.sleep(1500); });
  props_().setProperty('NOTIFY_QUEUE', JSON.stringify(left));
}
/** 手動執行：測試 Signal 通知 */
function testSignal() { Logger.log(notify_('✅ 記帳簿 Signal 通知測試成功') ? '已發送' : '發送失敗，請檢查 SIGNAL_UUID／SIGNAL_APIKEY'); }

/** 看門狗（每小時）：同類警告每日最多一則 */
function watchdog() {
  const p = props_(), now = new Date(), today = fmt_(now, 'yyyy-MM-dd'), ym = fmt_(now, 'yyyy-MM');
  const hour = Number(fmt_(now, 'H')), day = Number(fmt_(now, 'd'));
  const sent = JSON.parse(p.getProperty('WD_SENT') || '{}');
  const alert = (key, msg) => { if (sent[key] === today) return; sent[key] = today; notify_('⚠️ 記帳簿：' + msg); };
  // 1. 固定支出：1 號 03:00 後本月仍未執行 → 自動補跑
  if ((day > 1 || hour >= 3) && p.getProperty('LAST_MONTHLY') !== ym) {
    try { const n = monthlyJob(); if (n) alert('monthly', `本月固定支出未有自動入帳，看門狗已補入 ${n} 項`); }
    catch (e) { alert('monthly', '固定支出自動入帳失敗：' + e.message); }
  }
  // 2. 備份：超過 8 日未有成功備份
  const lb = p.getProperty('LAST_BACKUP');
  if (!lb || now - new Date(lb) > 8 * 864e5) alert('backup', '超過 8 日未有成功備份，請在 Apps Script 手動執行 weeklyBackup 檢查');
  // 3. 記帳習慣：每晚 9 時檢查，連續 N 日沒有新增紀錄（不計固定項目自動入帳）
  if (hour === 21) {
    const last = rows_(REC).filter(r => r[0] && !r[7] && r[6] && r[6].getTime).reduce((m, r) => Math.max(m, r[6].getTime()), 0);
    if (last && now - last > WD_IDLE_DAYS * 864e5) alert('idle', `已 ${Math.floor((now - last) / 864e5)} 日沒有記帳，記得補記`);
  }
  // 4. 通知轉發器（第 5 期）：曾經回報過，但 N 日沒有再回報
  const inbox = p.getProperty('INBOX_LAST');
  if (inbox && now - new Date(inbox) > WD_INBOX_DAYS * 864e5) alert('inbox', `手機通知轉發器已 ${WD_INBOX_DAYS} 日沒有回報，請檢查 Tasker 是否被系統關閉`);
  // 5. 預算：09:00–22:00 檢查，本月用量達 80%／100% 各提醒一次
  if (hour >= 9 && hour <= 22) budgetCheck_(ym);
  // 6. 分帳催收（第 6 期）：確認後 N 日仍有轉帳未清，每個活動提醒一次
  if (hour >= 9 && hour <= 22) splitCheck_(now);
  flushNotify_();
  p.setProperty('WD_SENT', JSON.stringify(sent));
  p.setProperty('LAST_WATCHDOG', now.toISOString());
}

function doGet(e) {
  const p = e.parameter;
  return handle_(p, () => {
    if (p.action === 'info' && p.fresh === '1') dropRecCache_(); // 手動同步：一併清除伺服器快取
    if (p.action === 'info') return { sheetUrl: SpreadsheetApp.getActive().getUrl(), version: API_VERSION,
      lastBackup: props_().getProperty('LAST_BACKUP') || '', serverTime: new Date().toISOString(),
      signal: signalReady_(), lastWatchdog: props_().getProperty('LAST_WATCHDOG') || '',
      notifyQueue: JSON.parse(props_().getProperty('NOTIFY_QUEUE') || '[]').length, inboxLast: props_().getProperty('INBOX_LAST') || '' };
    if (p.action === 'list') return { rows: recRows_().filter(r => r[0] && ym_(r[1]) === p.month).map(recObj_) };
    if (p.action === 'fixed') return { rows: rows_(FIX).filter(r => r[0]).map(fixObj_) };
    if (p.action === 'settings') return { settings: settings_() };
    if (p.action === 'trips') {
      // 旅程定義 + 統計（合計、筆數、按項目、按原幣），包括只在紀錄中出現的旅程名稱
      const map = {};
      trips_().forEach(t => map[t.name] = Object.assign(t, { total: 0, count: 0, byItem: {}, byCur: {}, first: '', last: '' }));
      recRows_().forEach(r => {
        const n = String(r[11] || ''); if (!r[0] || !n) return;
        const t = map[n] = map[n] || { name: n, start: '', end: '', currency: '', note: '', total: 0, count: 0, byItem: {}, byCur: {}, first: '', last: '' };
        const amt = Number(r[4]), cur = String(r[8] || 'HKD'), d = ymd_(r[1]);
        t.total += amt; t.count++; const it = normItem_(r[2], r[3]); t.byItem[it] = (t.byItem[it] || 0) + amt;
        if (cur !== 'HKD') t.byCur[cur] = (t.byCur[cur] || 0) + Number(r[10] || 0);
        if (!t.first || d < t.first) t.first = d; if (!t.last || d > t.last) t.last = d;
      });
      return { trips: Object.keys(map).map(k => map[k]).sort((a, b) => String(b.start || b.first).localeCompare(String(a.start || a.first))) };
    }
    if (p.action === 'inbox') {
      const sh = sheet_(INBOX); if (!sh) return { rows: [] };
      const rows = sh.getDataRange().getValues().slice(1).filter(r => r[9] === 'pending').slice(-100).map(r => ({
        id: r[0], ts: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), source: r[2], raw: r[3], merchant: r[4],
        currency: r[5], origAmount: Number(r[6]), amount: Number(r[7]), date: ymd_(r[8]), suggest: JSON.parse(r[11] || '{}')
      }));
      return { rows };
    }
    if (p.action === 'inboxLog') { // 最近收到的轉發（任何狀態），供前端檢查轉發器及解析是否正常（API_VERSION 12）
      const sh = sheet_(INBOX); if (!sh) return { rows: [] };
      return { rows: sh.getDataRange().getValues().slice(1).slice(-15).reverse().map(r => ({
        ts: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), source: String(r[2] || ''), raw: String(r[3] || '').slice(0, 120),
        merchant: String(r[4] || ''), amount: Number(r[7]) || 0, status: String(r[9] || '') })) };
    }
    if (p.action === 'merchants') {
      const sh = sheet_(MERCH); if (!sh) return { rows: [] };
      return { rows: sh.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => ({ merchant: r[0], section: r[1], item: r[2], remark: r[3], mode: r[4], count: Number(r[5]) || 0 })) };
    }
    if (p.action === 'summary') {
      // 區間彙總：{ 'yyyy-MM': { 類別: 金額, _n: 筆數 } }
      const months = {};
      recRows_().forEach(r => {
        if (!r[0]) return; const ym = ym_(r[1]); if (ym < p.from || ym > p.to) return;
        const o = months[ym] = months[ym] || { _n: 0 };
        o[r[2]] = (o[r[2]] || 0) + Number(r[4]); o._n++;
      });
      return { months };
    }
    if (p.action === 'search') {
      const q = String(p.q || '').trim().toLowerCase(), from = p.from || '0000-00', off = Math.max(0, Number(p.off) || 0); // off：載入更多（API_VERSION 11）
      // 篩選標籤（API_VERSION 10）：f=[{t:sec|item|trip|text, v}]；不同種類為「且」，同種類為「或」
      let f = []; try { f = JSON.parse(p.f || '[]'); } catch (e) {}
      if (f.length) {
        const by = t => f.filter(x => x && x.t === t).map(x => String(x.v));
        const sec = by('sec'), item = by('item'), trip = by('trip'), text = by('text').map(x => x.toLowerCase());
        const hitF = recRows_().filter(r => r[0] && ym_(r[1]) >= from && (!sec.length || sec.indexOf(String(r[2])) >= 0)
          && (!item.length || item.indexOf(normItem_(r[2], r[3])) >= 0) && (!trip.length || trip.indexOf(String(r[11] || '')) >= 0)
          && text.every(t => [r[2], r[3], r[5]].some(x => String(x).toLowerCase().indexOf(t) >= 0)))
          .map(recObj_).sort((a, b) => b.date.localeCompare(a.date));
        return { rows: hitF.slice(off, off + 300), count: hitF.length, total: hitF.reduce((a, r) => a + r.amount, 0), filtered: true, more: hitF.length > off + 300 };
      }
      if (!q) return { rows: [], count: 0, total: 0 };
      const hit = recRows_().filter(r => r[0] && ym_(r[1]) >= from && [r[2], r[3], r[5]].some(x => String(x).toLowerCase().indexOf(q) >= 0))
        .map(recObj_).sort((a, b) => b.date.localeCompare(a.date));
      return { rows: hit.slice(off, off + 300), count: hit.length, total: hit.reduce((a, r) => a + r.amount, 0), more: hit.length > off + 300 };
    }
    if (p.action === 'export') { // 匯出 CSV（G）：from／to 為 yyyy-MM，可留空
      const from = p.from || '0000-00', to = p.to || '9999-99';
      return { rows: recRows_().filter(r => { const ym = ym_(r[1]); return ym >= from && ym <= to; }).map(recObj_)
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt))) };
    }
    if (p.action === 'splits') return { rows: splits_() };
    if (p.action === 'items') {
      const sh = sheet_(ITEMS), items = {};
      if (sh) sh.getDataRange().getValues().slice(1).filter(r => r[0] && r[1])
        .sort((a, b) => Number(a[3]) - Number(b[3]))
        .forEach(r => (items[r[0]] = items[r[0]] || []).push([String(r[1]), String(r[2] || '•')]));
      return { items };
    }
    throw new Error('unknown action');
  });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); }
  catch (err) { b = e.parameter && e.parameter.action ? e.parameter : null; } // Tasker 可用 application/x-www-form-urlencoded
  if (!b) return json_({ ok: false, error: 'bad request' });
  return handle_(b, () => {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try { return write_(b); } finally { dropRecCache_(); lock.releaseLock(); } // 任何寫入後伺服器快取失效
  });
}

function write_(b) {
  const rec = sheet_(REC), fix = sheet_(FIX);
  const thisYm = fmt_(new Date(), 'yyyy-MM');
  switch (b.action) {
    case 'add': {
      if (findRow_(rec, b.id)) return { dup: true }; // 重送不會重複
      ensureRecHead_();
      const fixedId = b.section === '固定' ? Utilities.getUuid() : '';
      const cur = fixedId ? 'HKD' : String(b.currency || 'HKD').toUpperCase();
      const rate = cur === 'HKD' ? 1 : Number(b.fxRate);
      if (!(rate > 0)) throw new Error('匯率無效');
      const orig = b.origAmount != null && cur !== 'HKD' ? Number(b.origAmount) : Number(b.amount);
      rec.appendRow([b.id, b.date, b.section, b.item, Number(b.amount), b.remark || '', new Date(), fixedId, cur, rate, orig, fixedId ? '' : String(b.trip || '')]);
      if (fixedId) { ensureFixHead_(); fix.appendRow([fixedId, b.item, Number(b.amount), b.remark || '', b.date.slice(0, 7), true, new Date(), '', b.cycle === 'Y' ? 'Y' : 'M']); }
      return {};
    }
    case 'updateRecord': {
      const row = findRow_(rec, b.id);
      if (!row) throw new Error('找不到此紀錄（可能已被刪除）');
      ensureRecHead_();
      const isFixed = !!rec.getRange(row, 8).getValue();
      const cur = isFixed ? 'HKD' : String(b.currency || 'HKD').toUpperCase();
      const rate = cur === 'HKD' ? 1 : Number(b.fxRate);
      if (!(rate > 0)) throw new Error('匯率無效');
      const orig = cur === 'HKD' ? Number(b.amount) : Number(b.origAmount);
      if (!(Number(b.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error('資料無效');
      rec.getRange(row, 2, 1, 5).setValues([[b.date, isFixed ? '固定' : b.section, b.item, Number(b.amount), b.remark || '']]);
      rec.getRange(row, 9, 1, 3).setValues([[cur, rate, orig]]);
      if (b.trip !== undefined) rec.getRange(row, 12).setValue(isFixed ? '' : String(b.trip || ''));
      return {};
    }
    case 'saveItems': {
      let sh = sheet_(ITEMS);
      if (!sh) { sh = SpreadsheetApp.getActive().insertSheet(ITEMS); sh.appendRow(ITEMS_HEAD); sh.setFrozenRows(1); }
      const keep = sh.getDataRange().getValues().slice(1).filter(r => r[0] && r[0] !== b.section);
      const add = (b.items || []).filter(x => x && String(x[0]).trim()).slice(0, 24)
        .map((x, i) => [b.section, String(x[0]).trim().slice(0, 10), String(x[1] || '•').slice(0, 8), i + 1]);
      const all = keep.concat(add);
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ITEMS_HEAD.length).clearContent();
      if (all.length) sh.getRange(2, 1, all.length, ITEMS_HEAD.length).setValues(all);
      return {};
    }
    case 'inbox': return inbox_(b);
    case 'confirmInbox': {
      const ib = sheet_(INBOX), row = findRow_(ib, b.id);
      if (!row) throw new Error('找不到此通知');
      const v = ib.getRange(row, 1, 1, INBOX_HEAD.length).getValues()[0];
      if (v[9] !== 'pending') throw new Error('此通知已處理');
      const ts = v[1] instanceof Date ? v[1] : new Date();
      const item = b.item === MEAL ? mealOf_(ts) : b.item;
      const recId = addRecord_({ id: v[0], date: b.date || ymd_(v[8]), section: b.section, item: item, remark: b.remark || '',
        currency: v[5], origAmount: Number(v[6]), amount: Number(v[7]) });
      ib.getRange(row, 10, 1, 2).setValues([['confirmed', recId]]);
      const key = merchKey_(v[4]);
      if ((b.remember === 'auto' || b.remember === 'ask') && !isGeneric_(key)) upsertRule_(key, b.section, b.item, b.remark || '', b.remember);
      return { item: item };
    }
    case 'dismissInbox': {
      const ib = sheet_(INBOX), row = findRow_(ib, b.id);
      if (row) {
        ib.getRange(row, 10).setValue('dismissed');
        if (b.remember === 'ignore') { const key = merchKey_(ib.getRange(row, 5).getValue()); if (!isGeneric_(key)) upsertRule_(key, '', '', '', 'ignore'); }
      }
      return {};
    }
    case 'saveRule': { upsertRule_(merchKey_(b.merchant), b.section || '', b.item || '', b.remark || '', b.mode); return {}; }
    case 'deleteRule': {
      const sh = sheet_(MERCH), key = merchKey_(b.merchant);
      if (sh) { const v = sh.getDataRange().getValues(); for (let i = v.length - 1; i >= 1; i--) if (v[i][0] === key) sh.deleteRow(i + 1); }
      return {};
    }
    case 'saveTrip': {
      const name = String(b.name || '').trim().slice(0, 20);
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(b.start) || !/^\d{4}-\d{2}-\d{2}$/.test(b.end) || b.end < b.start) throw new Error('旅程資料無效');
      const sh = ensureSheet_(TRIPS, TRIPS_HEAD); sh.getRange('B:C').setNumberFormat('@');
      const v = sh.getDataRange().getValues(), old = String(b.oldName || name);
      let row = 0; for (let i = 1; i < v.length; i++) if (v[i][0] === old) row = i + 1;
      if (old !== name && v.some((r, i) => i > 0 && r[0] === name)) throw new Error('已有同名旅程');
      const vals = [[name, b.start, b.end, String(b.currency || ''), String(b.note || '')]];
      if (row) sh.getRange(row, 1, 1, 5).setValues(vals); else sh.appendRow(vals[0]);
      if (old !== name) { // 改名：同步更新紀錄上的旅程標籤
        const rv = rec.getDataRange().getValues();
        for (let i = 1; i < rv.length; i++) if (rv[i][11] === old) rec.getRange(i + 1, 12).setValue(name);
      }
      return {};
    }
    case 'deleteTrip': {
      const sh = sheet_(TRIPS);
      if (sh) { const v = sh.getDataRange().getValues(); for (let i = v.length - 1; i >= 1; i--) if (v[i][0] === b.name) sh.deleteRow(i + 1); }
      if (b.untag) { const rv = rec.getDataRange().getValues(); for (let i = 1; i < rv.length; i++) if (rv[i][11] === b.name) rec.getRange(i + 1, 12).setValue(''); }
      return {};
    }
    case 'saveSplit': return saveSplit_(b, rec);
    case 'deleteSplit': {
      const sid = String(b.id || ''); if (!sid) throw new Error('資料無效');
      const sh = sheet_(SPLITS), row = sh ? findRow_(sh, sid) : 0;
      if (row) sh.deleteRow(row);
      const rv = rec.getDataRange().getValues();
      for (let i = rv.length - 1; i >= 1; i--) if (rv[i][12] === sid) rec.deleteRow(i + 1);
      return {};
    }
    case 'saveSettings': {
      let sh = sheet_(SETTINGS);
      if (!sh) { sh = SpreadsheetApp.getActive().insertSheet(SETTINGS); sh.appendRow(SETTINGS_HEAD); sh.setFrozenRows(1); }
      const cur = settings_();
      Object.keys(b.settings || {}).forEach(k => { if (/^[\w.\u4e00-\u9fff]{1,40}$/.test(k)) cur[k] = b.settings[k]; });
      const all = Object.keys(cur).filter(k => cur[k] !== '' && cur[k] != null).map(k => [k, cur[k]]);
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
      if (all.length) sh.getRange(2, 1, all.length, 2).setValues(all);
      return {};
    }
    case 'deleteRecord': {
      const row = findRow_(rec, b.id);
      if (row) rec.deleteRow(row);
      return {};
    }
    case 'updateFixed': {
      const row = findRow_(fix, b.id);
      if (!row) throw new Error('找不到固定項目');
      const old = Number(fix.getRange(row, 3).getValue()), amt = Number(b.amount);
      let hist = String(fix.getRange(row, 8).getValue() || '');
      if (old !== amt) hist = (hist ? hist + '; ' : '') + thisYm + ': ' + old + '→' + amt;
      fix.getRange(row, 3, 1, 2).setValues([[amt, b.remark || '']]);
      fix.getRange(row, 7, 1, 2).setValues([[new Date(), hist]]);
      if (b.cycle === 'M' || b.cycle === 'Y') { ensureFixHead_(); fix.getRange(row, 9).setValue(b.cycle); }
      if (b.applyThisMonth) {
        const v = rec.getDataRange().getValues();
        for (let i = 1; i < v.length; i++) {
          if (v[i][7] === b.id && ym_(v[i][1]) === thisYm) {
            rec.getRange(i + 1, 5, 1, 2).setValues([[amt, b.remark || '']]);
            if (v[0].length >= 11) rec.getRange(i + 1, 11).setValue(amt);
          }
        }
      }
      return {};
    }
    case 'toggleFixed': {
      const row = findRow_(fix, b.id);
      if (!row) throw new Error('找不到固定項目');
      fix.getRange(row, 6, 1, 2).setValues([[!!b.active, new Date()]]);
      return {};
    }
  }
  throw new Error('unknown action');
}

function handle_(p, fn) {
  const t0 = Date.now();
  try {
    if (!p || p.token !== token_()) throw new Error('unauthorized');
    const out = fn();
    return json_(Object.assign({ ok: true }, out, { ms: Date.now() - t0 })); // ms：伺服器處理時間，供前端效能記錄
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

/* ============ 旅程（第 4 期） ============ */
function trips_() {
  const sh = sheet_(TRIPS); if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => ({ name: String(r[0]), start: ymd_(r[1]), end: ymd_(r[2]), currency: String(r[3] || ''), note: String(r[4] || '') }));
}
/** 日期落在哪個旅程（出發前後各 0 日；多個重疊時取最近開始者） */
function tripFor_(date) {
  const t = trips_().filter(x => x.start && x.end && date >= x.start && date <= x.end).sort((a, b) => b.start.localeCompare(a.start))[0];
  return t ? t.name : '';
}

/* ============ 通知自動記帳（第 5 期） ============ */
// 各銀行短訊格式（2026-11 用家提供的實例）；新增銀行只需加一條規則
const PARSERS = [
  { src: '中銀信用卡', re: /中銀信用卡.*?尾號(\d{4})於(\d{1,2})\/(\d{1,2})在(.+?)交易([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/,
    map: m => ({ card: m[1], d: m[2], mo: m[3], merchant: m[4], cur: m[5], amt: m[6] }) },
  { src: '花旗', re: /花旗銀行.*?(\d{4})\)\s*於\s*(\d{1,2})\/(\d{1,2})\s*在\s*["“]?\s*(.+?)\s*["”]?\s*有一.*?金額為\s*([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/,
    map: m => ({ card: m[1], d: m[2], mo: m[3], merchant: m[4], cur: m[5], amt: m[6] }) },
  { src: '安信', re: /安信.*?尾數(\d{4})於(\d{1,2})\/(\d{1,2})\/(\d{4})在(.+?)消費([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/,
    map: m => ({ card: m[1], d: m[2], mo: m[3], y: m[4], merchant: m[5], cur: m[6], amt: m[7] }) },
  { src: '中銀戶口', re: /中銀香港.*?(\d{1,2})月(\d{1,2})日賬戶\S*?(\d{3})自動轉賬(港元|[A-Z]{3})\s*([\d,]+(?:\.\d+)?)至(.+?)。?\s*$/,
    map: m => ({ card: m[3], mo: m[1], d: m[2], cur: m[4] === '港元' ? 'HKD' : m[4], amt: m[5], merchant: (m[6].match(/\(([^)]+)\)/) || [])[1] || m[6] }) },
  { src: '中國移動', re: /中國移動香港.*?(\d{4})-(\d{2})-(\d{2})\s+[\d:]+\s*繳款HK\$([\d,]+(?:\.\d+)?)/,
    map: m => ({ y: m[1], mo: m[2], d: m[3], cur: 'HKD', amt: m[4], merchant: '中國移動香港' }) },
];
// 支付平台：通知只顯示平台名稱，無法得知真正商戶，必須逐筆確認，不建立規則
const GENERIC = /ALIPAY|WECHAT\s*PAY|PAYME|OCTOPUS|八達通|KPAY|TAP\s*&?\s*GO|BOC\s*PAY|轉數快|FPS/i;
const DUP_MINUTES = 15; // 不同來源、同一港元金額、15 分鐘內 → 視為可能重複

function merchKey_(m) { return String(m || '').replace(/\.{2,}|…/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function isGeneric_(key) { return GENERIC.test(key); }
function mealOf_(d) {
  const h = Number(fmt_(d, 'H')) + Number(fmt_(d, 'm')) / 60;
  return '餐飲'; // 早／午／晚餐已合併
}
function parseSms_(text, ts) {
  for (const p of PARSERS) {
    const m = text.match(p.re); if (!m) continue;
    const x = p.map(m), amt = Number(String(x.amt).replace(/,/g, ''));
    if (!(amt > 0)) return null;
    let y = Number(x.y) || Number(fmt_(ts, 'yyyy'));
    if (!x.y && Number(x.mo) > Number(fmt_(ts, 'M')) + 1) y--; // 12 月交易、1 月才收到
    const date = `${y}-${('0' + x.mo).slice(-2)}-${('0' + x.d).slice(-2)}`;
    return { source: p.src + (x.card ? ' ' + x.card : ''), merchant: String(x.merchant).trim(), cur: x.cur, amt: amt, date: date };
  }
  return null;
}
function fxRate_(cur) {
  const cache = CacheService.getScriptCache(), hit = cache.get('fx_' + cur);
  if (hit) return Number(hit);
  try {
    const j = JSON.parse(UrlFetchApp.fetch('https://open.er-api.com/v6/latest/HKD', { muteHttpExceptions: true }).getContentText());
    if (j.rates && j.rates[cur] > 0) { const r = 1 / j.rates[cur]; cache.put('fx_' + cur, String(r), 21600); return r; }
  } catch (e) {}
  const FALLBACK = { JPY: 0.051, CNY: 1.09, USD: 7.78, TWD: 0.24, KRW: 0.0055, THB: 0.23, SGD: 6.0, EUR: 8.5, GBP: 10.2, MOP: 0.97 };
  if (FALLBACK[cur]) return FALLBACK[cur];
  throw new Error('未能取得 ' + cur + ' 匯率');
}
function ensureSheet_(n, head) {
  let sh = sheet_(n);
  if (!sh) { sh = SpreadsheetApp.getActive().insertSheet(n); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function findRule_(key) {
  const sh = sheet_(MERCH); if (!sh || !key) return null;
  const v = sh.getDataRange().getValues();
  // 不同卡會截短商戶名稱（例如 WING ON TR／HK WING ON TRAVEL SE），容許互相包含（至少 6 字元）
  for (let i = 1; i < v.length; i++) {
    const k = String(v[i][0]); if (!k) continue;
    if (k === key || (Math.min(k.length, key.length) >= 6 && (k.indexOf(key) >= 0 || key.indexOf(k) >= 0)))
      return { row: i + 1, key: k, section: v[i][1], item: v[i][2], remark: v[i][3], mode: v[i][4] || 'ask' };
  }
  return null;
}
function upsertRule_(key, section, item, remark, mode) {
  const sh = ensureSheet_(MERCH, MERCH_HEAD), r = findRule_(key);
  const m = ['auto', 'ask', 'ignore'].indexOf(mode) >= 0 ? mode : 'ask';
  if (r) sh.getRange(r.row, 2, 1, 6).setValues([[section || r.section, item || r.item, remark, m, sh.getRange(r.row, 6).getValue(), new Date()]]);
  else sh.appendRow([key, section, item, remark, m, 0, new Date()]);
}
function addRecord_(x) {
  const rec = sheet_(REC); ensureRecHead_();
  if (findRow_(rec, x.id)) return x.id;
  const rate = x.currency === 'HKD' ? 1 : round2_(x.amount / x.origAmount * 1e4) / 1e4;
  rec.appendRow([x.id, x.date, x.section, x.item, Number(x.amount), x.remark || '', new Date(), '', x.currency, rate, Number(x.origAmount), x.section === '旅遊' ? tripFor_(x.date) : '']);
  return x.id;
}
function round2_(n) { return Math.round(n * 100) / 100; }
const money_ = (cur, n) => (cur === 'HKD' ? 'HK$ ' : cur + ' ') + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** 接收 Tasker 轉發的短訊／通知原文 */
function inbox_(b) {
  const now = new Date(), text = String(b.text || '').replace(/\s+/g, ' ').trim();
  props_().setProperty('INBOX_LAST', now.toISOString()); // 看門狗：轉發器仍在運作
  if (!text) return { status: 'skip' };
  const ib = ensureSheet_(INBOX, INBOX_HEAD);
  const id = 'ib_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)).slice(0, 20);
  if (findRow_(ib, id)) return { status: 'dup' }; // 同一短訊重送
  const tsNum = Number(b.ts), ts = tsNum > 1e9 ? new Date(tsNum < 1e11 ? tsNum * 1000 : tsNum) : now;
  const p = parseSms_(text, ts);
  if (!p) { ib.appendRow([id, ts, String(b.sender || ''), text, '', '', '', '', '', 'skip', '', '']); return { status: 'skip' }; }
  const hkd = p.cur === 'HKD' ? p.amt : round2_(p.amt * fxRate_(p.cur));
  const key = merchKey_(p.merchant), generic = isGeneric_(key), rule = generic ? null : findRule_(key);
  // 可能重複：不同短訊、同一港元金額、DUP_MINUTES 內（例如繳費短訊＋信用卡短訊）
  const v = ib.getDataRange().getValues().slice(1);
  const dupOf = v.find(r => r[0] !== id && r[9] !== 'skip' && Number(r[7]) === hkd && r[1] instanceof Date && Math.abs(r[1] - ts) < DUP_MINUTES * 60000);
  const suggest = rule && rule.mode !== 'ignore'
    ? { section: rule.section, item: rule.item, remark: rule.remark || p.merchant, rule: true }
    : { section: '日常', item: '餐飲', remark: generic ? '' : p.merchant, generic: generic };
  if (dupOf) suggest.dup = `可能與 ${fmt_(dupOf[1], 'HH:mm')} 的「${dupOf[4]}」${money_('HKD', hkd)} 重複`;
  let status = 'pending', recId = '';
  const what = `${p.merchant} ${money_(p.cur, p.amt)}${p.cur !== 'HKD' ? `（≈ ${money_('HKD', hkd)}）` : ''}`;
  if (rule && rule.mode === 'ignore') status = 'ignored';
  else if (rule && rule.mode === 'auto' && !dupOf) {
    const item = rule.item === MEAL ? mealOf_(ts) : rule.item;
    recId = addRecord_({ id: id, date: p.date, section: rule.section, item: item, remark: rule.remark || p.merchant, currency: p.cur, origAmount: p.amt, amount: hkd });
    status = 'auto';
    const sh = sheet_(MERCH); sh.getRange(rule.row, 6).setValue(Number(sh.getRange(rule.row, 6).getValue() || 0) + 1);
    notify_(`✅ 已入帳｜${item} ${rule.remark || p.merchant} ${money_('HKD', hkd)}｜${fmt_(ts, 'd/M HH:mm')}`);
  } else {
    notify_(`🔔 待確認｜${what}｜${fmt_(ts, 'd/M HH:mm')}${rule ? '' : generic ? '' : '（新商戶）'}${dupOf ? '（可能重複）' : ''}`);
  }
  ib.appendRow([id, ts, p.source, text, p.merchant, p.cur, p.amt, hkd, p.date, status, recId, JSON.stringify(suggest)]);
  return { status: status };
}

function findRow_(sh, id) {
  if (!id || sh.getLastRow() < 2) return 0;
  const c = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return c ? c.getRow() : 0;
}

function recObj_(r) {
  return {
    id: r[0], date: ymd_(r[1]), section: r[2], item: normItem_(r[2], r[3]), amount: Number(r[4]), remark: String(r[5] || ''),
    createdAt: r[6] instanceof Date ? r[6].toISOString() : String(r[6] || ''), fixedId: r[7] || '',
    currency: String(r[8] || 'HKD'), fxRate: Number(r[9]) || 1,
    origAmount: r[10] === '' || r[10] == null ? Number(r[4]) : Number(r[10]), trip: String(r[11] || ''), splitId: String(r[12] || '')
  };
}

function fixObj_(r) {
  return {
    id: r[0], item: r[1], amount: Number(r[2]), remark: String(r[3] || ''), startYm: ym_(r[4]),
    active: isOn_(r[5]), history: String(r[7] || ''), cycle: String(r[8] || 'M') === 'Y' ? 'Y' : 'M'
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ============ 分帳（第 6 期） ============
 * Splits 每個活動一行；Data 為 JSON：{ people, expenses, done, transfers:[{from,to,amt,done}], unit }
 * 「我」的份額由前端計算後以 records 傳入，寫入 Records（SplitID 欄）；每次儲存以 SplitID 同步：多出的刪除、已有的更新、新的新增 */
function splits_() {
  const sh = sheet_(SPLITS); if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => {
    let data = {}; try { data = JSON.parse(r[7] || '{}'); } catch (e) {}
    return { id: String(r[0]), name: String(r[1]), date: ymd_(r[2]), currency: String(r[3] || 'HKD'), fxRate: Number(r[4]) || 1, trip: String(r[5] || ''),
      status: String(r[6] || 'open'), data: data, updatedAt: r[8] instanceof Date ? r[8].toISOString() : String(r[8] || ''), settledAt: String(r[9] || '') };
  });
}
function saveSplit_(b, rec) {
  const sp = b.split || {}, sid = String(sp.id || '');
  if (!sid || !String(sp.name || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(sp.date)) throw new Error('分帳資料無效');
  const cur = String(sp.currency || 'HKD').toUpperCase(), rate = cur === 'HKD' ? 1 : Number(sp.fxRate);
  if (!(rate > 0)) throw new Error('匯率無效');
  const recs = (b.records || []).filter(x => x && x.id && Number(x.amount) > 0 && ['旅遊', '日常', '其他'].indexOf(x.section) >= 0);
  const sh = ensureSheet_(SPLITS, SPLITS_HEAD); sh.getRange('C:C').setNumberFormat('@'); sh.getRange('J:J').setNumberFormat('@');
  const vals = [sid, String(sp.name).trim().slice(0, 30), sp.date, cur, rate, String(sp.trip || ''),
    ['open', 'settled', 'done'].indexOf(sp.status) >= 0 ? sp.status : 'open', JSON.stringify(sp.data || {}), new Date(), String(sp.settledAt || '')];
  const row = findRow_(sh, sid);
  if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
  // 來源（第 6b 期）：由現有紀錄轉為分帳 → 刪除原本的全額紀錄；由待確認通知轉為分帳 → 標記通知已處理。重送亦安全
  ensureRecHead_();
  const src = (sp.data && sp.data.src) || {};
  if (src.rec) { const r = findRow_(rec, src.rec); if (r && !rec.getRange(r, 13).getValue()) rec.deleteRow(r); }
  if (src.inbox) {
    const ib = sheet_(INBOX), r = ib ? findRow_(ib, src.inbox) : 0;
    if (r && ib.getRange(r, 10).getValue() === 'pending') ib.getRange(r, 10, 1, 2).setValues([['split', sid]]);
  }
  // 我的份額 → Records
  const want = {}; recs.forEach(x => want[x.id] = x);
  const line = x => [x.date || sp.date, x.section, String(x.item || ''), round2_(Number(x.amount)), String(x.remark || '')];
  const tail = x => [cur, rate, cur === 'HKD' ? round2_(Number(x.amount)) : Number(x.origAmount), x.section === '旅遊' ? String(x.trip || '') : '', sid];
  const rv = rec.getDataRange().getValues();
  for (let i = rv.length - 1; i >= 1; i--) {
    if (rv[i][12] !== sid) continue;
    const x = want[rv[i][0]];
    if (!x) { rec.deleteRow(i + 1); continue; }
    rec.getRange(i + 1, 2, 1, 5).setValues([line(x)]);
    rec.getRange(i + 1, 9, 1, 5).setValues([tail(x)]);
    delete want[x.id];
  }
  Object.keys(want).forEach(id => { const x = want[id]; rec.appendRow([id].concat(line(x), [new Date(), ''], tail(x))); });
  return {};
}
function splitCheck_(now) {
  const sh = sheet_(SPLITS); if (!sh) return;
  const p = props_(), sent = JSON.parse(p.getProperty('SPLIT_SENT') || '{}'); let changed = false;
  sh.getDataRange().getValues().slice(1).forEach(r => {
    if (!r[0] || r[6] !== 'settled' || sent[r[0]]) return;
    const at = new Date(r[9]); if (!r[9] || isNaN(at) || now - at < SPLIT_REMIND_DAYS * 864e5) return;
    let d; try { d = JSON.parse(r[7] || '{}'); } catch (e) { return; }
    const open = (d.transfers || []).filter(t => !t.done && (t.from === '我' || t.to === '我')); if (!open.length) return; // 只提醒涉及「我」的轉帳
    const cur = String(r[3] || 'HKD'), unit = Number(d.unit) || 100;
    sent[r[0]] = fmt_(now, 'yyyy-MM-dd'); changed = true;
    notify_(`💸 分帳「${r[1]}」已確認 ${Math.floor((now - at) / 864e5)} 日，仍有 ${open.length} 筆涉及你的轉帳未清：`
      + open.slice(0, 6).map(t => `${t.from}→${t.to} ${money_(cur, t.amt / unit)}`).join('；'));
  });
  if (changed) p.setProperty('SPLIT_SENT', JSON.stringify(sent));
}
