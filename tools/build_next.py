#!/usr/bin/env python3
"""由 index.html（經典版）產生 next.html（新設計，參考 Apple Human Interface Guidelines）。

用法：python3 tools/build_next.py
- 功能及資料完全共用：同一份程式碼、同一個 localStorage（TOKEN、佇列、快取），兩個版本可隨時切換
- 只更換外觀及導覽：系統字體、分組列表、iOS 分段控制、大標題、底部分頁列（手機）、淺色側欄（電腦）
- 每次修改 index.html 後重新執行，令新設計保持最新
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / 'index.html').read_text(encoding='utf-8')


def sub(old, new, count=1):
    global s
    assert s.count(old) == count, f'找不到或不唯一：{old[:60]}'
    s = s.replace(old, new)


sub('<meta name="theme-color" content="#37474F">',
    '<meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">')
# 版本切換連結
sub('<a class="ui-switch" id="uiSwitch" href="next.html"><span>✨</span><span><b>試用新設計</b><small>參考 Apple 設計語言，可隨時返回</small></span><span>›</span></a>',
    '<a class="ui-switch" id="uiSwitch" href="index.html"><span>↩︎</span><span><b>返回經典版</b><small>資料共用，切換不會遺失任何紀錄</small></span><span>›</span></a>')

CSS = r"""
/* ================= 新設計（Apple HIG 風格）=================
   原則：內容優先（大標題＋分組列表）、系統字體、少陰影多留白、單一強調色、手機以底部分頁列導覽 */
:root{
  --bg:#F2F2F7;--surface:#FFFFFF;--surface-2:rgba(118,118,128,.12);--ink:#1C1C1E;--muted:rgba(60,60,67,.6);--line:rgba(60,60,67,.16);
  --primary:#2F6F94;--primary-ink:#FFFFFF;--tint-fill:rgba(47,111,148,.12);--soft:rgba(118,118,128,.12);--side:#F2F2F7;--side-ink:#1C1C1E;
  --danger:#D70015;--warn-bg:rgba(255,149,0,.15);--warn-ink:#B25000;--st-ok:#248A3D;--st-warn:#C93400;--hl-mid:#B86E00;
  --seg-on:#FFFFFF;--bar-bg:rgba(249,249,249,.86);--hud:rgba(28,28,30,.92);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#000000;--surface:#1C1C1E;--surface-2:rgba(118,118,128,.24);--ink:#F2F2F7;--muted:rgba(235,235,245,.6);--line:rgba(84,84,88,.55);
    --primary:#6AB4E0;--primary-ink:#00131F;--tint-fill:rgba(106,180,224,.16);--soft:rgba(118,118,128,.24);--side:#1C1C1E;--side-ink:#F2F2F7;
    --danger:#FF453A;--warn-bg:rgba(255,159,10,.18);--warn-ink:#FFB340;--st-ok:#30D158;--st-warn:#FF9F0A;--hl-mid:#FFC266;
    --seg-on:#636366;--bar-bg:rgba(22,22,24,.86);--hud:rgba(58,58,60,.94);
  }
}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang HK","PingFang TC","Noto Sans TC",system-ui,sans-serif;
  font-size:17px;line-height:1.4;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
.small{font-size:13px}
.num,.amt,.total,#amount{font-feature-settings:"tnum"}

/* ---- 置頂列：大標題，下捲縮為居中小標題（毛玻璃） ---- */
.topbar{background:color-mix(in srgb,var(--bg) 80%,transparent);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);
  padding:calc(10px + env(safe-area-inset-top,0px)) 16px 6px;max-width:none}
.topbar h1{font-size:32px;font-weight:700;letter-spacing:.01em}
.topbar.compact{box-shadow:0 .5px 0 var(--line);padding-top:calc(8px + env(safe-area-inset-top,0px));padding-bottom:8px}
.topbar.compact h1{font-size:17px;font-weight:600;justify-content:center}
.topbar.compact .tb-tx{display:inline}
.topbar.compact .tb-ic{display:none}
.sync-btn{width:32px;height:32px}
.topbar.compact .sync-btn{width:26px;height:26px}
#syncState{font-size:13px}
.page{padding:6px 16px calc(100px + env(safe-area-inset-bottom,0px));max-width:720px;margin:0 auto}
main{align-items:stretch}
@media (min-width:900px){ .topbar{padding-left:28px} .page{margin:0;padding-left:28px} }

/* ---- 分組列表（inset grouped） ---- */
h2{font-size:13px;font-weight:400;color:var(--muted);margin:26px 16px 7px;letter-spacing:0}
.card{border-radius:12px;padding:14px 16px}
.list{padding:0 0 0 16px}
.rec{padding:10px 16px 10px 0;border-bottom:.5px solid var(--line);gap:12px}
.rec .em{width:36px;height:36px;border-radius:50%;background:var(--tint-fill);font-size:18px}
.rec .main div:first-child{font-size:17px}
.rec .sub{font-size:13px}
.rec .amt{font-weight:600;font-size:17px}
.rec .ghost{padding:5px 10px}
.day-head{font-size:13px}
details.wk{border-radius:12px}
details.wk .day-head{border-top:.5px solid var(--line)}
.wk-bar{height:4px;background:var(--soft)}
.wk-now{background:var(--tint-fill);color:var(--primary);font-weight:600}
details.fold>summary h2{margin:0;font-size:20px;font-weight:700;color:var(--ink)}
.fold-btn{background:var(--soft)!important}

/* ---- 控制項 ---- */
.tabs,.seg{background:var(--soft);padding:2px;border-radius:9px;gap:0}
.tab,.seg button{border-radius:7px;font-size:14px;font-weight:500;color:var(--ink);padding:7px 0}
.seg button{padding:6px 14px}
.tab.active,.seg button.active{background:var(--seg-on);font-weight:600;box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04)}
.text-in{border:0;background:var(--surface-2);border-radius:10px;padding:11px 14px;font-size:17px}
.text-in:focus{box-shadow:0 0 0 2px var(--primary)}
select.text-in{padding:10px 12px}
.field{font-size:13px;gap:6px}
.primary{border-radius:12px;padding:0 16px;min-height:50px;font-size:17px;font-weight:600;letter-spacing:-.01em}
.ghost{border:0;background:var(--tint-fill);color:var(--primary);border-radius:10px;padding:7px 12px;font-size:15px;font-weight:500}
.ghost.danger{background:rgba(255,59,48,.12);color:var(--danger)}
.row-btns .ghost{padding:0 16px;min-height:50px;font-size:17px}
.month-nav .ghost{width:36px;height:36px;padding:0;border-radius:50%;font-size:20px}
.month-nav strong{font-size:20px;font-weight:700}
.link-btn{color:var(--primary);font-size:17px}
.link-btn.strong{color:var(--primary);font-weight:600}
.hint{font-size:13px}
.ib-banner{border-radius:12px;padding:12px 16px;font-weight:600}
.rm-chip{border:0;background:var(--surface-2);font-size:14px;padding:6px 12px}
.sp-chip{border:0;background:var(--surface-2);font-size:15px}
.sp-chip.on{background:var(--primary);color:var(--primary-ink)}

/* ---- 新增支出：分段類別、圖示格、大金額 ---- */
.grid{gap:14px 8px;margin:18px 0}
.chip{background:none;border:0;padding:0;gap:6px;font-size:12px;color:var(--ink)}
.chip .em{width:56px;height:56px;border-radius:16px;background:var(--surface);display:grid;place-items:center;font-size:28px;transition:transform .15s,box-shadow .15s}
.chip:active .em{transform:scale(.94)}
.chip.active{background:none;font-weight:600;color:var(--primary)}
.chip.active .em{background:var(--tint-fill);box-shadow:0 0 0 2px var(--primary)}
.form{gap:14px}
.date-btn{background:var(--surface-2);border-radius:10px;padding:11px 14px;font-size:17px}
.date-btn .today{font-size:15px;color:var(--primary);font-weight:500}
.amount-row{border-bottom:0;padding:6px 0 2px;align-items:center}
#amount{font-family:ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif;font-size:52px;font-weight:600;letter-spacing:-.02em}
.cur-wrap{background:var(--surface-2);border-radius:10px;font-size:17px;font-weight:600}
.save-row .ghost{flex:0 0 auto}

/* ---- 數字、圖表 ---- */
.total{font-size:34px;font-weight:700;letter-spacing:-.02em}
.split2 .t2{font-size:24px;font-weight:700;letter-spacing:-.02em}
.bar{height:6px;background:var(--soft);border-radius:3px}
.bar i{border-radius:3px}
.proj{background:var(--surface-2);border-radius:10px}
.aa-line{background:var(--tint-fill);color:var(--ink);border-radius:10px}

/* ---- 表單頁（sheet）：圓角、頂部拉柄 ---- */
.overlay{background:rgba(0,0,0,.32)}
.sheet{border-radius:14px 14px 0 0;position:relative;padding-top:22px}
.sheet::before{content:"";position:absolute;top:7px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:3px;background:var(--line)}
@media (min-width:900px){ .sheet{border-radius:14px} .sheet::before{display:none} }
.sheet-head strong{font-size:17px;font-weight:600}
.wheel::before{background:var(--surface-2)}

/* ---- 提示：膠囊 HUD，在分頁列之上 ---- */
.toast{background:var(--hud);color:#fff;border-radius:999px;-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);
  bottom:calc(96px + env(safe-area-inset-bottom,0px));font-size:15px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
@media (min-width:900px){ .toast{bottom:28px} }

/* ---- 側欄：電腦為淺色側欄；手機由「更多」打開 ---- */
.sidebar{background:var(--side);color:var(--side-ink);border-right:.5px solid var(--line)}
.sidebar .icon-btn{color:var(--primary)}
.sidebar .icon-btn:hover,.nav-item:hover{background:var(--soft)}
.nav-item{border-radius:10px;padding:10px 12px;font-size:17px}
.nav-item.active{background:var(--primary);color:var(--primary-ink);font-weight:600}
.brand-name{font-size:20px}
.scrim{background:rgba(0,0,0,.32)}
@media (max-width:899px){
  #menuBtn{display:none}
  .sidebar{width:280px;border-right:0;border-radius:0 16px 16px 0;box-shadow:0 0 40px rgba(0,0,0,.2)}
  .sidebar.collapsed{width:280px}
}

/* ---- 底部分頁列（手機）：毛玻璃、圖示＋標籤、強調色表示目前頁面 ---- */
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:34;display:grid;grid-template-columns:repeat(5,1fr);
  padding:6px 4px calc(4px + env(safe-area-inset-bottom,0px));background:var(--bar-bg);
  -webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);box-shadow:0 -.5px 0 var(--line);
  transition:transform .2s ease}
.tabbar.hide{transform:translateY(110%)}
.tb-item{border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 0;color:var(--muted);font-size:10px;font-weight:500;position:relative}
.tb-item svg{width:26px;height:26px;display:block}
.tb-item.active{color:var(--primary)}
.tb-item .tb-badge{position:absolute;top:0;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#FF3B30;color:#fff;font-size:12px;line-height:18px;font-weight:600}
@media (min-width:900px){ .tabbar{display:none} .page{padding-bottom:48px} }

/* ---- 版本切換 ---- */
.ui-switch{background:var(--surface)}
"""
sub('</style>', CSS + '</style>')

ICON = {
    'input': '<path d="M12 7v10M7 12h10" stroke-width="2"/><circle cx="12" cy="12" r="9.2"/>',
    'expense': '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
    'analysis': '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/><path d="M3 20.5h18" stroke-width="1.4"/>',
    'splits': '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4.3"/>',
    'more': '<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
}
BADGE = '<span class="tb-badge" id="tbBadge" hidden></span>'
LABEL = {'input': '記帳', 'expense': '概覽', 'analysis': '分析', 'splits': '分帳', 'more': '更多'}
tabs = ''.join(
    f'<button class="tb-item" type="button" data-tb="{k}" aria-label="{LABEL[k]}">'
    f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[k]}</svg>'
    f'<span>{LABEL[k]}</span>{BADGE if k == "more" else ""}</button>'
    for k in ['input', 'expense', 'analysis', 'splits', 'more'])
sub('  </main>\n', f'  </main>\n  <nav class="tabbar" id="tabbar" aria-label="主要頁面">{tabs}</nav>\n')

JS = r"""
<script>
/* 新設計：底部分頁列（手機）。「更多」打開側欄（旅程、待確認、搜尋、設定、Google Sheet） */
(() => {
  const bar = document.getElementById('tabbar'), MAIN = ['input', 'expense', 'analysis', 'splits'];
  const mark = () => bar.querySelectorAll('.tb-item').forEach(b => b.classList.toggle('active', b.dataset.tb === (MAIN.includes(S.page) ? S.page : 'more')));
  const _go = go; go = function(p){ _go(p); mark(); };
  bar.addEventListener('click', e => { const b = e.target.closest('[data-tb]'); if (!b) return;
    if (b.dataset.tb === 'more') openDrawer(); else if (b.dataset.tb === S.page) scrollTo({ top:0, behavior:'smooth' }); else go(b.dataset.tb); });
  // 待確認數字顯示在「更多」
  const src = document.getElementById('ibBadge'), dst = document.getElementById('tbBadge');
  const sync = () => { dst.hidden = src.hidden; dst.textContent = src.textContent; };
  new MutationObserver(sync).observe(src, { attributes:true, childList:true, characterData:true, subtree:true }); sync();
  // 輸入時收起分頁列，避免遮住鍵盤上方的按鈕
  document.addEventListener('focusin', e => { if (e.target.matches('input,textarea,select')) bar.classList.add('hide'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches('input,textarea,select')) bar.classList.remove('hide'); }, 50));
  mark();
})();
</script>
"""
sub('</body>', JS + '</body>')

(ROOT / 'next.html').write_text(s, encoding='utf-8')
print(f'已產生 next.html（{len(s.encode("utf-8")) // 1024} KB）')
