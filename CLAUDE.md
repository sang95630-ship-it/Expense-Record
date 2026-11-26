# 記帳簿 Expense Tracker — 專案交接

## 語言與風格
- 全程使用繁體中文回覆；程式碼註解可用繁中
- 專業、數據導向，優先提供可直接執行的方案
- 每次回覆結尾附 1-2 條針對性問題（風險／盲點／更佳方向）

## 專案目標
個人用（暫時只有自己用）的消費紀錄網頁：
- 手機／電腦輸入支出 → 自動寫入指定 Google Sheet → 長期紀錄及分析消費習慣
- 前端：GitHub Pages（靜態 HTML，無 build step）。**程式碼來源是 `classic.html`（經典版，後備）**；`index.html`（預設的新設計）及 `demo.html` 由它產生：修改 `classic.html` 後執行 `python3 tools/build_next.py && python3 tools/build_demo.py`，三個檔案一併 commit
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
| 6 | 可收合 sidebar：新增支出／支出概覽／Google Sheet（原 Details）／每月分析（+ 旅程、分帳、待確認、搜尋、設定），標籤全中文 | ✅ |
| 7 | Blue gray 主色調（支援系統深色模式） | ✅ |
| 8 | Monthly Analysis：預設及每次進入均顯示本月（可按 ‹ › 切換）；SVG 圓餅圖（按類別／按項目）+ 最大 3 筆支出 + 環比 % + 固定支出佔比 | ✅ |
| + | Expense 頁可「修改／停用／重新啟用」固定項目（因費用常加價）；可選同時更新本月已入帳金額；History 欄記錄加價（例如 `2026-12: 68→78`） | ✅ |
| + | 離線暫存佇列（localStorage `expenseQueue`），恢復網絡自動補送；伺服器以 ID 防重複 | ✅ |
| + | 刪除單筆紀錄 | ✅ |
| + | 離線／樂觀修改及刪除：已同步紀錄的修改／刪除寫入 localStorage `opQueue`（`queueOp`，同一紀錄只留最後操作），即時套用到畫面（`applyOps`，loadMonth 各路徑亦套用），新增佇列清空後由 `flushQ` 送出；伺服器拒絕（如紀錄已刪）即放棄並提示；刪除不再彈確認框，改為即時刪除＋「復原」（刪除操作暫緩約 3.5 秒）；待同步數 `pendingN()` 包括兩個佇列 | ✅ |
| + | 程式內確認框 `ask(msg,{sub,yes,no,danger})`（`#askOverlay`，取代瀏覽器 confirm）：停用固定項目、待確認「以後也略過／只略過這次」、刪除商戶規則、刪除分帳、還原預設項目 | ✅ |
| + | 幣種＋匯率：預設 HKD；常用 JPY／CNY／HKD／USD，其他幣種於下方 optgroup；匯率自動取 open.er-api.com（每日快取 `fxRates`），可手動修改並記住（`fxManual[幣種]={rate,at}`，顯示輸入日期，14 日後自動失效改回參考匯率；舊格式純數字由首次讀取起計）；旅遊記住上次幣種（`lastTravelCur`）；固定項目只限 HKD | ✅ |
| + | 「其他」新增「補充品」🌿 | ✅ |
| + | 項目圖示（方案 2）：40 個 Microsoft Fluent Emoji 3D 插圖（MIT，`emoji/<碼位>.webp` 128px，共約 150KB，授權見 `emoji/LICENSE.md`）；`EMO_LIB`／`emo(e)` 把庫內 emoji 換成圖片（項目格、常用組合、紀錄列表、固定項目、最大支出），不在庫內者以系統 emoji 顯示；新設計項目格為白色圓角卡片（圖示＋名稱，選中加強調色邊框）；設定頁自訂項目按圖示打開「揀選圖示」（40 個圖示庫或輸入任何 emoji），Sheet `Items` 仍只存 emoji 字元；體驗版以 data URI 內嵌（`EMO_DATA`）；`sw.js` v5 預先快取圖示 | ✅ |
| + | 早餐／午餐／晚餐合併為「餐飲」🍽️：Sheet 舊紀錄不改動，讀取時一律視作餐飲（前端 `normItem`／`normRows`、`collapseMeals` 處理舊自訂項目；Code.gs `normItem_` 用於 `recObj_`、搜尋篩選、旅程統計）；短訊 `@meal` 規則改為入「餐飲」；主畫面捷徑合併為「記餐飲」（舊「記早餐」等捷徑仍打開餐飲；`sw.js` v4） | ✅ |
| + | 幣種選單平時只顯示符號（`#curLabel`），透明 select 覆蓋其上，下拉時才顯示「符號＋名稱＋代碼」；外幣時符號以橙色強調（`--warn-bg`／`--warn-ink`）；金額靠右 | ✅ |
| + | 手機手勢：任何位置向右拉開側欄、向左收起；側欄跟隨手指，放手時快速撥動（>0.5px/ms）按方向，否則拉出超過 40% 即打開；垂直捲動、輸入框、日期滾輪、趨勢圖上不觸發；遮罩透明度跟隨 | ✅ |
| + | 摺疊動畫（固定項目、每週明細、旅程卡、短訊原文；`details.anim`）：只動畫螢幕內看得見的高度（長清單在螢幕外的部分即時加減，任何筆數都一樣快）；動畫期間停用捲動錨定（`overflow-anchor:none`）；收起時 `holdPageHeight()` 以 min-height 暫時撐住頁面，畫面內容原位不動，收起完成後以 `settleHold()` 一次定位（以 `pageNat()` 量度實際高度，全程平滑捲到可到達位置後才解除撐住的高度）；切換分頁（左右拉由開始拖動起撐住高度，或按分段按鈕）後 `settleSwap()`：若已捲過分段按鈕則平滑捲到分段按鈕位於置頂列下方，落點不超過新分頁可捲範圍，距離超過 0.6 個畫面時先直接定位再平滑滑入最後 90px，到位後才解除高度（一段單向移動，不會先跳後回）；已捲進分頁深處時，拖動中相鄰一頁的預覽對齊置頂列下方顯示（不會只見空白）；換頁時即時解除；展開 300ms 減速曲線＋內容淡入滑入、收起 260ms 標準曲線＋內容淡出（時間按看得見距離 200–380ms），箭嘴同一節奏；時間按距離 200–450ms；固定項目的間距放在 `details.fold` 容器（標題列無外邊距），避免動畫加 overflow:hidden 時外邊距不再重疊而跳動 28px；展開時先固定高度再以 scrollHeight 量度一次（點擊延遲由約 50ms 降至約 12ms）；收起時箭嘴先轉回（`.closing`）；動畫中途可反轉；系統「減少動態效果」時不播放 | ✅ |
| + | 置頂列下捲超過 60px 縮細為 `.compact`（高度 60→44px）：標題文字轉為頁面圖示（`PAGE_ICONS`），同步及選單按鈕縮小；捲回 10px 內還原 | ✅ |
| + | 標題列置頂（sticky）；Monthly Analysis 手機版圓餅圖不再超出寬度 | ✅ |
| + | 跨日處理（`dayRollover`）：App 留在背景過夜，回到前台或每分鐘檢查，日期未被手動改過即自動改為今天，看本月的概覽／分析亦順延 | ✅ |
| + | 日期顯示全部統一為 DD/MM（`ddmm()`：紀錄列表、儲存提示、旅程、分帳；Signal 通知 `d/M HH:mm`）；年份／月份標籤（如趨勢 `26/1`、週標題「15 - 21/ 11」）維持原樣 | ✅ |
| + | 金額輸入即時加千位分隔號（`fmtAmountInput`，解析用 `num()` 去逗號）；金額過長時自動縮小字體以符合欄寬（`fitAmount()`，canvas 量度，最小 20px，欄高不變；於 `updHkd()` 及視窗大小改變時執行） | ✅ |
| + | 常用備註快選：每個 section+項目顯示最常用 3 個備註（localStorage `remarkLog`，從已載入月份及新增紀錄累積，上限 1500 筆） | ✅ |
| + | 樂觀寫入：按「儲存」即寫入本機佇列並更新畫面（<0.1 秒），背景同步至 GAS；失敗保留佇列，於 online／回到前台／每 30 秒重試；未同步紀錄可直接刪除 | ✅ |
| + | 選擇類別後，鍵盤彈出時自動向下捲，令「確認」（儲存支出）按鈕位於鍵盤上方（`visualViewport` resize + `keepSaveVisible()`；頁面太短時臨時加底部空白）；儲存後收起鍵盤並平滑捲回頂部；「已儲存」提示顯示項目＋金額（外幣附 ≈HK$，非今天附日期），顯示 3.2 秒；提示旁「復原」按鈕（↶ 圖示＋倒數圈，aria-label「復原」）：新紀錄於 `hold` 暫緩同步約 3.5 秒，復原即從佇列移除並把內容填回表格 | ✅ |
| + | 本機資料快取（stale-while-revalidate）：每月紀錄（最多 8 個月）、固定項目、趨勢數據存於 localStorage `dataCache`；打開時即時顯示上次資料，背景更新（每項每次使用一次，`revalidate`），有改動才重畫，期間頂部顯示「更新中…」；寫入後經 `S.cache`（Proxy）刪除／`dropFixed()`／`dropSummary()`／`resetCache()` 同時刪除本機副本，下次直接取最新 | ✅ |
| + | 預先載入：啟動 1.5 秒後載入上兩個月、固定項目及趨勢數據；切換月份時預取相鄰月份 | ✅ |
| + | 伺服器快取（D，API_VERSION 11）：Code.gs `recRows_()` 把 Records 整表讀取結果存於 CacheService（每段 ≤30,000 字元，6 小時），以「世代」`rec_gen` 防讀寫競爭；任何 doPost 寫入、`monthlyJob`、Sheet 手動修改（簡單觸發器 `onEdit`）及前端「同步」（`info&fresh=1`）即失效；日期欄先轉文字避免 UTC 差一日；list／summary／search／trips／export 共用 | ✅ |
| + | 搜尋載入更多（E）：`search` 加 `off`（每次 300 筆）及 `more`；結果底「載入更多（尚有 N 筆）」接續 | ✅ |
| + | 在另一部裝置登入（F）：設定頁「顯示 QR code」（`qrcode.min.js`，qrcode-generator 2.0.4 MIT，按需載入，1 分鐘自動隱藏）／「複製連結」，連結為 `./#setup=<base64url({u,t})>`；打開時以 `ask()` 確認後自動填入並測試，網址列的 # 部分立即移除；體驗版隱藏 | ✅ |
| + | 匯出 CSV（G）：設定頁「本月／今年／近 12 個月／全部」→ GET `action=export&from&to`（按日期排序全部紀錄）→ UTF-8 BOM CSV（日期、類別、項目、金額(HKD)、幣種、原幣金額、匯率、備註、旅程、固定項目、分帳、ID），以 `'` 前綴防公式注入；未同步紀錄不包括 | ✅ |
| + | 效能記錄（設定頁「效能」卡）：每個請求的次數、中位及最慢時間、伺服器處理時間（Code.gs 回傳 `ms`）、快取命中次數；最近 300 筆存於 localStorage `perfLog` | ✅ |
| + | 標題列右上角「同步」按鈕：送出本機佇列 → 清快取 → 重新讀取 Sheet；同步中圖示旋轉 | ✅ |
| + | 同步健康狀態（設定頁）：待同步筆數、最後成功同步（localStorage `syncHealth`）、最近錯誤、伺服器版本（`API_VERSION`，前後端須一致）、最後備份時間 | ✅ |
| + | 每週備份 `weeklyBackup()`：每週日 03:00 把所有工作表複製成新試算表至 Drive「記帳簿備份」，保留 8 份；只含資料不含程式及 TOKEN | ✅ |
| + | 支出明細按週分組（`weekGroups`）：每週由星期日開始，跨月的週只計本月日子；標題格式「15 - 21/ 11」（/ 後有空格），右側圓形摺疊按鈕 `FOLD_BTN`（展開旋轉 180°，固定項目同款）＋筆數＋合計＋比例條（只計日常／其他／旅遊，不計固定）；看本月時「本週」預設展開，其餘（及舊月份）收起；手動展開狀態於本次使用期間保留（`S.wkOpen`）；週內按日分隔（「11月17日（週二）」＋當日合計），每筆仍有「修改」 | ✅ |
| + | 支出概覽分開可控消費與固定支出：頂部「本月合計」小字＋「可控消費（日常＋旅遊＋其他）／固定支出」雙總額（整數、單行）；類別條只列可控類別；月底預測只計可控消費（旅遊實數＋日常其他日均外推），有可控預算時與它比較，否則與總預算比較（加回固定支出）；頂部依次顯示「可控預算」及「總預算」進度條（`budLine(used, b, name)`）；預算條標示為「總預算」；支出明細分頁「可控消費（預設）／固定支出／全部」（localStorage `expTab`）：固定支出分頁列出本月實際入帳紀錄及合計，全部分頁每週註明「其中固定」；固定項目摺疊區改名「固定項目設定」 | ✅ |
| + | 支出明細大額高亮（每週明細內，固定支出不參與）：單筆 ≥HK$200（`HL_BIG`）左側橙色色條＋金額橙色（`--st-warn`）；HK$100–199（`HL_MID`）金額淡橙（`--hl-mid`）；`recRow(r, withDel, noDate, hl)` | ✅ |
| + | 支出概覽的固定項目可摺疊（`details.fold`，預設收起，狀態記於 localStorage `fxFold`；標題顯示每月合計及啟用項目數） | ✅ |
| + | 修改單筆紀錄（Expense 明細「修改」→ `#recOverlay`：日期／類別／項目／幣種／金額／匯率／備註，刪除亦移入此處）；固定項目產生的紀錄鎖定類別及幣種；未同步紀錄直接改本機佇列 | ✅ |
| + | 固定項目週期：每月／每年（`Fixed.Cycle` = M／Y；年繳於起始月份的同月 1 號入帳）；Expense 固定合計以年繳 ÷12 攤分 | ✅ |
| + | 自訂快選項目：設定頁編輯（emoji、名稱、次序、新增／刪除、還原預設），存於 Sheet `Items`，本機快取 `itemsCfg`；未自訂的類別用 `DEFAULT_SECTIONS` | ✅ |
| + | 看門狗 `watchdog()`（每小時）：固定支出未入帳自動補跑、備份逾 8 日、連續 3 日未記帳（21:00 檢查）、通知轉發器 3 日無回報（第 5 期）；經 CallMeBot Signal 通知，同類每日一則，失敗入 `NOTIFY_QUEUE` 補發；每月固定入帳發摘要 | ✅ |
| + | 每月預算設定卡（參考 Copilot 式）：每項預算以大數字（可直接輸入）＋滑桿設定，滑桿上橙色標記為近 3 個已完結月份平均實際消費（`budAvg`，來自 `summary`），「套用平均」一按設為平均值（取整至百）；可控消費及總預算置頂，各類別預算收在「按類別設定預算」 | ✅ |
| + | 外觀：設定頁頂部「改用經典版／新設計」旁的按鈕循環 自動→淺色→深色（`data-theme`，localStorage `uiTheme`，`<head>` 內先套用避免閃爍；`isDark()` 供圖表色盤使用） | ✅ |
| + | 每月預算（設定頁；Sheet `Settings` 鍵 `budget.var`（可控消費＝日常＋旅遊＋其他，設定頁置頂）／`budget.total`（含固定）／`budget.<類別>`，本機快取 `settingsCfg`）：Expense 頁進度條（✓／⚠️ ≥80%／⛔ ≥100%）；看門狗 09:00–22:00 達 80%／100% 經 Signal 提醒，每（類別, 月, 門檻）一次（`BUDGET_SENT`） | ✅ |
| + | 月底預測（Expense 頁本月，第 3 日起）：固定＋旅遊按實數，日常＋其他按日均外推至整月；與總預算比較 | ✅ |
| + | 趨勢（Analysis 頁底）：近 6／12 個月按類別堆疊柱狀圖（由下而上 固定／日常／其他／旅遊），虛線為已完結月份平均，本月半透明，點柱跳到該月，附數據表；統計加「對比去年同月」；`summary` 一次取 24 個月，快取於 `S.summary`，寫入後失效 | ✅ |
| + | 搜尋頁（sidebar 🔍）：篩選標籤——輸入時建議類別／項目／旅程／常用備註／「搜尋『…』」關鍵字，按一下成為標籤（× 移除，空白時 Backspace 刪最後一個）；可疊加：不同種類為「且」、同種類為「或」（`srMatch`）；伺服器 `action=search&f=[{t,v}]`（API_VERSION 10，回傳 `filtered:true`；舊版伺服器以第一條件查詢再本機篩選）；近 3／12 個月／全部；結果：總支出／筆數／平均每次＋最近一次，按日分組（DD/MM（週x）＋當日合計），每筆附類別及項目標籤（按標籤加入條件），按該行可修改；包括未同步紀錄 | ✅ |
| + | 圖表色盤：dataviz 參考色盤（已驗證色盲及對比），`PAL_L`／`PAL_D`；類別色固定跟隨類別（`secColor`），不跟排名 | ✅ |
| + | 通知自動記帳（第 5 期）：Tasker 轉發銀行短訊（見 `TASKER.md`）→ `action=inbox`；`PARSERS` 支援中銀信用卡、中銀戶口自動轉賬、花旗、安信、中國移動繳費；外幣以 open.er-api.com 換算（`fxRate_`，快取 6 小時）；`Merchants` 規則 auto／ask／ignore，商戶名互相包含（≥6 字元）即配對（應付不同卡截短）；支付平台（`GENERIC`：Alipay／WeChat Pay／PayMe 等）必須逐筆確認、不建規則；舊規則項目 `@meal` 現一律入「餐飲」；同 HKD 金額 15 分鐘內不同短訊標示可能重複且不自動入帳；Signal：✅ 已入帳／🔔 待確認；前端「📥 待確認」頁（側欄 badge＋置頂列同步按鈕左邊小鈴鐺＋紅色數字 `#ibBell`，按下到待確認頁；取代原新增支出頁頂橫額）及商戶規則管理 | ✅ |
| + | 旅程（第 4 期）：Sheet `Trips`（Name／Start／End／Currency／Note），`Records.Trip` 欄；新增支出選「旅遊」時顯示旅程選單，預設為日期所在旅程或 60 日內出發的旅程（出發前買機票），並切換至旅程預設幣種；短訊自動入帳的旅遊支出按日期自動標記（`tripFor_`）；旅程頁每個旅程為可摺疊卡（標題列：名稱、日期、合計；展開：筆數、每日平均、外幣原額、AA 資訊、按項目分佈、修改；預設展開進行中及最近一個，本次使用期間記住 `S.tripOpen`）；改名同步更新紀錄；修改紀錄可補選旅程 | ✅ |
| + | 分帳（第 6a 期，側欄 🧾）：活動＋參加者（「我」固定）＋一筆或多筆支出，每筆選付款人及分攤方式（平均〔可剔除部分人〕／按份數／指定金額）；以最小貨幣單位整數計算（`spUnit`，JPY／KRW 無小數），餘數按小數部分大者分配，各人差額加總必為 0；建議轉帳為**最少次數**（`spMinTx`：子集 DP 求最多「加總為 0」的分組，轉帳數＝有差額人數−組數，組內貪婪；超過 16 人改用貪婪），每筆可標記已收／已付（`data.done` 以 `from\|to\|amt` 為 key，金額改變即重置）；「確認」設 `settledAt`（狀態 未確認→待清數，開始計催收），複製圖示按鈕（`spCopy`，不儲存）複製 WhatsApp 文字（`spText`：英文精簡，日期 DD/MM，「我」寫作 Me，含合計、各筆支出〔多於一筆時〕、各人應付〔相同時只寫 Each pays〕及轉帳）；「我」的份額按每筆支出寫入 Records（ID `<splitId>_<expId>`，`SplitID` 欄，備註「AA：活動·內容」），待收／待付不計入支出；修改分帳紀錄會轉到分帳頁；常用參加者（localStorage `splitPeople`）；本機 `splitsCfg`＋`splitsPending` 樂觀寫入，30 秒／回前台重試；看門狗確認後 3 日仍有**涉及「我」**的轉帳未清經 Signal 提醒一次（`SPLIT_SENT`） | ✅ |
| + | 分帳計算工具模式：參加者可移除「我」（由現有紀錄／通知轉來的除外），即只計算朋友之間的最少轉帳，不寫入記帳簿、不計入待收、不觸發催收；快選第一位為「我」以便加回 | ✅ |
| + | 分帳第 6b 期：新增支出頁按鈕列「取消｜AA｜確認」（取消＝一鍵清空：項目、金額、備註，類別回日常、日期回今天、幣種回 HKD，提示附「復原」；確認＝儲存支出）（帶入日期／類別／項目／幣種／金額／備註，儲存後清空表格）；「待確認」通知「AA 分帳」（`data.src.inbox`，伺服器把通知標記 `split`）；修改紀錄「轉為分帳」（`data.src.rec`，伺服器刪除原全額紀錄，未同步的從佇列移除），全部經 `spFrom()`；支出概覽頂部「🧾 AA 待收」（`spOutstanding()`，點擊到分帳頁）；旅程頁顯示分帳份額已計入及代墊待收（`spTripInfo`）；常用參加者於設定頁編輯（Settings `split.people`，程式碼內預設為空（`SPLIT_PEOPLE_DEF = []`，名字不入 repo）；體驗版換成虛構名字），其後附上 `splitPeople` 常用名字 | ✅ |
| + | 左右拉切換（`makePager()` 通用輪播）：項目格切換類別（`pickSection`）、支出明細切換「可控消費／固定支出／全部」（`#expPane`，`S.expPane(tab)` 產生各分頁內容）、每月分析切換「按類別／按項目」（`#anPane`，`S.anPane(mode)` 產生圓餅圖＋圖例）；開始橫向拖動時把相鄰一頁的預覽（`.pager-ghost`）放在左右兩側一起跟隨手指（`.grid-clip` 裁切）；兩端橡皮筋阻力；拉過 20% 或撥動 >0.35px/ms 即切換，回撥取消；拖動時高度按比例在兩頁之間過渡，放手後一段連續動畫（150–360ms）滑到位（高度同步），按分段按鈕切換亦以 `animHeight()` 平滑過渡高度，完成後才換成真正內容（無閃動），否則回彈；分段控制滑塊於完成後才移動；先判斷方向（水平需 >1.2×垂直），垂直時交回頁面捲動；側欄手勢在這兩處只接受由左邊緣 24px（`EDGE`）內開始的拉動；Android 觸感回饋 | ✅ |
| + | 常用組合（方案 A，兩個版本共用）：新增支出頁頂部「常用」橫向列，按過往紀錄找出最常用「類別＋項目＋備註」（`comboList`：每筆 1 分，±2 小時時段 ×2，30 日內 ×1.5，最少 2 次，最多 5 個；來源為 `dataCache` 月份＋佇列，不計固定及分帳），一按即預選並聚焦金額（金額留空） | ✅ |
| + | 主畫面長按捷徑（manifest `shortcuts`）：記餐飲（`?s=日常&i=餐飲`，直接聚焦金額）、待確認（`?p=inbox`）；圖示 `sc-*.png`；`sw.js` VERSION 升至 v2 | ✅ |
| + | 主畫面圖示（方案 5 Liquid Glass：藍紫→藍綠漸變＋霧面玻璃＋白色 $）：`icon.svg`、`icon-192/512.png`（圓角透明）、`icon-maskable-512.png`／`apple-touch-icon.png`（滿版）；manifest 加 `id`；`sw.js` v7。設定頁「主畫面 App」卡：顯示是否以 App 方式開啟、Chrome `beforeinstallprompt` 時提供「安裝 App」按鈕；長按捷徑只在 Chrome「安裝應用程式」（WebAPK）後出現，iPhone 不支援 | ✅ |
| + | PWA：`manifest.json` + `sw.js`（index.html 網絡優先、其他靜態檔快取優先、Google Fonts SWR；GAS／匯率 API 不快取）；圖示 `icon.svg`／`icon-192/512.png`／`icon-maskable-512.png`／`apple-touch-icon.png` | ✅ |

## 介面版本（新設計為預設）
- `index.html`＝新設計（預設，PWA 主畫面及捷徑打開此頁）；`classic.html`＝經典版（後備，亦是程式碼來源）；`next.html` 只會轉址到 `./`（保留舊書籤）
- 兩版設定頁頂部互相連結：新設計「↩︎ 改用經典版」、經典版「✨ 改用新設計（預設）」；資料、TOKEN、佇列共用
- `sw.js` VERSION v3（SHELL 加入 classic.html）
- 第二版（參考 iOS 26 Liquid Glass）：控制層玻璃材質（半透明＋模糊＋飽和＋邊緣高光）、懸浮膠囊分頁列（透鏡以彈簧滑動，下捲縮細）、同心圓角（卡片 22px／欄位 14px／按鈕膠囊）、頁頂環境光、類別分段控制滑塊、表單頁懸浮彈出、彈簧曲線（CSS `linear()`，阻尼彈簧取樣）、頁面淡入上移、按壓縮放、Android 觸感回饋；強調色 6 選 1（設定頁，localStorage `uiTint`）；系統「減少動態效果」時停用動畫
- 參考 Apple Human Interface Guidelines：系統字體、iOS 大標題模式（`#largeTitle` 屬內容層隨頁捲走並縮小淡出，與同步按鈕同一行（上移至置頂列內，不再另佔一行），越過門檻（>28px 收起、<16px 展開，設回差）切換 `.collapsed`，大標題淡出、置頂列居中小標題及玻璃背景以固定時間淡入，不受捲動速度影響）、分組列表、iOS 分段控制、圓角圖示格、膠囊提示、表單頁拉柄；手機以底部分頁列（記帳／概覽／分析／分帳／更多）導覽，「更多」打開側欄；電腦為淺色側欄
- `python3 tools/build_next.py` 由 classic.html 產生 `index.html`：只覆蓋 CSS、加入分頁列及大標題，功能、資料、localStorage 完全共用

## 體驗版（demo.html）
- 供分享給他人一次性體驗的單一 HTML：`python3 tools/build_demo.py` 由 index.html（新設計）產生 `demo.html`；經典版體驗檔可用 `python3 tools/build_demo.py classic.html classic-demo.html`（未納入 repo）
- `tools/demo-mock.js`：頁內模擬伺服器（攔截 fetch，實作所有 GET／POST action）＋虛構示範數據（近 6 個月紀錄、5 個固定項目、東京旅程、2 筆待確認）；匯率用固定值
- 以記憶體取代 localStorage／sessionStorage：不會讀寫正式版的設定、TOKEN 或佇列（即使在同一網域開啟），重新整理即重設
- 移除 PWA（manifest、圖示、Service Worker），隱藏 Details、連結表單、首次設定步驟及同步狀態；頁頂顯示體驗版說明

## Google Sheet 結構
- `Records`: ID | Date | Section | Item | Amount | Remark | CreatedAt | FixedID | Currency | FxRate | OrigAmount | Trip | SplitID
  - Amount 一律為 HKD（分析用）；外幣支出：OrigAmount 為原幣金額，FxRate 為「1 外幣 = ? HKD」；舊表由 `ensureRecHead_()` 自動補欄位標題
- `Fixed`: ID | Item | Amount | Remark | StartYm（純文字 yyyy-MM） | Active | UpdatedAt | History | Cycle（M／Y，舊表由 `ensureFixHead_()` 補標題）
- `Items`: Section | Item | Emoji | Order（自訂快選項目）
- `Settings`: Key | Value（例如 `budget.total`、`budget.日常`、`split.people`）
- `Inbox`: ID（`ib_`+短訊 MD5，防重送）| ReceivedAt | Source | Raw | Merchant | Currency | OrigAmount | Amount | TxDate | Status（pending／auto／confirmed／dismissed／ignored／skip／split）| RecordID | Suggest(JSON)
- `Trips`: Name | Start | End（純文字 yyyy-MM-dd）| Currency | Note
- `Splits`（第 6 期）: ID | Name | Date（純文字）| Currency | FxRate | Trip | Status（open／settled／done）| Data（JSON：people、expenses、done、transfers、unit）| UpdatedAt | SettledAt
- `Merchants`: Merchant（大寫 key）| Section | Item（可為 `@meal`）| Remark | Mode（auto／ask／ignore）| Count | UpdatedAt
- 指令碼屬性：`TOKEN`（必須）、`SIGNAL_UUID`／`SIGNAL_APIKEY`（可選）；系統自動寫入 `BUDGET_SENT`、`LAST_BACKUP`、`LAST_MONTHLY`、`LAST_WATCHDOG`、`WD_SENT`、`NOTIFY_QUEUE`、`INBOX_LAST`（第 5 期）、`SPLIT_SENT`（第 6 期）

## API（Code.gs）
- GET `action=info` → `{sheetUrl, version, lastBackup, serverTime, signal, lastWatchdog, notifyQueue}`
- GET `action=items` → `{items:{section:[[name, emoji], …]}}`
- GET `action=inbox` → 待確認列表；`action=merchants` → 規則；`action=trips` → 旅程及統計
- GET `action=settings` → `{settings}`；`action=summary&from&to` → `{months:{ym:{類別:金額, _n}}}`；`action=search&q&from[&f]` → `{rows（最近 300 筆）, count, total[, filtered]}`（`f`＝JSON 篩選標籤，API_VERSION 10）
- GET `action=export&from&to` → `{rows}`（全部欄位，API_VERSION 11）；`action=info&fresh=1` 清除伺服器快取
- GET `action=list&month=yyyy-MM` → `{rows}`（含 `splitId`）；`action=splits` → `{rows}`
- GET `action=fixed` → `{rows}`
- POST `add`（固定項目可帶 `cycle`）/ `updateRecord` / `deleteRecord` / `updateFixed`（可帶 `cycle`）/ `toggleFixed` / `saveItems`（`items` 為空即還原預設）/ `saveSettings`（值為空即刪除該鍵）/ `inbox`（Tasker，亦接受 form-urlencoded）/ `confirmInbox`（remember：auto／ask／空）/ `dismissInbox`（remember：ignore）/ `saveRule` / `deleteRule` / `saveTrip`（`oldName` 改名）/ `deleteTrip`（`untag` 一併清除紀錄標記） / `saveSplit`（`split`＋`records`＝我的份額，以 SplitID 同步 Records）/ `deleteSplit`（連同紀錄）；`add`／`updateRecord` 可帶 `trip`
- 手動函數：`setup`、`weeklyBackup`、`testSignal`
- 所有請求需 `token`；寫入使用 `LockService`；所有回應附 `ms`（伺服器處理毫秒）

## 部署步驟
1. 新 Google Sheet → 擴充功能 → Apps Script → 貼上 Code.gs（毋須修改）
2. 專案設定：時區 Asia/Hong_Kong；指令碼屬性新增 `TOKEN`；Sheet「檔案 → 設定」時區亦同
3. 執行 `setup()` 一次（建表 + 每月 1 號 01:00 `monthlyJob` + 每週日 03:00 `weeklyBackup` + 每小時 `watchdog` trigger；需授權 Drive 及外部連線）；可選：指令碼屬性加 `SIGNAL_UUID`／`SIGNAL_APIKEY` 後執行 `testSignal`
4. 部署 → 網頁應用程式（我／所有人）→ 取得 `/exec` URL
5. index.html／classic.html 等推上 GitHub repo → Settings → Pages
6. 網頁「設定」頁貼上 URL + TOKEN
- 注意：修改 Code.gs 後須「管理部署作業 → 編輯 → 新版本」才生效；改了 `API_VERSION` 須同步改 classic.html 內的 `API_VERSION`（再重新產生 index.html）
- TOKEN 外洩：改指令碼屬性 `TOKEN` → 網頁設定頁輸入新 TOKEN（手機轉發器亦要更新），毋須重新部署

## 已知限制
- 修改圖示／manifest 等靜態檔後，須把 `sw.js` 的 `VERSION` 加 1，否則手機會繼續用舊快取（HTML 頁面網絡優先，不受影響）
- 固定項目只從輸入月份的「下個月」起自動新增，補登過往月份不會回補
- GAS 每次讀寫約 1–3 秒延遲（讀取已由本機快取遮蓋：第二次起打開約 20ms 顯示）

## ⏰ 待解決（記得提醒用家）
- **AlipayHK／WeChat Pay 商戶及餘額付款**（2026-11-26 記錄）：銀行短訊只見「ALIPAY／WECHAT PAY」，看不到真正商戶，必須逐筆確認；用錢包餘額付款更完全沒有短訊而漏記。方案：Tasker 讀取兩個 App 的付款通知（AlipayHK；微信「微信支付」服務號）→ `action=inbox`（註明來源 App）→ Code.gs 新增兩款解析規則抽商戶／金額 → 套用商戶規則；與銀行短訊同金額 10 分鐘內配對合併防重複。**待用家提供兩款 App 的通知樣本**（通知欄截圖或 Tasker `%evtprm2`／`%evtprm3`）才可開始
- 每次與用家對話開始時，如此項仍未解決，簡短提醒一次

## 改進路線圖（已排定，按期執行）
- ✅ 第 1 期：#1 TOKEN 改存指令碼屬性、#3 每週備份、#5 同步健康狀態
- ✅ 第 2 期：#2 修改單筆紀錄、#8 固定項目「月／年」週期、#7 自訂項目（`Items` 表）＋看門狗
- ✅ 第 3 期：#11 6–12 個月趨勢、#13 跨月搜尋、#14 月底預測、#10 每月預算
- ✅ 第 4 期：#12 旅程標籤、#9 主畫面長按捷徑（manifest shortcuts）
- ✅ 第 5 期（先於第 4 期執行）：通知自動記帳——Android 轉發器（**Tasker** 一次性付費；後備 Automate 免費版。MacroDroid 免費版現需每 2–3 日看廣告才維持巨集運作，不採用）把付款通知原文 POST 至 `action=inbox`；Code.gs 按銀行格式解析；`Merchants` 表記住「通知商戶 → 類別／項目／備註」，項目可設「餐（按時間）」按時段判斷早／午／晚餐；首次出現的商戶列入「待確認」；同金額 15 分鐘內視為可能重複；入帳後經 **CallMeBot Signal API** 通知（用家已在另一專案「St 美股分析」使用，見下）
  - Signal 通知要點（沿用 St 專案經驗）：endpoint `https://signal.callmebot.com/signal/send.php?phone=<UUID>&apikey=<KEY>&text=…`；`phone` 必須是 Bot 回覆網址中 36 字元 UUID；UUID／apikey 存於本專案指令碼屬性 `SIGNAL_UUID`／`SIGNAL_APIKEY`（不入 repo）；`UrlFetchApp` 網址上限 2KB（中文約 200 字／條，入帳通知很短不需分段）；CallMeBot 出錯亦回 HTTP 200，成功須同時符合回覆含 `sent`／`queued`／`Apikey Correct` 且不含 `error`／`invalid`；免費第三方服務，訊息內容經其伺服器
- ✅ 第 6a 期：分帳頁（取代獨立的 Split-Tools repo）＋催收提醒
- ✅ 第 6b 期：「待確認」短訊轉為分帳、新增支出頁「AA」按鈕、修改紀錄轉為分帳、支出概覽「AA 待收」、旅程頁 AA 資訊、常用參加者
- ✅ 改善 D–G：伺服器快取、搜尋載入更多、QR code 登入、匯出 CSV
- 未選：#4 信用卡手續費、#6 儲存後日期回到今天
