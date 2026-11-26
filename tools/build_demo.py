#!/usr/bin/env python3
"""由 index.html（預設的新設計，先執行 build_next.py）產生單一檔案的體驗版 demo.html（可直接傳送或放上 GitHub Pages）。

用法：python3 tools/build_demo.py
- 嵌入 tools/demo-mock.js：頁內模擬伺服器＋虛構示範數據，資料只存在記憶體
- 移除 PWA（manifest、圖示、Service Worker）及設定頁的連結表單
- 每次修改 classic.html → build_next.py 後重新執行，令體驗版保持最新
"""
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = (sys.argv[1:3] + ['index.html', 'demo.html'][len(sys.argv[1:3]):])  # 可選：來源及輸出，例如 classic.html classic-demo.html
src = (ROOT / SRC).read_text(encoding='utf-8')
mock = (ROOT / 'tools' / 'demo-mock.js').read_text(encoding='utf-8')


def sub(s, old, new, count=1):
    assert s.count(old) == count, f'找不到或不唯一：{old[:60]}'
    return s.replace(old, new)


s = src
s = sub(s, '<title>記帳簿</title>', '<title>記帳簿（體驗版）</title>')
# 移除 PWA 相關：單一檔案沒有這些附屬檔
for line in ['<link rel="manifest" href="manifest.json">\n', '<link rel="icon" href="icon.svg" type="image/svg+xml">\n',
             '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n']:
    s = sub(s, line, '')
s = sub(s, "if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(() => {});\n", '')

# 體驗版樣式：隱藏「Details（開啟 Google Sheet）」、連結表單、首次設定步驟、同步狀態
demo_css = """
/* ---- 體驗版 ---- */
.nav-item[data-page="details"],#uiSwitch,#cfgForm,#qrH,#qrCard,#p-settings>h2:has(+ .steps),#p-settings .steps,#p-settings>h2:has(+ #healthBox),#healthBox{display:none!important}
.demo-banner{display:flex;gap:10px;align-items:flex-start;background:var(--warn-bg);color:var(--warn-ink);border-radius:14px;padding:10px 14px;margin:0 0 12px;font-size:13.5px;line-height:1.55}
.demo-banner b{display:block;font-size:14px}
"""
s = sub(s, '</style>', demo_css + '</style>')
banner = ('<div class="demo-banner" role="note"><span>👋</span><div><b>記帳簿 體驗版</b>'
          '所有數據都是虛構示範，只存在這個頁面，重新整理即回復原狀。可隨意新增、修改、刪除，'
          '亦可試試「📥 待確認」及「🧳 旅程」。</div></div>\n')
s = sub(s, '<section class="page" id="p-input">\n', '<section class="page" id="p-input">\n      ' + banner)

# 常用參加者換成虛構名字
s = sub(s, "const SPLIT_PEOPLE_DEF = [];", "const SPLIT_PEOPLE_DEF = ['阿明', '小美', '阿傑', 'Ken', 'Joyce'];")

# 圖示庫以 data URI 內嵌（單一檔案可離線分享）
import base64, json
emo = {f.stem: 'data:image/webp;base64,' + base64.b64encode(f.read_bytes()).decode() for f in sorted((ROOT / 'emoji').glob('*.webp'))}
s = sub(s, 'const EMO_DATA = null;', 'const EMO_DATA = ' + json.dumps(emo) + ';')

# 模擬伺服器須在主程式之前載入
s = sub(s, '<script>\nconst DEFAULT_SECTIONS', '<script>\n' + mock + '\n</script>\n<script>\nconst DEFAULT_SECTIONS')

(ROOT / OUT).write_text(s, encoding='utf-8')
print(f'已產生 {OUT}（{len(s.encode("utf-8")) // 1024} KB）')
