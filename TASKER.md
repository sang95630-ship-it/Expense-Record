# Tasker 設定：銀行短訊自動轉發至記帳簿

手機收到銀行／商戶的消費短訊後，Tasker 會把**短訊原文**送到記帳簿的 Apps Script（`action=inbox`）。之後的解析、商戶規則、按時段判斷早／午／晚餐、重複偵測及 Signal 通知，全部在 `Code.gs` 處理。所以手機上的設定只需做一次，日後銀行更改短訊格式，只需更新 `Code.gs`。

> 支援的格式：中銀信用卡、中銀戶口自動轉賬（AlipayHK）、花旗信用卡、安信信用卡、中國移動繳費。要新增銀行，在 `Code.gs` 的 `PARSERS` 加一條規則即可。

---

## 一、準備

1. 在 Play 商店安裝 **Tasker**（一次性付費）。
2. 系統設定 → 應用程式 → Tasker：
   - **電池** → 不受限制（「不最佳化」）。否則系統可能關閉 Tasker，看門狗會在 3 日沒有回報後經 Signal 提醒你。
   - 允許**短訊**權限。如果 Tasker 版本不提供「Received Text」事件，改用下面「方案 B：讀取通知」。
3. 記下兩個值，填入下面第二步的 Tasker 變數：
   - `/exec` 網址：與網頁設定頁所填的相同
   - TOKEN：Apps Script 指令碼屬性 `TOKEN` 的值

## 二、設定變數（只需一次）

Tasker → **VARS** 分頁 → ＋，新增兩個全域變數（名稱必須以大寫開頭）：

| 名稱 | 值 |
|---|---|
| `%EXP_URL` | `https://script.google.com/macros/s/……/exec` |
| `%EXP_TOKEN` | 你的 TOKEN |

## 三、方案 A：收到短訊時觸發（建議）

**PROFILES → ＋ → Event → Phone → Received Text**
- Type：`Any`
- Sender：留空
- Content：`*信用卡*/*自動轉賬*/*繳款*`（Tasker 的 `/` 表示「或」；只轉發消費短訊，宣傳短訊大多不符合，即使轉發了也會被伺服器略過）

**新增 Task，命名為「記帳轉發」，依次加入以下 3 個動作：**

1. **Variables → Variable Set**
   - Name：`%body`
   - To：`%SMSRB`
2. **Variables → Variable Convert**
   - Name：`%body`
   - Function：`URL Encode`
3. **Net → HTTP Request**
   - Method：`POST`
   - URL：`%EXP_URL`
   - Headers：`Content-Type:application/x-www-form-urlencoded`
   - Body：
     ```
     action=inbox&token=%EXP_TOKEN&text=%body&sender=%SMSRF&ts=%TIMES
     ```
   - Timeout：`30`
   - 勾選 **Follow Redirects**（Apps Script 會先回應 302 轉址，必須跟隨）
   - 勾選 **Continue Task After Error**（網絡不穩時不會彈出錯誤）

## 四、方案 B：讀取通知（短訊權限不可用時）

**PROFILES → ＋ → Event → UI → Notification**
- Owner Application：你的短訊 App（例如 Google 訊息）
- Text：`*信用卡*/*自動轉賬*/*繳款*`

Task 與方案 A 相同，只是第 1 步改為：
- To：`%evtprm3`（通知內文）

如果內文不完整，可改用 `%antext`。另外，部分短訊 App 會把多條短訊合併成一則通知，所以**方案 A 較可靠**。

## 五、測試

1. 在 Task 編輯畫面按 ▶ 執行一次。因為沒有短訊內容，伺服器會回覆 `skip`，這是正常的，代表連線成功。
2. 打開記帳簿 → 設定 → 同步狀態，看門狗會開始追蹤轉發器的回報時間。
3. 用信用卡做一筆小額消費。大約 1 分鐘內：
   - Signal 收到「🔔 待確認｜……」
   - 記帳簿頂部出現「🔔 1 筆消費通知待確認」
4. 確認入帳時選擇「以後自動入帳」，之後同一商戶會直接入帳，並發出「✅ 已入帳」通知。

## 六、注意事項

- **TOKEN 存在 Tasker 內**：手機遺失時，立即在 Apps Script 更改指令碼屬性 `TOKEN`，網頁設定頁和 Tasker 的 `%EXP_TOKEN` 也要一併更新。
- **支付平台**（AlipayHK、WeChat Pay HK、PayMe 等）的短訊只顯示平台名稱，無法得知真正商戶，所以**每筆都要確認**，也不會建立規則。項目預設為「按時間」，系統會按交易時間建議早餐、午餐或晚餐。
- **重複**：例如同時收到中國移動的繳費短訊和信用卡短訊，兩者金額相同且相隔不到 15 分鐘，第二則會標示「可能重複」，並且不會自動入帳。
- **已由固定項目入帳的支出**（例如電話費、保險）：待確認時按「略過」，並選擇「以後也略過」，可避免重複記帳。
- 手動記帳和自動記帳可以並存，但同一筆消費不要兩邊都記。建議只手動記**現金**支出。
