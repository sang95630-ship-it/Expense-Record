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
- TOKEN 是自訂隨機字串（例如 `crypto.randomUUID().replace(/-/g,'')`），**不是** Google 密碼；**絕不能**硬寫進 index.html 或 Code.gs（repo 可能是 public）
- 伺服器端 TOKEN 存於 Apps Script「指令碼屬性」`TOKEN`（`token_()` 讀取，至少 16 字元）；更換 TOKEN 只需改屬性，毋須重新部署
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
| + | 手機手勢：任何位置向右拉開側欄、向左收起；側欄跟隨手指，放手時快速撥動（>0.5px/ms）按方向，否則拉出超過 40% 即打開；垂直捲動、輸入框、日期滾輪、趨勢圖上不觸發；遮罩透明度跟隨 | ✅ |
| + | 摺疊動畫（固定項目及每週明細）：展開 300ms 減速曲線＋內容淡入滑入、收起 240ms 加速曲線＋內容淡出，箭嘴同一節奏；時間按距離 200–450ms；固定項目的間距放在 `details.fold` 容器（標題列無外邊距），避免動畫加 overflow:hidden 時外邊距不再重疊而跳動 28px；展開時先固定高度再以 scrollHeight 量度一次（點擊延遲由約 50ms 降至約 12ms）；收起時箭嘴先轉回（`.closing`）；動畫中途可反轉；系統「減少動態效果」時不播放 | ✅ |
| + | 置頂列下捲超過 60px 縮細為 `.compact`（高度 60→44px）：標題文字轉為頁面圖示（`PAGE_ICONS`），同步及選單按鈕縮小；捲回 10px 內還原 | ✅ |
| + | 標題列置頂（sticky）；Monthly Analysis 手機版圓餅圖不再超出寬度 | ✅ |
| + | 金額輸入即時加千位分隔號（`fmtAmountInput`，解析用 `num()` 去逗號） | ✅ |
| + | 常用備註快選：每個 section+項目顯示最常用 3 個備註（localStorage `remarkLog`，從已載入月份及新增紀錄累積，上限 1500 筆） | ✅ |
| + | 樂觀寫入：按「儲存」即寫入本機佇列並更新畫面（<0.1 秒），背景同步至 GAS；失敗保留佇列，於 online／回到前台／每 30 秒重試；未同步紀錄可直接刪除 | ✅ |
| + | 選擇類別後，鍵盤彈出時自動向下捲，令「儲存支出」按鈕位於鍵盤上方（`visualViewport` resize + `keepSaveVisible()`；頁面太短時臨時加底部空白）；儲存後收起鍵盤並平滑捲回頂部；「已儲存」提示顯示項目＋金額（外幣附 ≈HK$，非今天附日期），顯示 3.2 秒；提示旁「復原」按鈕（↶ 圖示＋倒數圈，aria-label「復原」）：新紀錄於 `hold` 暫緩同步約 3.5 秒，復原即從佇列移除並把內容填回表格 | ✅ |
| + | 標題列右上角「同步」按鈕：送出本機佇列 → 清快取 → 重新讀取 Sheet；同步中圖示旋轉 | ✅ |
| + | 同步健康狀態（設定頁）：待同步筆數、最後成功同步（localStorage `syncHealth`）、最近錯誤、伺服器版本（`API_VERSION`，前後端須一致）、最後備份時間 | ✅ |
| + | 每週備份 `weeklyBackup()`：每週日 03:00 把所有工作表複製成新試算表至 Drive「記帳簿備份」，保留 8 份；只含資料不含程式及 TOKEN | ✅ |
| + | 支出明細按週分組（`weekGroups`）：每週由星期日開始，跨月的週只計本月日子；標題格式「15 - 21/ 11」（/ 後有空格），右側圓形摺疊按鈕 `FOLD_BTN`（展開旋轉 180°，固定項目同款）＋筆數＋合計＋比例條（只計日常／其他／旅遊，不計固定）；看本月時「本週」預設展開，其餘（及舊月份）收起；手動展開狀態於本次使用期間保留（`S.wkOpen`）；週內按日分隔（「11月17日（週二）」＋當日合計），每筆仍有「修改」 | ✅ |
| + | 支出概覽分開可控消費與固定支出：頂部「本月合計」小字＋「可控消費（日常＋旅遊＋其他）／固定支出」雙總額；類別條只列可控類別；月底預測只計可控消費（旅遊實數＋日常其他日均外推），有可控預算時與它比較，否則與總預算比較（加回固定支出）；頂部依次顯示「可控預算」及「總預算」進度條（`budLine(used, b, name)`）；預算條標示為「總預算」；支出明細分頁「可控消費（預設）／固定支出／全部」（localStorage `expTab`）：固定支出分頁列出本月實際入帳紀錄及合計，全部分頁每週註明「其中固定」；固定項目摺疊區改名「固定項目設定」 | ✅ |
| + | 支出明細大額高亮（每週明細內，固定支出不參與）：單筆 ≥HK$200（`HL_BIG`）左側橙色色條＋金額橙色（`--st-warn`）；HK$100–199（`HL_MID`）金額淡橙（`--hl-mid`）；`recRow(r, withDel, noDate, hl)` | ✅ |
| + | 支出概覽的固定項目可摺疊（`details.fold`，預設收起，狀態記於 localStorage `fxFold`；標題顯示每月合計及啟用項目數） | ✅ |
| + | 修改單筆紀錄（Expense 明細「修改」→ `#recOverlay`：日期／類別／項目／幣種／金額／匯率／備註，刪除亦移入此處）；固定項目產生的紀錄鎖定類別及幣種；未同步紀錄直接改本機佇列 | ✅ |
| + | 固定項目週期：每月／每年（`Fixed.Cycle` = M／Y；年繳於起始月份的同月 1 號入帳）；Expense 固定合計以年繳 ÷12 攤分 | ✅ |
| + | 自訂快選項目：設定頁編輯（emoji、名稱、次序、新增／刪除、還原預設），存於 Sheet `Items`，本機快取 `itemsCfg`；未自訂的類別用 `DEFAULT_SECTIONS` | ✅ |
| + | 看門狗 `watchdog()`（每小時）：固定支出未入帳自動補跑、備份逾 8 日、連續 3 日未記帳（21:00 檢查）、通知轉發器 3 日無回報（第 5 期）；經 CallMeBot Signal 通知，同類每日一則，失敗入 `NOTIFY_QUEUE` 補發；每月固定入帳發摘要 | ✅ |
| + | 每月預算（設定頁；Sheet `Settings` 鍵 `budget.var`（可控消費＝日常＋旅遊＋其他，設定頁置頂）／`budget.total`（含固定）／`budget.<類別>`，本機快取 `settingsCfg`）：Expense 頁進度條（✓／⚠️ ≥80%／⛔ ≥100%）；看門狗 09:00–22:00 達 80%／100% 經 Signal 提醒，每（類別, 月, 門檻）一次（`BUDGET_SENT`） | ✅ |
| + | 月底預測（Expense 頁本月，第 3 日起）：固定＋旅遊按實數，日常＋其他按日均外推至整月；與總預算比較 | ✅ |
| + | 趨勢（Analysis 頁底）：近 6／12 個月按類別堆疊柱狀圖（由下而上 固定／日常／其他／旅遊），虛線為已完結月份平均，本月半透明，點柱跳到該月，附數據表；統計加「對比去年同月」；`summary` 一次取 24 個月，快取於 `S.summary`，寫入後失效 | ✅ |
| + | 搜尋頁（sidebar 🔍）：備註／項目／類別關鍵字，近 3／12 個月／全部；顯示筆數、合計、平均每次、最近一次，按月分組，可直接修改；包括未同步紀錄 | ✅ |
| + | 圖表色盤：dataviz 參考色盤（已驗證色盲及對比），`PAL_L`／`PAL_D`；類別色固定跟隨類別（`secColor`），不跟排名 | ✅ |
| + | 通知自動記帳（第 5 期）：Tasker 轉發銀行短訊（見 `TASKER.md`）→ `action=inbox`；`PARSERS` 支援中銀信用卡、中銀戶口自動轉賬、花旗、安信、中國移動繳費；外幣以 open.er-api.com 換算（`fxRate_`，快取 6 小時）；`Merchants` 規則 auto／ask／ignore，商戶名互相包含（≥6 字元）即配對（應付不同卡截短）；支付平台（`GENERIC`：Alipay／WeChat Pay／PayMe 等）必須逐筆確認、不建規則；項目 `@meal` 按交易時間判斷早（05–11）／午（11–16）／晚（17–23）餐，其餘零食；同 HKD 金額 15 分鐘內不同短訊標示可能重複且不自動入帳；Signal：✅ 已入帳／🔔 待確認；前端「📥 待確認」頁（badge＋新增支出頁頂 banner）及商戶規則管理 | ✅ |
| + | 旅程（第 4 期）：Sheet `Trips`（Name／Start／End／Currency／Note），`Records.Trip` 欄；新增支出選「旅遊」時顯示旅程選單，預設為日期所在旅程或 60 日內出發的旅程（出發前買機票），並切換至旅程預設幣種；短訊自動入帳的旅遊支出按日期自動標記（`tripFor_`）；旅程頁顯示合計、筆數、每日平均、外幣原額及按項目分佈；改名同步更新紀錄；修改紀錄可補選旅程 | ✅ |
| + | 主畫面長按捷徑（manifest `shortcuts`）：記早餐／午餐／晚餐（`?s=日常&i=…`，直接聚焦金額）、待確認（`?p=inbox`）；圖示 `sc-*.png`；`sw.js` VERSION 升至 v2 | ✅ |
| + | PWA：`manifest.json` + `sw.js`（index.html 網絡優先、其他靜態檔快取優先、Google Fonts SWR；GAS／匯率 API 不快取）；圖示 `icon.svg`／`icon-192/512.png`／`icon-maskable-512.png`／`apple-touch-icon.png` | ✅ |

## 體驗版（demo.html）
- 供分享給他人一次性體驗的單一 HTML：`python3 tools/build_demo.py` 由 index.html 產生 `demo.html`，**修改 index.html 後須重新執行並一併 commit**
- `tools/demo-mock.js`：頁內模擬伺服器（攔截 fetch，實作所有 GET／POST action）＋虛構示範數據（近 6 個月紀錄、5 個固定項目、東京旅程、2 筆待確認）；匯率用固定值
- 以記憶體取代 localStorage／sessionStorage：不會讀寫正式版的設定、TOKEN 或佇列（即使在同一網域開啟），重新整理即重設
- 移除 PWA（manifest、圖示、Service Worker），隱藏 Details、連結表單、首次設定步驟及同步狀態；頁頂顯示體驗版說明

## Google Sheet 結構
- `Records`: ID | Date | Section | Item | Amount | Remark | CreatedAt | FixedID | Currency | FxRate | OrigAmount | Trip
  - Amount 一律為 HKD（分析用）；外幣支出：OrigAmount 為原幣金額，FxRate 為「1 外幣 = ? HKD」；舊表由 `ensureRecHead_()` 自動補欄位標題
- `Fixed`: ID | Item | Amount | Remark | StartYm（純文字 yyyy-MM） | Active | UpdatedAt | History | Cycle（M／Y，舊表由 `ensureFixHead_()` 補標題）
- `Items`: Section | Item | Emoji | Order（自訂快選項目）
- `Settings`: Key | Value（例如 `budget.total`、`budget.日常`）
- `Inbox`: ID（`ib_`+短訊 MD5，防重送）| ReceivedAt | Source | Raw | Merchant | Currency | OrigAmount | Amount | TxDate | Status（pending／auto／confirmed／dismissed／ignored／skip）| RecordID | Suggest(JSON)
- `Trips`: Name | Start | End（純文字 yyyy-MM-dd）| Currency | Note
- `Merchants`: Merchant（大寫 key）| Section | Item（可為 `@meal`）| Remark | Mode（auto／ask／ignore）| Count | UpdatedAt
- 指令碼屬性：`TOKEN`（必須）、`SIGNAL_UUID`／`SIGNAL_APIKEY`（可選）；系統自動寫入 `BUDGET_SENT`、`LAST_BACKUP`、`LAST_MONTHLY`、`LAST_WATCHDOG`、`WD_SENT`、`NOTIFY_QUEUE`、`INBOX_LAST`（第 5 期）

## API（Code.gs）
- GET `action=info` → `{sheetUrl, version, lastBackup, serverTime, signal, lastWatchdog, notifyQueue}`
- GET `action=items` → `{items:{section:[[name, emoji], …]}}`
- GET `action=inbox` → 待確認列表；`action=merchants` → 規則；`action=trips` → 旅程及統計
- GET `action=settings` → `{settings}`；`action=summary&from&to` → `{months:{ym:{類別:金額, _n}}}`；`action=search&q&from` → `{rows（最近 300 筆）, count, total}`
- GET `action=list&month=yyyy-MM` → `{rows}`
- GET `action=fixed` → `{rows}`
- POST `add`（固定項目可帶 `cycle`）/ `updateRecord` / `deleteRecord` / `updateFixed`（可帶 `cycle`）/ `toggleFixed` / `saveItems`（`items` 為空即還原預設）/ `saveSettings`（值為空即刪除該鍵）/ `inbox`（Tasker，亦接受 form-urlencoded）/ `confirmInbox`（remember：auto／ask／空）/ `dismissInbox`（remember：ignore）/ `saveRule` / `deleteRule` / `saveTrip`（`oldName` 改名）/ `deleteTrip`（`untag` 一併清除紀錄標記）；`add`／`updateRecord` 可帶 `trip`
- 手動函數：`setup`、`weeklyBackup`、`testSignal`
- 所有請求需 `token`；寫入使用 `LockService`

## 部署步驟
1. 新 Google Sheet → 擴充功能 → Apps Script → 貼上 Code.gs（毋須修改）
2. 專案設定：時區 Asia/Hong_Kong；指令碼屬性新增 `TOKEN`；Sheet「檔案 → 設定」時區亦同
3. 執行 `setup()` 一次（建表 + 每月 1 號 01:00 `monthlyJob` + 每週日 03:00 `weeklyBackup` + 每小時 `watchdog` trigger；需授權 Drive 及外部連線）；可選：指令碼屬性加 `SIGNAL_UUID`／`SIGNAL_APIKEY` 後執行 `testSignal`
4. 部署 → 網頁應用程式（我／所有人）→ 取得 `/exec` URL
5. index.html 推上 GitHub repo → Settings → Pages
6. 網頁「設定」頁貼上 URL + TOKEN
- 注意：修改 Code.gs 後須「管理部署作業 → 編輯 → 新版本」才生效；改了 `API_VERSION` 須同步改 index.html 內的 `API_VERSION`
- TOKEN 外洩：改指令碼屬性 `TOKEN` → 網頁設定頁輸入新 TOKEN（手機轉發器亦要更新），毋須重新部署

## 已知限制
- 修改圖示／manifest 等靜態檔後，須把 `sw.js` 的 `VERSION` 加 1，否則手機會繼續用舊快取（index.html 不受影響）
- 固定項目只從輸入月份的「下個月」起自動新增，補登過往月份不會回補
- GAS 每次讀寫約 1–3 秒延遲

## 改進路線圖（已排定，按期執行）
- ✅ 第 1 期：#1 TOKEN 改存指令碼屬性、#3 每週備份、#5 同步健康狀態
- ✅ 第 2 期：#2 修改單筆紀錄、#8 固定項目「月／年」週期、#7 自訂項目（`Items` 表）＋看門狗
- ✅ 第 3 期：#11 6–12 個月趨勢、#13 跨月搜尋、#14 月底預測、#10 每月預算
- ✅ 第 4 期：#12 旅程標籤、#9 主畫面長按捷徑（manifest shortcuts）
- ✅ 第 5 期（先於第 4 期執行）：通知自動記帳——Android 轉發器（**Tasker** 一次性付費；後備 Automate 免費版。MacroDroid 免費版現需每 2–3 日看廣告才維持巨集運作，不採用）把付款通知原文 POST 至 `action=inbox`；Code.gs 按銀行格式解析；`Merchants` 表記住「通知商戶 → 類別／項目／備註」，項目可設「餐（按時間）」按時段判斷早／午／晚餐；首次出現的商戶列入「待確認」；同金額 15 分鐘內視為可能重複；入帳後經 **CallMeBot Signal API** 通知（用家已在另一專案「St 美股分析」使用，見下）
  - Signal 通知要點（沿用 St 專案經驗）：endpoint `https://signal.callmebot.com/signal/send.php?phone=<UUID>&apikey=<KEY>&text=…`；`phone` 必須是 Bot 回覆網址中 36 字元 UUID；UUID／apikey 存於本專案指令碼屬性 `SIGNAL_UUID`／`SIGNAL_APIKEY`（不入 repo）；`UrlFetchApp` 網址上限 2KB（中文約 200 字／條，入帳通知很短不需分段）；CallMeBot 出錯亦回 HTTP 200，成功須同時符合回覆含 `sent`／`queued`／`Apikey Correct` 且不含 `error`／`invalid`；免費第三方服務，訊息內容經其伺服器
- 未選：#4 信用卡手續費、#6 儲存後日期回到今天、#15 匯出 CSV
