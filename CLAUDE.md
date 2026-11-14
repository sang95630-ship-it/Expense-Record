# 記帳簿 Expense Tracker — 專案交接

## 語言與風格
- 全程使用繁體中文回覆；程式碼註解可用繁中
- 專業、數據導向，優先提供可直接執行的方案
- 每次回覆結尾附 1-2 條針對性問題（風險／盲點／更佳方向）

## 專案目標
個人用（暫時只有自己用）的消費紀錄網頁：
- 手機／電腦輸入支出 → 自動寫入指定 Google Sheet → 長期紀錄及分析消費習慣
- 前端：GitHub Pages（靜態 index.html，無 build step）
- 後端：Google Apps Script Web App（Code.gs，綁定在 Google Sheet 內）

## 架構決定（已確認）
- 選用「GAS Web App」而非「OAuth + Sheets API」：純前端 OAuth token 約 1 小時到期、無 refresh token，不符合「F5 後無需重新綁定」的需求
- 綁定方式：Web App `/exec` URL + TOKEN 存於 `localStorage`（key: `expenseCfg`）
- TOKEN 是自訂隨機字串（例如 `crypto.randomUUID().replace(/-/g,'')`），**不是** Google 密碼；**絕不能**硬寫進 index.html（repo 可能是 public）
- POST 使用 `Content-Type: text/plain;charset=utf-8` 以避免 CORS preflight（GAS 不處理 OPTIONS）
- GET 的 token 放在 query string（個人用途可接受）
- Web App 部署：執行身分「我」，存取權「所有人」
- 時區：Apps Script 專案及 Sheet 都須設為 Asia/Hong_Kong

## 需求清單與實作狀態
| # | 需求 | 狀態 |
|---|---|---|
| 1 | 頂部 4 個 section：旅遊／日常／固定／其他，預設「日常」 | ✅ |
| 2 | 各 section 有 emoji icon 快選項目（各 8 個） | ✅ |
| 3 | 「固定」項目每月 1 號自動入帳（GAS time-driven trigger `monthlyJob`，以 FixedID+月份防重複） | ✅ |
| 4 | 日期預設今天，點擊以滾輪（年／月／日 scroll-snap）選擇，類似 iOS picker | ✅ |
| 5 | 金額 + 備註輸入 | ✅ |
| 6 | 可收合 sidebar：Input / Expense / Details / Monthly Analysis（+ 設定） | ✅ |
| 7 | Blue gray 主色調（支援系統深色模式） | ✅ |
| 8 | Monthly Analysis：預設顯示上個月；SVG 圓餅圖（按類別／按項目）+ 最大 3 筆支出 + 環比 % + 固定支出佔比 | ✅ |
| + | Expense 頁可「修改／停用／重新啟用」固定項目（因費用常加價）；可選同時更新本月已入帳金額；History 欄記錄加價（例如 `2026-12: 68→78`） | ✅ |
| + | 離線暫存佇列（localStorage `expenseQueue`），恢復網絡自動補送；伺服器以 ID 防重複 | ✅ |
| + | 刪除單筆紀錄 | ✅ |
| + | 幣種＋匯率：預設 HKD；常用 JPY／CNY／HKD／USD，其他幣種於下方 optgroup；匯率自動取 open.er-api.com（每日快取 `fxRates`），可手動修改並記住（`fxManual`）；旅遊記住上次幣種（`lastTravelCur`）；固定項目只限 HKD | ✅ |
| + | 「其他」新增「補充品」🌿 | ✅ |
| + | 幣種選單平時只顯示符號（`#curLabel`），透明 select 覆蓋其上，下拉時才顯示「符號＋名稱＋代碼」；外幣時符號以橙色強調（`--warn-bg`／`--warn-ink`）；金額靠右 | ✅ |
| + | 標題列置頂（sticky）；Monthly Analysis 手機版圓餅圖不再超出寬度 | ✅ |
| + | 金額輸入即時加千位分隔號（`fmtAmountInput`，解析用 `num()` 去逗號） | ✅ |
| + | 常用備註快選：每個 section+項目顯示最常用 3 個備註（localStorage `remarkLog`，從已載入月份及新增紀錄累積，上限 1500 筆） | ✅ |
| + | 樂觀寫入：按「儲存」即寫入本機佇列並更新畫面（<0.1 秒），背景同步至 GAS；失敗保留佇列，於 online／回到前台／每 30 秒重試；未同步紀錄可直接刪除 | ✅ |
| + | 選擇類別後，鍵盤彈出時自動向下捲，令「儲存支出」按鈕位於鍵盤上方（`visualViewport` resize + `keepSaveVisible()`；頁面太短時臨時加底部空白）；儲存後收起鍵盤並平滑捲回頂部；「已儲存」提示顯示項目＋金額（外幣附 ≈HK$，非今天附日期），顯示 3.2 秒 | ✅ |
| + | 標題列右上角「同步」按鈕：送出本機佇列 → 清快取 → 重新讀取 Sheet；同步中圖示旋轉 | ✅ |
| + | PWA：`manifest.json` + `sw.js`（index.html 網絡優先、其他靜態檔快取優先、Google Fonts SWR；GAS／匯率 API 不快取）；圖示 `icon.svg`／`icon-192/512.png`／`icon-maskable-512.png`／`apple-touch-icon.png` | ✅ |

## Google Sheet 結構
- `Records`: ID | Date | Section | Item | Amount | Remark | CreatedAt | FixedID | Currency | FxRate | OrigAmount
  - Amount 一律為 HKD（分析用）；外幣支出：OrigAmount 為原幣金額，FxRate 為「1 外幣 = ? HKD」；舊表由 `ensureRecHead_()` 自動補欄位標題
- `Fixed`: ID | Item | Amount | Remark | StartYm（純文字 yyyy-MM） | Active | UpdatedAt | History

## API（Code.gs）
- GET `action=info` → `{sheetUrl}`
- GET `action=list&month=yyyy-MM` → `{rows}`
- GET `action=fixed` → `{rows}`
- POST `add` / `deleteRecord` / `updateFixed` / `toggleFixed`
- 所有請求需 `token`；寫入使用 `LockService`

## 部署步驟
1. 新 Google Sheet → 擴充功能 → Apps Script → 貼上 Code.gs，修改 TOKEN
2. 專案設定時區 Asia/Hong_Kong；Sheet「檔案 → 設定」亦同
3. 執行 `setup()` 一次（建表 + 每月 1 號 01:00 trigger）
4. 部署 → 網頁應用程式（我／所有人）→ 取得 `/exec` URL
5. index.html 推上 GitHub repo → Settings → Pages
6. 網頁「設定」頁貼上 URL + TOKEN
- 注意：修改 Code.gs 後須「管理部署作業 → 編輯 → 新版本」才生效

## 已知限制
- 修改圖示／manifest 等靜態檔後，須把 `sw.js` 的 `VERSION` 加 1，否則手機會繼續用舊快取（index.html 不受影響）
- 固定項目只從輸入月份的「下個月」起自動新增，補登過往月份不會回補
- GAS 每次讀寫約 1–3 秒延遲

## 待決定／可能的下一步
- 年繳項目（如保險年費）：是否在「固定」加入「週期：月／年」
- TOKEN 外洩時的作廢流程（換 TOKEN + 重新部署）
