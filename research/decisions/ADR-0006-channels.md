# ADR-0006：其他通道——Telegram（plan v2 M4）

- 日期：2026-10-30
- 狀態：已實作，單元測試通過。**未驗證**：連上真正的 Telegram 需要使用者的機器人 token（CLAUDE.md 規則 2：端到端驗收一律用真實 API）。
- 觸發：plan v2 M4「Telegram／LINE／Discord 作為插件」；使用者 2026-10-30：「做完整再回報可以嗎？」

## 決定

1. **先做 Telegram**。
   - Bot API 的 `getUpdates` 長輪詢不需要公開網址，在使用者的電腦上就能跑。
   - LINE 的 Messaging API 只有 webhook，需要公開的 HTTPS 網址。
   - Discord 需要 gateway 連線與一個 Discord 應用程式。
   - 兩者都需要使用者先決定、提供帳號，這裡不做。
2. **橋接程式在 DSH 之外**（`cli/telegram.ts`）。
   - 與 `scripts/temir.sh chat` 相同，以 DSH 的 SDK 協定驅動帶著個體插件的 DSH（`cli/harness.ts`），不 fork DSH。
   - 個體在 Telegram 上的對話與在終端機、Web 上的一樣，寫進同一份生命日誌。
3. **每個聊天對應一段 DSH 對話**，存在生命資料目錄的 `telegram-sessions.json`，權限 600。同一個聊天的訊息依序處理。
4. **個體說的每段話都送回那個聊天**，包括它主動開口的回合（ADR-0004）。
5. **隱私與安全**：
   - 只回應白名單 `TELEGRAM_ALLOWED_CHAT_IDS` 內的聊天，不在白名單的只印出 id。生命紀錄是私人的，陌生人不該能問出它記得的事。
   - 工具核准與個體的提問，在聊天中問、等下一則回覆；10 分鐘沒有回覆就拒絕。
   - **插件的啟用一律拒絕**：程式碼要在 Web 介面或終端機看過才核准（ADR-0005）。
   - `TELEGRAM_BOT_TOKEN` 只放在 `~/.config/temir/secrets.env`。
6. 用法：`scripts/temir.sh telegram [--model deepseek]`。

## 驗證

- 單元測試（`individual/test/telegram.test.ts`）：
  - 長訊息切段：每段不超過上限、內容不遺失；
  - 白名單；
  - 核准回覆；
  - 選項編號與自由回答；
  - 聊天與對話的對應在重啟後保留，檔案權限 600。
- 沒有 token 時，程式說明要怎麼建立機器人與放置 token，然後結束。
- **待使用者提供 token 後驗證**：
  1. 在 @BotFather 建立機器人；
  2. 把 `TELEGRAM_BOT_TOKEN=...` 寫進 secrets.env；
  3. 執行 `scripts/temir.sh telegram`，對機器人說一句話，取得印出的聊天 id；
  4. 把 `TELEGRAM_ALLOWED_CHAT_IDS=<id>` 寫進 secrets.env 後重新執行。
