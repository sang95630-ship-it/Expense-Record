/* 記帳簿 Service Worker：離線開啟網頁本身；資料仍由 index.html 的本機佇列處理 */
const VERSION = 'expense-v6';
const SHELL = ['./', './index.html', './classic.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './sc-breakfast.png', './sc-lunch.png', './sc-dinner.png', './sc-inbox.png', './qrcode.min.js',
  ...['2708','1f3e8','1f39f','1f684','1f363','1f6cd','1f6e1','1f9f3','1f37d','1f9cb','1f687','1f36a','1f9f4','1f4e6','1f3e0','1f4fa','1f3ab','1f4f1','1f310','1f4a1','1f3e2','1f455','1f50c','1f3ae','1f48a','1f381','1f3cb','1f4da','1f33f','2728','1f354','2615','1f37a','1f695','1f68c','26fd','1f6d2','1f3ac','1f43e','1f487'].map(c => `./emoji/${c}.webp`)]; // 圖示庫（離線亦可顯示）

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Google Apps Script／匯率 API 一律直接連網，不作快取
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
      // 網絡優先：有網絡時永遠取最新版本，離線才用快取
      e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    } else {
      e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put(req, c)); return res; })));
    }
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
