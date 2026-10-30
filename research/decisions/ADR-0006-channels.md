# ADR-0006：其他通道——使用 dsh-im（plan v2 M4）

- 日期：2026-10-30
- 狀態：
  - 已安裝在正式的 web profile（`~/.cache/temir/dsh-home/profiles/web`）。
  - 與個體一起執行已驗證。
  - **未驗證**：真的在 IM 上對話。需要使用者接入機器人（掃碼或憑據），CLAUDE.md 規則 2：端到端驗收一律用真實的 API。
- 觸發：
  - plan v2 M4「Telegram／LINE／Discord 作為插件」；
  - 使用者 2026-10-30：「通道功能可以從 https://github.com/xmanrui/dsh-im 直接複製（但我更建議直接用這個插件就是了）」。

## 決定

1. **使用 dsh-im**，取代我先寫的 Telegram 橋接（`cli/telegram.ts`，已移除，見 git 歷史 d909026）。
   - 來源：`xmanrui/dsh-im@e84df70`（v5.8.0，MIT），唯讀參考在 `references/dsh-plugins/dsh-im`，記在 `references/LOCK.md`。
   - 能力：
     - 13 個渠道：微信、飛書、企微、企微應用、釘釘、QQ、Slack、Telegram、Discord、WhatsApp、iMessage、Matrix，以及 AI Office；
     - 每個機器人有獨立的存取設定；
     - 核准可以在 Web 與 IM 兩端處理；
     - 主動投遞（`botId + targetId`）與會話雙向同步。
   - 我的橋接只有 Telegram，也沒有這些。
2. **安裝**：`dsh plugin --profile web add -w @xmanrui/dsh-im@5.8.0`（npm 發布版）。
   - DSH 把參數轉給 profile 目錄的 pnpm（v12），依賴套件的建置腳本預設不執行。
   - 移除：`dsh plugin --profile web remove @xmanrui/dsh-im`。
   - 只有 Web 與 Desktop 的 profile 載入它，因為它依賴 `typertGateway`。
3. **與個體的接合**：
   - **IM 上的話就是對方的話**：dsh-im 送進 DSH 的訊息是 `source.kind = 'user'`（`harness-session-coordinator.mjs`），個體的回憶、RD、事後比對照常處理，寫進同一份生命日誌。
   - **主動開口**：
     - dsh-im 的會話同步只轉送第一則訊息來源是 `user`、`schedule` 或 `user-question-reply` 的回合（`session-sync-coordinator.mjs`）。由 `temir-thought` 發起的回合不會被同步，我也不冒用 `schedule` 這個來源。
     - 所以 `temir-thought` 加了 `imTargets`：從 dsh-im 設定頁複製的 `botId + targetId`。
     - 主動開口那一回合結束後，以 dsh-im 的同 Host 服務 `ctx.dshIm.send(botId, targetId, text, { format: 'markdown' })` 送出，結果記為 `self/initiative-im`。
   - **面板**：`/temir/` 顯示 dsh-im 是否已載入、接了哪些機器人（`dshIm.listBots()`）。
4. **插件核准的安全**：
   - dsh-im 會把 DSH 的核准請求轉到 IM 聊天。IM 上顯示的是工具名稱、呼叫參數與 reason（`harness-approval.mjs`），而 `plugin_activate` 的參數只有名字，看不到程式碼；群組裡也可能是別人按下核准。
   - 所以有 dsh-im 時，插件不走 DSH 的核准，改由創造者在本機面板 `/temir/plugins` 看過完整程式碼後核准（ADR-0005）。
   - 面板只回應本機、檢查 Host 與 Origin；跨站送出的表單 403。

## 驗證

- 單元測試：
  - 主動開口那一回合的文字收集：只收念頭發起的那一回合，只送一次；
  - 面板的通道狀態；
  - 插件核准的路徑；
  - 面板核准：只核准目前的版本、只核准一次、舊版本不能核准、跨站 Origin 被擋。
- 真實的 `dsh web`：
  - 測試用的 DSH_HOME 與正式的 web profile 都裝了 dsh-im，TEMIR_HOME 用測試生命；
  - 個體與 dsh-im 一起載入，啟動紀錄沒有錯誤；
  - 面板顯示「已載入，還沒有接入機器人」；
  - dsh-im 的投遞 API 對假的 bot 回 `unknown-bot`；
  - 插件頁列出完整程式碼；跨站核准 403；本機核准 303，記下 `via: panel`。
- **待使用者**：在 DSH 的「設定 → IM機器人」接入一個機器人，對它說一句話；要讓主動開口也送到 IM，把 `botId + targetId` 寫進 `temir-thought` 的 `imTargets`。

## 限制

- dsh-im 宣告相容 DSH 0.2.0-rc.2、0.2.1-rc.2；我們用 0.2.2-alpha.2。載入與 HTTP 已驗證，各渠道的收發沒有驗證。
- 主動開口送到 IM，要使用者先在設定中指定目標。dsh-im 不提供 session → 目標的對應（PROACTIVE_DELIVERY.md：「不需要保存 Harness sessionId」）。
