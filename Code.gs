/**** 記帳簿 後端：貼到 Google Sheet → 擴充功能 → Apps Script ****/
const TOKEN = 'change-me-to-a-long-random-string'; // 改成你自己的密碼，網頁設定頁要輸入同一個
const REC = 'Records', FIX = 'Fixed';
const REC_HEAD = ['ID', 'Date', 'Section', 'Item', 'Amount', 'Remark', 'CreatedAt', 'FixedID'];
const FIX_HEAD = ['ID', 'Item', 'Amount', 'Remark', 'StartYm', 'Active', 'UpdatedAt', 'History'];

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function fmt_(d, p) { return Utilities.formatDate(d, tz_(), p); }
function ymd_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM-dd') : String(v).slice(0, 10); }
function ym_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM') : String(v).slice(0, 7); }
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
  sheet_(REC).getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sheet_(FIX).getRange('E:E').setNumberFormat('@'); // 防止 2026-11 被轉成日期
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monthlyJob').timeBased().onMonthDay(1).atHour(1).create();
}

/** 每月 1 號：把所有「啟用中」固定項目寫入本月 */
function monthlyJob() {
  const rec = sheet_(REC), ym = fmt_(new Date(), 'yyyy-MM');
  const done = new Set(rows_(REC).filter(r => r[7] && ym_(r[1]) === ym).map(r => r[7]));
  const add = rows_(FIX)
    .filter(r => r[0] && isOn_(r[5]) && ym_(r[4]) < ym && !done.has(r[0]))
    .map(r => [Utilities.getUuid(), ym + '-01', '固定', r[1], Number(r[2]), r[3], new Date(), r[0]]);
  if (add.length) rec.getRange(rec.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
}

function doGet(e) {
  const p = e.parameter;
  return handle_(p, () => {
    if (p.action === 'info') return { sheetUrl: SpreadsheetApp.getActive().getUrl() };
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
      const fixedId = b.section === '固定' ? Utilities.getUuid() : '';
      rec.appendRow([b.id, b.date, b.section, b.item, Number(b.amount), b.remark || '', new Date(), fixedId]);
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
          if (v[i][7] === b.id && ym_(v[i][1]) === thisYm) rec.getRange(i + 1, 5, 1, 2).setValues([[amt, b.remark || '']]);
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
    if (!p || p.token !== TOKEN) throw new Error('unauthorized');
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
    createdAt: r[6] instanceof Date ? r[6].toISOString() : String(r[6] || ''), fixedId: r[7] || ''
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
