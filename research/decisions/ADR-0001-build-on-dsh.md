# ADR-0001：以 DeepSeek Harness 為身體，改用 TypeScript

- 日期：2026-10-28
- 狀態：已採用（取代計畫 v1 的「Rust 優先、自行重寫 harness」）
- 決定者：使用者（「不需要rust了, 改用dsh原始語言」）

## 背景

計畫 v1（`plan-v1-2026-10-28.md`）要用 Rust 重寫一個 Cordis 式核心，再逐步補齊 DSH 的能力。研究結果顯示：

- DSH 有 388 個套件、約 61 萬行非測試 TS（`research/dsh/inventory.md`），而且仍在快速發版（0.2.2-alpha.2 於 2026-10-28 發布）。Rust 版的 M0 只涵蓋約 24 個能力族中的 7 個，追的是一個移動中的目標。
- DSH 的設計本來就是「沒有特權核心要改，掛插件即可」（`docs/architecture.md` §Cordis），外部插件可以打包成 bundle，從 npm、git 或本機路徑安裝進 profile（`docs/user/develop/basic/publish.md`、`packages/boot/plugin-manager/README.md`）。
- Cordis 插件可以在執行中載入、卸載，所有註冊都是可逆 effect（`vendor/cordis/src/fiber.ts`）。這讓個體為自己寫插件、技能、harness 元件時不需要重新編譯，有利於 Harness²／RRSI 式的自我改進。

## 決定

1. **不再使用 Rust**。全部以 DSH 的原始語言 TypeScript 實作，執行環境為 DSH 要求的 Node ≥ 24.9。
2. **不 fork DSH 核心**。個體以一組 DSH 插件／bundle 的形式存在，安裝進專屬 profile；DSH 版本鎖定在 `references/LOCK.md` 的 commit 對應的發布版，升級是有紀錄的決定。只有擴充點不足時才考慮最小 patch，並記錄原因。
3. **個體的生命資料獨立於 DSH**。生命日誌與記憶存在本專案自己的資料庫與 schema，不依賴 DSH 的 session 檔案格式（該格式會隨版本遷移，見 `docs/architecture.md` §Session log）。DSH session 事件是輸入來源之一，不是個體的身份所在。
4. **DSH 已有的能力直接使用**：CLI、Web UI、工具管線、技能、MCP、子代理、壓縮、排程、模型設定（DeepSeek adapter；本機 OpenAI 相容端點走 `llm-pi-ai` 的 `openai-completions` 自訂 provider，見 `docs/user/guide/providers.md`）。

## 已知缺口（必須自己補）

- DSH 的 LLM 套件原始碼中沒有任何 logprobs 處理（`grep -ri logprob packages/llm --include=*.ts` 無結果）。JitRL 需要候選編號 token 的 logprobs，需由本專案提供評分用的 LLM 呼叫，並把每次呼叫寫進生命日誌（維持「model-visible means logged」）。
- DSH 以 session 為中心；個體跨 session 的連續存在、閒置時的自主認知需要自己的服務（候選擴充點：`session/event`、`agent/pre-step`、`ctx.systemPrompt`、`ctx.tools`、`ctx.schedule`、`ctx.jobs`、`ctx.goals`）。這些擴充點能否滿足需求，要在原始碼與實際執行中驗證後才算數。

## 影響

- 計畫 v1 中的 `crates/temir-*` 全部取消；研究文件（方法分析、PC 假說、DSH 架構）不受影響。
- Web 介面改為 DSH Web client 加上本專案的 client 插件（內在狀態面板、生命日誌時間軸、記憶瀏覽）。
- 「具備 DSH 全部能力」由 DSH 本身提供；`research/dsh/feature-matrix.md` 改為追蹤「個體是否實際用上、是否需要擴充」。
