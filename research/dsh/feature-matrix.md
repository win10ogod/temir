# DeepSeek Harness 能力對齊矩陣

依 ADR-0001，個體以 DSH 為身體：DSH 的能力**直接由 DSH 提供**，本表追蹤的是「個體是否實際用上、是否已在本機驗證、是否需要擴充」。
狀態：`未驗證`（DSH 有，但本專案還沒在本機跑過）／`已驗證（連結）`／`需擴充`（DSH 沒有、個體需要）／`不在範圍`。

| 能力族（DSH 套件群） | 代表套件 | 個體如何使用 | 狀態 |
|---|---|---|---|
| 插件核心（Cordis） | `vendor/cordis` | 個體的三個插件以 Cordis function plugin 形式載入 | 已驗證（session log 01） |
| Session 只增事件日誌、持久化 | `core/session`、`session/*` | `session/event` 全部複製進個體自己的生命日誌 | 已驗證（session log 01） |
| LLM adapter：DeepSeek、pi-ai 自訂 OpenAI 相容 | `llm/llm-deepseek*`、`llm/llm-pi-ai` | DeepSeek 預設；本機 EVE-27B 走 `dsh/local-model.patch.yml` | 已驗證（session log 01） |
| logprobs | — | JitRL 需要；DSH LLM 層沒有 | 需擴充（M2） |
| 工具管線、權限、審核 | `core/tools`、`guard/*`、`interaction/*` | 個體的 4 個工具註冊在 `ctx.tools` | 已驗證（session log 01） |
| Agent 迴圈、pre-step 攔截 | `core/agent`、`core/agent-loop` | `temir-recall` 用 `agent/pre-step` 注入回憶 | 已驗證（session log 01） |
| 系統提示組裝、runtime context | `core/system-prompt` | 處境描述 section、自我快照 context；取消預設角色 | 已驗證（session log 01） |
| 檔案系統、子行程、shell | `fs/*`、`subprocess/*`、`shell/*` | 讀寫檔多步任務 | 已驗證（session log 01） |
| CLI headless、profile、patch | `apps/cli`、`boot/*` | `scripts/dsh.sh` | 已驗證（session log 01） |
| Web 伺服器與 Web client | `web/*`、`api/*`、`client/*` | 啟動已驗證；Web 對話未驗證 | 未驗證 |
| 跨 session 的連續生命 | — | `temir-life`＋`temir-recall` | 已驗證（session log 01） |
| Skills（provider、目錄探索、tool-skill） | `skill/*` | M3：個體寫自己的 skill | 未驗證 |
| MCP client 與 resources | `mcp/*` | M3：外部工具與資源 | 未驗證 |
| 插件管理與市集 | `boot/plugin-manager`、`boot/plugin-market` | M3：個體安裝或撰寫插件 | 未驗證 |
| 子代理（fork／spawn／外部 agent） | `subagent/*` | M4 | 未驗證 |
| 背景工作、排程、webhook | `jobs/*`、`schedule/*`、`experimental/webhook*` | M4 | 未驗證 |
| 上下文壓縮、spill | `compaction/*`、`spill/*`、`context/*` | M4 | 未驗證 |
| Sandbox、SSH、遠端工作區 | `sandbox/*`、`ssh/*`、`workspace/*` | M4 | 未驗證 |
| 終端機（PTY）、LSP | `terminal/*`、`lsp/*` | M4 | 未驗證 |
| 目標、計畫、待辦、工作流 | `goal/*`、`plan/*`、`todo/*`、`workflow/*` | 個體自己的目標由 `temir-self` 的 goal 工具管理；DSH 的 same-session goal 尚未使用 | 未驗證 |
| 附件、文件、交付物 | `attachment/*`、`document/*`、`deliverables/*` | M4 | 未驗證 |
| 憑證、身份、遙測、回饋 | `credentials/*`、`identity/*`、`telemetry/*`、`feedback/*` | M4 | 未驗證 |
| Browser-use、computer-use、語音 | `browser-use/*`、`computer-use/*`、`experimental/*speech*` | M4 以後 | 未驗證 |
| SDK（TS／Python）、ACP | `sdk/*`、`acp/*` | M4 以後 | 未驗證 |
| 桌面應用 | `apps/desktop*` | 不在範圍（CLI＋Web） | 不在範圍 |
