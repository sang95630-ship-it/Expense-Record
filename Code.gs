/**** 記帳簿 後端：貼到 Google Sheet → 擴充功能 → Apps Script ****/
// TOKEN 不再寫在程式碼內：請到「專案設定 → 指令碼屬性」新增屬性 TOKEN（值 = 你的密碼）。
// 之後更新 Code.gs 可直接整份貼上；更換 TOKEN 只需改屬性值，毋須重新部署。
const API_VERSION = 3;            // 前端用來檢查 Code.gs 是否已更新
const BACKUP_FOLDER = '記帳簿備份'; // Google Drive 備份資料夾名稱
const BACKUP_KEEP = 8;            // 保留最近 8 份（約 2 個月）
const REC = 'Records', FIX = 'Fixed';
// Amount 一律為港幣；外幣支出另記 Currency / FxRate（1 外幣 = ? HKD）/ OrigAmount（原幣金額）
const REC_HEAD = ['ID', 'Date', 'Section', 'Item', 'Amount', 'Remark', 'CreatedAt', 'FixedID', 'Currency', 'FxRate', 'OrigAmount'];
const FIX_HEAD = ['ID', 'Item', 'Amount', 'Remark', 'StartYm', 'Active', 'UpdatedAt', 'History'];

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function fmt_(d, p) { return Utilities.formatDate(d, tz_(), p); }
function ymd_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM-dd') : String(v).slice(0, 10); }
function ym_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM') : String(v).slice(0, 7); }
/** 舊表自動補上新增的欄位標題（Currency / FxRate / OrigAmount） */
function ensureRecHead_() {
  const sh = sheet_(REC);
  if (sh.getLastColumn() < REC_HEAD.length) sh.getRange(1, 1, 1, REC_HEAD.length).setValues([REC_HEAD]);
}
function props_() { return PropertiesService.getScriptProperties(); }
function token_() {
  const t = props_().getProperty('TOKEN');
  if (!t || t.length < 16) throw new Error('伺服器未設定 TOKEN（指令碼屬性，至少 16 個字元）');
  return t;
}
function sheet_(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function rows_(n) { return sheet_(n).getDataRange().getValues().slice(1); }
function isOn_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

/** 首次執行一次：建立工作表 + 每月 1 號凌晨 1 時的 trigger */
function setup() {
  const ss = SpreadsheetApp.getActive();
  [[REC, REC_HEAD], [FIX, FIX_HEAD]].forEach(([n, h]) => {
    const sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if (sh.getLastRow() === 0) { sh.appendRow(h); sh.setFrozenRows(1); }
  });
  ensureRecHead_();
  sheet_(REC).getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sheet_(FIX).getRange('E:E').setNumberFormat('@'); // 防止 2026-11 被轉成日期
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monthlyJob').timeBased().onMonthDay(1).atHour(1).create();
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
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

/** 每月 1 號：把所有「啟用中」固定項目寫入本月 */
function monthlyJob() {
  const rec = sheet_(REC), ym = fmt_(new Date(), 'yyyy-MM');
  const done = new Set(rows_(REC).filter(r => r[7] && ym_(r[1]) === ym).map(r => r[7]));
  const add = rows_(FIX)
    .filter(r => r[0] && isOn_(r[5]) && ym_(r[4]) < ym && !done.has(r[0]))
    .map(r => [Utilities.getUuid(), ym + '-01', '固定', r[1], Number(r[2]), r[3], new Date(), r[0], 'HKD', 1, Number(r[2])]);
  if (add.length) ensureRecHead_();
  if (add.length) rec.getRange(rec.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
}

function doGet(e) {
  const p = e.parameter;
  return handle_(p, () => {
    if (p.action === 'info') return { sheetUrl: SpreadsheetApp.getActive().getUrl(), version: API_VERSION,
      lastBackup: props_().getProperty('LAST_BACKUP') || '', serverTime: new Date().toISOString() };
    if (p.action === 'list') return { rows: rows_(REC).filter(r => r[0] && ym_(r[1]) === p.month).map(recObj_) };
    if (p.action === 'fixed') return { rows: rows_(FIX).filter(r => r[0]).map(fixObj_) };
    throw new Error('unknown action');
  });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  return handle_(b, () => {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try { return write_(b); } finally { lock.releaseLock(); }
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
      rec.appendRow([b.id, b.date, b.section, b.item, Number(b.amount), b.remark || '', new Date(), fixedId, cur, rate, orig]);
      if (fixedId) fix.appendRow([fixedId, b.item, Number(b.amount), b.remark || '', b.date.slice(0, 7), true, new Date(), '']);
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
  try {
    if (!p || p.token !== token_()) throw new Error('unauthorized');
    return json_(Object.assign({ ok: true }, fn()));
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function findRow_(sh, id) {
  if (!id || sh.getLastRow() < 2) return 0;
  const c = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return c ? c.getRow() : 0;
}

function recObj_(r) {
  return {
    id: r[0], date: ymd_(r[1]), section: r[2], item: r[3], amount: Number(r[4]), remark: String(r[5] || ''),
    createdAt: r[6] instanceof Date ? r[6].toISOString() : String(r[6] || ''), fixedId: r[7] || '',
    currency: String(r[8] || 'HKD'), fxRate: Number(r[9]) || 1,
    origAmount: r[10] === '' || r[10] == null ? Number(r[4]) : Number(r[10])
  };
}

function fixObj_(r) {
  return {
    id: r[0], item: r[1], amount: Number(r[2]), remark: String(r[3] || ''), startYm: ym_(r[4]),
    active: isOn_(r[5]), history: String(r[7] || '')
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
