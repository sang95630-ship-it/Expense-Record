#!/usr/bin/env python3
"""由 classic.html（經典版，亦是程式碼來源）產生 index.html（預設的新設計，參考 Apple Human Interface Guidelines 及 iOS 26 Liquid Glass）。

用法：python3 tools/build_next.py
- 功能及資料完全共用：同一份程式碼、同一個 localStorage（TOKEN、佇列、快取），兩個版本可隨時切換
- 只更換外觀、導覽及動態：
  · 材質：內容層（卡片）實色；控制層（分頁列、置頂列、按鈕、提示、側欄）用「玻璃」——半透明＋模糊＋飽和＋邊緣高光
  · 形狀：同心圓角（外層卡片 22px、內層欄位 14px、按鈕膠囊形）
  · 色彩：系統背景色階＋可選強調色（鋼藍／藍／靛／青／粉紅／石墨，設定頁選擇，localStorage uiTint）
  · 動態：彈簧曲線（CSS linear() 以阻尼彈簧計算）；頁面淡入上移、分段控制滑塊、分頁列透鏡滑動、下捲縮細、表單頁彈出、按壓縮放；
    Android 觸感回饋（navigator.vibrate）；系統「減少動態效果」時全部停用
- 每次修改 classic.html 後重新執行，令新設計保持最新
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / 'classic.html').read_text(encoding='utf-8')


def sub(old, new, count=1):
    global s
    assert s.count(old) == count, f'找不到或不唯一：{old[:60]}'
    s = s.replace(old, new)


sub('<meta name="theme-color" content="#37474F">',
    '<meta name="theme-color" content="#F2F2F7" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">')
# 強調色：於載入前套用，避免閃爍
sub('<title>記帳簿</title>', '<title>記帳簿</title>\n<script>try{document.documentElement.dataset.tint=localStorage.getItem("uiTint")||"steel"}catch(e){}</script>')

# 設定頁：返回經典版＋強調色
TINTS = [('steel', '鋼藍', '#2F6F94'), ('blue', '藍', '#007AFF'), ('indigo', '靛', '#5856D6'),
         ('teal', '青', '#1A8CA6'), ('pink', '粉紅', '#D3264F'), ('graphite', '石墨', '#5B5B60')]
tint_btns = ''.join(f'<button type="button" class="tint-dot" data-tint="{k}" style="--c:{c}" aria-label="{n}"><i></i><span>{n}</span></button>' for k, n, c in TINTS)
sub('<a class="ui-switch" id="uiSwitch" href="./"><span>✨</span><span><b>改用新設計（預設）</b><small>經典版為後備版本，資料共用</small></span><span>›</span></a>',
    '<a class="ui-switch" id="uiSwitch" href="classic.html"><span>↩︎</span><span><b>改用經典版</b><small>後備版本，資料共用，可隨時切換回來</small></span><span>›</span></a>')
sub('<button type="button" class="theme-btn" id="themeBtn"></button></div>', '<button type="button" class="theme-btn" id="themeBtn"></button></div>\n'
    f'      <div class="card tint-card" id="tintCard"><div class="tint-h">強調色</div><div class="tint-row" id="tintRow">{tint_btns}</div></div>')

# 彈簧曲線：阻尼彈簧 x(t)（SwiftUI .spring(duration:, bounce:) 同一模型）取樣成 CSS linear()
SPRING = 'linear(0, 0.043, 0.14, 0.258, 0.376, 0.487, 0.584, 0.667, 0.736, 0.793, 0.838, 0.874, 0.903, 0.925, 0.943, 0.956, 0.967, 0.975, 0.981, 0.986, 0.989, 0.992, 0.994, 0.995, 1)'
SPRING_B = 'linear(0, 0.045, 0.149, 0.28, 0.416, 0.543, 0.655, 0.749, 0.825, 0.883, 0.927, 0.959, 0.98, 0.995, 1.004, 1.009, 1.011, 1.011, 1.01, 1.009, 1.008, 1.006, 1.005, 1.004, 1)'

CSS = r"""
/* ================= 新設計（Apple HIG／Liquid Glass 風格）================= */
:root{
  --bg:#F2F2F7;--surface:#FFFFFF;--surface-2:rgba(118,118,128,.12);--ink:#1C1C1E;--muted:rgba(60,60,67,.6);--line:rgba(60,60,67,.14);
  --primary:#2F6F94;--primary-ink:#FFFFFF;--soft:rgba(118,118,128,.12);--side:#F2F2F7;--side-ink:#1C1C1E;
  --danger:#D70015;--warn-bg:rgba(255,149,0,.15);--warn-ink:#B25000;--st-ok:#248A3D;--st-warn:#C93400;--hl-mid:#B86E00;
  --seg-on:#FFFFFF;--hud:rgba(30,30,32,.82);
  --glass:rgba(255,255,255,.6);--glass-edge:rgba(255,255,255,.75);--glass-shadow:0 10px 30px rgba(0,0,0,.10),0 1px 3px rgba(0,0,0,.06);
  --spring:__SPRING__;--spring-b:__SPRING_B__;--ease-out:cubic-bezier(.32,.72,0,1);
  --r-card:22px;--r-field:14px;
}
:root[data-tint="blue"]{--primary:#007AFF} :root[data-tint="indigo"]{--primary:#5856D6} :root[data-tint="teal"]{--primary:#1A8CA6}
:root[data-tint="pink"]{--primary:#D3264F} :root[data-tint="graphite"]{--primary:#5B5B60}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#000000;--surface:#1C1C1E;--surface-2:rgba(118,118,128,.24);--ink:#F2F2F7;--muted:rgba(235,235,245,.6);--line:rgba(84,84,88,.5);
    --primary:#6AB4E0;--primary-ink:#00131F;--soft:rgba(118,118,128,.24);--side:#1C1C1E;--side-ink:#F2F2F7;
    --danger:#FF453A;--warn-bg:rgba(255,159,10,.18);--warn-ink:#FFB340;--st-ok:#30D158;--st-warn:#FF9F0A;--hl-mid:#FFC266;
    --seg-on:#636366;--hud:rgba(58,58,60,.82);
    --glass:rgba(44,44,48,.55);--glass-edge:rgba(255,255,255,.14);--glass-shadow:0 10px 30px rgba(0,0,0,.5);
  }
  :root:not([data-theme="light"])[data-tint="blue"]{--primary:#0A84FF;--primary-ink:#fff}
  :root:not([data-theme="light"])[data-tint="indigo"]{--primary:#7D7AFF;--primary-ink:#fff}
  :root:not([data-theme="light"])[data-tint="teal"]{--primary:#40C8E0;--primary-ink:#001A20}
  :root:not([data-theme="light"])[data-tint="pink"]{--primary:#FF6482;--primary-ink:#2A0009}
  :root:not([data-theme="light"])[data-tint="graphite"]{--primary:#AEAEB2;--primary-ink:#000}
}
:root{--tint-fill:color-mix(in srgb,var(--primary) 14%,transparent)}

body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang HK","PingFang TC","Noto Sans TC",system-ui,sans-serif;
  font-size:17px;line-height:1.4;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
/* 環境光：頁頂一抹強調色，令玻璃有可折射的色彩 */
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(120% 50% at 15% -10%,color-mix(in srgb,var(--primary) 20%,transparent),transparent 70%),
             radial-gradient(90% 40% at 100% 0%,color-mix(in srgb,var(--primary) 10%,transparent),transparent 70%)}
.small{font-size:13px}
.num,.amt,.total,#amount{font-feature-settings:"tnum"}
.total,.split2 .t2,#amount,.sp-total{font-family:ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif}

/* ---- 玻璃材質（控制層） ---- */
.tabbar,.sync-btn,.toast,.sidebar,.combo,.month-nav .ghost{
  -webkit-backdrop-filter:blur(22px) saturate(190%);backdrop-filter:blur(22px) saturate(190%)}

/* ---- 置頂列（iOS 大標題模式）----
   大標題（#largeTitle）屬內容層，隨頁面自然向上捲走；越過門檻（捲到置頂列之下）時切換 .collapsed：大標題淡出、置頂列小標題及玻璃背景淡入。
   淡入淡出以固定時間播放（與捲動速度無關），門檻設有回差（>28px 收起、<16px 展開），避免在門檻附近來回閃動。
   全程跟隨手指，沒有突然切換的字級或對齊，因此轉換順滑 */
.topbar{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:0;background:transparent;box-shadow:none;max-width:none;
  padding:calc(20px + env(safe-area-inset-top,0px)) 12px 6px;min-height:calc(64px + env(safe-area-inset-top,0px));isolation:isolate}
.topbar::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--glass);box-shadow:0 .5px 0 var(--line);
  -webkit-backdrop-filter:blur(22px) saturate(190%);backdrop-filter:blur(22px) saturate(190%);opacity:0;transition:opacity .3s ease}
.topbar.collapsed::before{opacity:1}
.topbar h1,.topbar.compact h1{grid-column:2;font-size:17px;font-weight:600;justify-content:center;text-align:center;opacity:0;
  transform:translateY(8px);transition:opacity .22s ease,transform .22s ease}
.topbar.collapsed h1{opacity:1;transform:none;transition:opacity .34s ease .06s,transform .5s var(--spring-b) .06s}
.topbar .tb-tx,.topbar.compact .tb-tx{display:inline} .topbar .tb-ic,.topbar.compact .tb-ic{display:none!important}
.topbar #menuBtn{grid-column:1}
.topbar .sync-btn{grid-column:3;justify-self:end}
/* 待確認小鈴鐺：在同步按鈕左邊（玻璃圓鈕＋紅色數字）；出現時大標題及同步狀態向左讓位 */
.topbar .bell-btn{position:absolute;right:58px;top:calc(21px + env(safe-area-inset-top,0px));background:var(--glass);border:.5px solid var(--glass-edge);
  box-shadow:var(--glass-shadow);transition:transform .4s var(--spring-b)}
.topbar .bell-btn:active{transform:scale(.88)}
.topbar .bell-btn:not([hidden]){animation:bellIn .5s var(--spring-b)}
@keyframes bellIn{0%{transform:scale(.6);opacity:0}100%{transform:none;opacity:1}}
.topbar.compact .bell-btn{right:48px;top:calc(18px + env(safe-area-inset-top,0px))}
:root:has(#ibBell:not([hidden])) .large-title{margin-right:108px}
.topbar:has(#ibBell:not([hidden])) #syncState{right:102px}
#syncState{position:absolute;right:58px;top:calc(50% + env(safe-area-inset-top,0px)/2);transform:translateY(-50%);font-size:12px}
.large-title{font-size:34px;font-weight:700;letter-spacing:.005em;line-height:1.15;margin:calc(-45px - env(safe-area-inset-top,0px)) 64px 12px 20px; /* 置頂列上方多留 14px（方案 B），大標題隨之下移 */
  padding-top:env(safe-area-inset-top,0px);max-width:720px;position:relative;z-index:0;pointer-events:none; /* 與同步按鈕同一行：上移至置頂列內，右邊留位給按鈕 */
  transform-origin:left bottom;transition:opacity .3s ease,transform .45s var(--spring)}
.large-title.collapsed{opacity:0;transform:scale(.96)}
.sync-btn{width:36px;height:36px;padding:3px;background:var(--glass);border:.5px solid var(--glass-edge);box-shadow:var(--glass-shadow);transition:transform .4s var(--spring-b)}
.sync-btn svg circle{fill:transparent} .sync-btn .ar{stroke:var(--primary);stroke-width:40} .sync-btn .ah{fill:var(--primary)}
.sync-btn:active{transform:scale(.88)}
#syncState{font-size:13px}
.page{padding:4px 16px calc(112px + env(safe-area-inset-bottom,0px));max-width:720px;margin:0 auto}
@media (min-width:900px){ .topbar{padding-left:28px} .page{margin:0;padding-left:28px;padding-bottom:48px} .large-title{margin-left:32px} }

/* ---- 頁面切換：淡入上移；子區塊依次出現 ---- */
.page:not([hidden]){animation:pageIn .5s var(--ease-out) backwards}
.large-title.swap:not(.collapsed){animation:riseIn .5s var(--ease-out) backwards}
.page:not([hidden])>*{animation:riseIn .55s var(--ease-out) backwards}
.page:not([hidden])>*:nth-child(2){animation-delay:.03s} .page:not([hidden])>*:nth-child(3){animation-delay:.06s}
.page:not([hidden])>*:nth-child(4){animation-delay:.09s} .page:not([hidden])>*:nth-child(n+5){animation-delay:.12s}
@keyframes pageIn{from{opacity:0}}
@keyframes riseIn{from{opacity:0;transform:translateY(12px)}}

/* ---- 內容層：分組列表、同心圓角 ---- */
h2{font-size:13px;font-weight:500;color:var(--muted);margin:26px 18px 8px;letter-spacing:.02em}
.card{border-radius:var(--r-card);padding:16px 18px}
.list{padding:2px 0 2px 18px}
.rec{padding:11px 18px 11px 0;border-bottom:.5px solid var(--line);gap:12px}
.rec .em{width:38px;height:38px;border-radius:50%;background:var(--tint-fill);font-size:19px}
.rec .main div:first-child{font-size:17px}
.rec .sub{font-size:13px}
.rec .amt{font-weight:600;font-size:17px}
.rec .ghost{padding:5px 12px}
.rec.hl-big::before{left:-18px}
.day-head{font-size:13px}
details.wk{border-radius:var(--r-card);padding:0 18px}
details.wk .day-head{border-top:.5px solid var(--line)}
.wk-bar{height:4px;background:var(--soft)}
.wk-bar i{background:var(--primary)}
.wk-now{background:var(--tint-fill);color:var(--primary);font-weight:600}
details.fold>summary h2{margin:0;font-size:19px;font-weight:700;color:var(--ink);letter-spacing:0}
.fold-btn{background:var(--soft)!important;transition:transform .5s var(--spring-b)}

/* ---- 控制項 ---- */
.seg{background:var(--soft);padding:2px;border-radius:999px;gap:0}
.seg button{border-radius:999px;font-size:14px;font-weight:500;color:var(--ink);padding:6px 14px;transition:background .3s var(--ease-out)}
.seg button.active{background:var(--seg-on);font-weight:600;box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04)}
/* 類別分段控制：滑塊以彈簧移動（--si 由程式設定） */
.tabs{position:relative;background:var(--soft);padding:3px;border-radius:999px;gap:0}
.tabs::before{content:"";position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/4);border-radius:999px;background:var(--seg-on);
  box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04);transform:translateX(calc(var(--si,1) * 100%));transition:transform .5s var(--spring-b)}
.tabs.none::before{opacity:0}
.tab{position:relative;z-index:1;border-radius:999px;font-size:15px;font-weight:500;color:var(--ink);padding:8px 0;transition:color .2s}
.tab.active{background:none!important;box-shadow:none!important;font-weight:600}
.text-in{border:0;background:var(--surface-2);border-radius:var(--r-field);padding:12px 15px;font-size:17px;transition:box-shadow .2s}
.text-in:focus{box-shadow:0 0 0 2px var(--primary)}
select.text-in{padding:11px 13px}
.field{font-size:13px;gap:6px}
button{transition:transform .35s var(--spring-b),background-color .2s,opacity .2s}
button:active:not(:disabled){transform:scale(.96)}
.primary{border-radius:999px;padding:0 20px;min-height:52px;font-size:17px;font-weight:600;letter-spacing:-.01em;
  box-shadow:0 6px 18px color-mix(in srgb,var(--primary) 30%,transparent)}
.ghost{border:0;background:var(--tint-fill);color:var(--primary);border-radius:999px;padding:7px 14px;font-size:15px;font-weight:500}
.ghost.danger{background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)}
.row-btns .ghost{padding:0 18px;min-height:52px;font-size:17px}
.month-nav .ghost{width:36px;height:36px;padding:0;border-radius:50%;font-size:20px;background:var(--glass);border:.5px solid var(--glass-edge);box-shadow:var(--glass-shadow)}
.month-nav strong{font-size:20px;font-weight:700}
.link-btn{color:var(--primary);font-size:17px}
.link-btn.strong{color:var(--primary);font-weight:600}
.hint{font-size:13px}
.ib-banner{border-radius:var(--r-card);padding:13px 18px;font-weight:600}
.rm-chip{border:0;background:var(--surface-2);font-size:14px;padding:6px 13px}
.sp-chip{border:0;background:var(--surface-2);font-size:15px}
.sp-chip.on{background:var(--primary);color:var(--primary-ink)}
.ui-switch,.tint-card,.theme-btn{border-radius:var(--r-card)}
.theme-btn{color:var(--primary);font-weight:600}
.bud-card{border-bottom:.5px solid var(--line)}
.bud-num,.sr-sum .v{font-family:ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif}
.sr-field{border-radius:var(--r-field)}
.it-row button,.rule button{border:0;background:var(--surface-2);border-radius:12px}
.it-row button.x,.rule button{color:var(--danger)}

/* ---- 新增支出：常用組合（玻璃膠囊）、圖示格、大金額 ---- */
.combo-row{margin:0 -16px 14px;padding:4px 16px 6px}
.combo{background:var(--glass);border:.5px solid var(--glass-edge);box-shadow:var(--glass-shadow);border-radius:999px;padding:7px 15px 7px 9px}
.combo .em{width:30px;height:30px;border-radius:50%;background:var(--tint-fill);display:grid;place-items:center;font-size:17px}
.grid{gap:10px;margin:18px 0 18px}
/* 項目格：白色圓角卡片＋立體插圖（參考 Copilot） */
.chip{background:var(--surface);border:2px solid transparent;border-radius:20px;padding:12px 4px 10px;gap:6px;font-size:13px;font-weight:500;color:var(--ink);
  box-shadow:0 1px 2px rgba(0,0,0,.05);transition:transform .45s var(--spring-b),background .2s,border-color .2s}
.chip .em{width:40px;height:40px;display:grid;place-items:center;font-size:32px;line-height:1}
.chip .emo{width:40px;height:40px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.12))}
.chip:active{transform:scale(.94)}
.chip.active{background:var(--tint-fill);border-color:var(--primary);font-weight:600;color:var(--ink)}
.chip.active .em{animation:pop .5s var(--spring-b)}
.rec .emo{width:24px;height:24px}.combo .emo{width:21px;height:21px}
@keyframes pop{40%{transform:scale(1.1)}}
.form{gap:14px}
.date-btn{background:var(--surface-2);border-radius:var(--r-field);padding:12px 15px;font-size:17px}
.date-btn .today{font-size:15px;color:var(--primary);font-weight:600}
.amount-row{border-bottom:0;padding:0;align-items:center}
#amount{font-size:56px;font-weight:600;letter-spacing:-.025em;line-height:1.1}
.cur-wrap{background:var(--surface-2);border-radius:999px;font-size:17px;font-weight:600;padding:7px 12px 7px 14px}
.save-row .ghost{flex:0 0 auto}

/* ---- 數字、圖表 ---- */
.total{font-size:36px;font-weight:700;letter-spacing:-.02em}
.split2 .t2{font-size:clamp(20px,6.4vw,26px);font-weight:700;letter-spacing:-.02em;white-space:nowrap}
.bar{height:6px;background:var(--soft);border-radius:3px}
.bar i{border-radius:3px;transition:width .8s var(--spring)}
.proj{background:var(--surface-2);border-radius:var(--r-field)}
.aa-line{background:var(--tint-fill);color:var(--ink);border-radius:var(--r-field)}

/* ---- 表單頁：懸浮圓角卡、拉柄、彈出 ---- */
.overlay{background:rgba(0,0,0,.28)}
.overlay.show{animation:pageIn .3s ease backwards}
.sheet{position:relative;padding-top:24px;border-radius:30px;margin:0 8px calc(8px + env(safe-area-inset-bottom,0px));width:calc(100% - 16px);
  padding-bottom:20px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.overlay.show .sheet{animation:sheetUp .55s var(--ease-out) backwards}
@keyframes sheetUp{from{transform:translateY(105%)}}
.sheet::before{content:"";position:absolute;top:8px;left:50%;width:38px;height:5px;margin-left:-19px;border-radius:3px;background:var(--line)}
@media (min-width:900px){ .sheet{margin:0;width:100%;border-radius:26px} .sheet::before{display:none} .overlay.show .sheet{animation-name:zoomIn} }
@keyframes zoomIn{from{transform:scale(.94);opacity:0}}
.sheet-head strong{font-size:17px;font-weight:600}
.wheel::before{background:var(--surface-2);border-radius:12px}

/* ---- 提示：玻璃膠囊，彈簧出現 ---- */
.toast{background:var(--hud);color:#fff;border-radius:999px;border:.5px solid rgba(255,255,255,.12);
  bottom:calc(100px + env(safe-area-inset-bottom,0px));font-size:15px;box-shadow:0 12px 32px rgba(0,0,0,.22);
  transition:opacity .25s,transform .55s var(--spring-b)}
@media (min-width:900px){ .toast{bottom:28px} }

/* ---- 側欄：玻璃面板（手機由「更多」打開；電腦固定於左方） ---- */
.sidebar{background:color-mix(in srgb,var(--side) 82%,transparent);color:var(--side-ink);border-right:.5px solid var(--line)}
.sidebar .icon-btn{color:var(--primary)}
.sidebar .icon-btn:hover,.nav-item:hover{background:var(--soft)}
.nav-item{border-radius:999px;padding:11px 14px;font-size:17px}
.nav-item.active{background:var(--primary);color:var(--primary-ink);font-weight:600}
.brand-name{font-size:22px}
.scrim{background:rgba(0,0,0,.28)}
@media (max-width:899px){
  #menuBtn{display:none}
  .sidebar{width:288px;border-right:0;border-radius:0 30px 30px 0;box-shadow:0 0 50px rgba(0,0,0,.22);transition:transform .5s var(--ease-out)}
  .sidebar.collapsed{width:288px}
}

/* ---- 懸浮分頁列（手機）：玻璃膠囊；目前頁面以「透鏡」標示並以彈簧滑動；下捲縮細，上捲還原 ---- */
.tabbar{position:fixed;left:14px;right:14px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:34;display:grid;grid-template-columns:repeat(5,1fr);
  padding:5px;border-radius:999px;background:var(--glass);border:.5px solid var(--glass-edge);box-shadow:var(--glass-shadow),inset 0 1px 0 var(--glass-edge);
  transition:transform .5s var(--spring-b),left .5s var(--spring),right .5s var(--spring),padding .5s var(--spring)}
.tabbar.hide{transform:translateY(160%)}
.tabbar.mini{left:22%;right:22%;padding:3px}
.tb-lens{position:absolute;top:5px;bottom:5px;left:5px;width:calc((100% - 10px)/5);border-radius:999px;background:var(--tint-fill);
  transform:translateX(calc(var(--ti,0) * 100%));transition:transform .55s var(--spring-b),top .5s var(--spring),bottom .5s var(--spring),left .5s var(--spring),width .5s var(--spring)}
.tabbar.mini .tb-lens{top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/5)}
.tb-item{position:relative;z-index:1;border:0;background:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:5px 0 4px;color:var(--ink);font-size:10px;font-weight:600;min-height:52px;transition:min-height .5s var(--spring),color .2s}
.tb-item svg{width:25px;height:25px;display:block;transition:transform .5s var(--spring-b)}
.tb-item span{transition:opacity .2s,height .3s;height:13px;overflow:hidden}
.tabbar.mini .tb-item{min-height:40px} .tabbar.mini .tb-item span:not(.tb-badge){opacity:0;height:0}
.tb-item.active{color:var(--primary)}
.tb-item.active svg{transform:scale(1.08)}
.tb-item.bump svg{animation:pop .45s var(--spring-b)}
.tb-item .tb-badge{position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#FF3B30;color:#fff;font-size:11px;line-height:18px;font-weight:700;opacity:1}
@media (min-width:900px){ .tabbar{display:none} }

/* ---- 強調色選擇 ---- */
.tint-card{margin:0 0 14px}
.tint-h{font-size:13px;color:var(--muted);margin-bottom:10px}
.tint-row{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.tint-dot{border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:var(--muted);padding:0}
.tint-dot i{width:30px;height:30px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.15);transition:transform .45s var(--spring-b),box-shadow .2s}
.tint-dot.on i{box-shadow:0 0 0 2px var(--surface),0 0 0 4px var(--c);transform:scale(1.05)}
.tint-dot.on span{color:var(--ink);font-weight:600}

/* ---- 減少動態效果 ---- */
@media (prefers-reduced-motion: reduce){ *,*::before,*::after{animation:none!important;transition:none!important} }
""".replace('__SPRING__', SPRING).replace('__SPRING_B__', SPRING_B)
sub('</style>', CSS + '</style>')

ICON = {
    'input': '<path d="M12 7.5v9M7.5 12h9" stroke-width="2"/><circle cx="12" cy="12" r="9.2"/>',
    'expense': '<rect x="4" y="3.5" width="16" height="17" rx="3.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
    'analysis': '<path d="M5.5 19.5V12M10 19.5V6M14.5 19.5v-9M19 19.5V9"/>',
    'splits': '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4.3"/>',
    'more': '<circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
}
BADGE = '<span class="tb-badge" id="tbBadge" hidden></span>'
LABEL = {'input': '記帳', 'expense': '概覽', 'analysis': '分析', 'splits': '分帳', 'more': '更多'}
tabs = '<span class="tb-lens" aria-hidden="true"></span>' + ''.join(
    f'<button class="tb-item" type="button" data-tb="{k}" aria-label="{LABEL[k]}">'
    f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[k]}</svg>'
    f'<span>{LABEL[k]}</span>{BADGE if k == "more" else ""}</button>'
    for k in ['input', 'expense', 'analysis', 'splits', 'more'])
sub('    </header>\n', '    </header>\n    <div class="large-title" id="largeTitle" aria-hidden="true">新增支出</div>\n')
sub('  </main>\n', f'  </main>\n  <nav class="tabbar" id="tabbar" aria-label="主要頁面">{tabs}</nav>\n')

JS = r"""
<script>
/* 新設計：懸浮分頁列、分段控制滑塊、觸感回饋、強調色 */
(() => {
  const bar = document.getElementById('tabbar'), MAIN = ['input', 'expense', 'analysis', 'splits', 'more'];
  const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch(e){} };
  // 分頁列：目前頁面＋透鏡位置
  const mark = () => {
    const cur = MAIN.includes(S.page) ? S.page : 'more';
    bar.querySelectorAll('.tb-item').forEach(b => b.classList.toggle('active', b.dataset.tb === cur));
    bar.style.setProperty('--ti', MAIN.indexOf(cur));
  };
  // 大標題：越過門檻才切換狀態，淡入淡出以固定時間播放（不受捲動速度影響）；回差避免來回閃動
  const top = document.querySelector('.topbar'), lt = document.getElementById('largeTitle');
  let tick = false, col = false;
  const titleScroll = () => { tick = false; const y = Math.max(0, scrollY);
    const next = col ? y > 16 : y > 28; if (next === col) return; col = next;
    top.classList.toggle('collapsed', col); lt.classList.toggle('collapsed', col); };
  addEventListener('scroll', () => { if (!tick){ tick = true; requestAnimationFrame(titleScroll); } }, { passive:true });
  const _go = go; go = function(p){ _go(p); mark(); bar.classList.remove('mini'); lt.textContent = TITLES[p] || '';
    lt.classList.remove('swap'); void lt.offsetWidth; lt.classList.add('swap'); titleScroll(); };
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-tb]'); if (!b) return;
    haptic(); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    if (b.dataset.tb === 'more') openDrawer(); else if (b.dataset.tb === S.page) scrollTo({ top:0, behavior:'smooth' }); else go(b.dataset.tb);
  });
  // 待確認數字顯示在「更多」
  const src = document.getElementById('ibBadge'), dst = document.getElementById('tbBadge');
  const sync = () => { dst.hidden = src.hidden; dst.textContent = src.textContent; };
  new MutationObserver(sync).observe(src, { attributes:true, childList:true, characterData:true, subtree:true }); sync();
  // 輸入時收起分頁列（避免遮住鍵盤上方的按鈕）；下捲縮細，上捲還原
  document.addEventListener('focusin', e => { if (e.target.matches('input,textarea,select')) bar.classList.add('hide'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches('input,textarea,select')) bar.classList.remove('hide'); }, 60));
  let lastY = scrollY;
  addEventListener('scroll', () => { const y = scrollY, d = y - lastY; if (Math.abs(d) < 6) return;
    bar.classList.toggle('mini', d > 0 && y > 120); lastY = y; }, { passive:true });
  // 類別分段控制：滑塊跟隨選中項目
  const tabs = document.querySelector('.tabs');
  const seg = () => { const all = [...tabs.querySelectorAll('.tab')], i = all.findIndex(t => t.classList.contains('active'));
    tabs.classList.toggle('none', i < 0); if (i >= 0) tabs.style.setProperty('--si', i); };
  new MutationObserver(seg).observe(tabs, { attributes:true, subtree:true, attributeFilter:['class'] }); seg();
  // 觸感回饋：選擇類別／項目、儲存
  document.addEventListener('click', e => { if (e.target.closest('.tab,.chip,.combo,.seg button,#saveBtn,.sp-chip,.tint-dot')) haptic(); });
  // 強調色
  const row = document.getElementById('tintRow');
  const tint = () => row.querySelectorAll('.tint-dot').forEach(b => b.classList.toggle('on', b.dataset.tint === (document.documentElement.dataset.tint || 'steel')));
  row.addEventListener('click', e => { const b = e.target.closest('[data-tint]'); if (!b) return;
    document.documentElement.dataset.tint = b.dataset.tint; try { localStorage.setItem('uiTint', b.dataset.tint); } catch(e){} tint(); });
  tint(); mark(); lt.textContent = TITLES[S.page] || ''; titleScroll();
})();
</script>
"""
sub('</body>', JS + '</body>')

# 手動深色（外觀按鈕）：把 @media 深色區塊複製一份給 :root[data-theme="dark"]
m = re.search(r'@media \(prefers-color-scheme: dark\)\{\n(  :root:not\(\[data-theme="light"\]\)\{.*?\n  \}\n(?:  :root:not.*?\n)*)\}', CSS, re.S)
assert m, 'dark block'
sub('</style>', m.group(1).replace(':root:not([data-theme="light"])', ':root[data-theme="dark"]') + '</style>')
(ROOT / 'index.html').write_text(s, encoding='utf-8')
print(f'已產生 index.html（{len(s.encode("utf-8")) // 1024} KB）')
