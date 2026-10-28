# DeepSeek Harness 能力對齊矩陣

依 [`inventory.md`](inventory.md) 的 388 個套件歸納成能力族。狀態只有四種：`未開始`／`進行中`／`已實作`／`已驗證（連結到測試或 log）`。「架構上可以支援」不算任何一種狀態。

| 能力族（DSH 套件群） | 代表套件 | temir 對應 | 里程碑 | 狀態 |
|---|---|---|---|---|
| 插件核心（Cordis：context、service、inject、events、effect、fiber） | `vendor/cordis` | `temir-kernel` | M0 | 未開始 |
| Session 只增事件日誌、投影、持久化 | `core/session`、`session/*`、`storage/*` | `temir-store` | M0 | 未開始 |
| LLM adapter、串流、重試、token 計量 | `llm/llm`、`llm/llm-deepseek`、`llm/llm-retry`、`llm/token-meter` | `temir-llm` | M0 | 未開始 |
| 工具註冊與執行管線、權限、審核 | `core/tools`、`core/tool-executor-native`、`guard/*`、`interaction/*` | `temir-tools` | M0 | 未開始 |
| Agent 迴圈、turn/step、中斷恢復 | `core/agent`、`core/agent-loop`、`core/scope` | `temir-agent` | M0 | 未開始 |
| 系統提示組裝 | `core/system-prompt` | `temir-agent`（處境描述） | M0 | 未開始 |
| 檔案系統、子行程、shell | `fs/*`、`subprocess/*`、`shell/*` | `temir-tools` | M0 | 未開始 |
| CLI 啟動、profile、設定 | `apps/cli`、`boot/*`、`settings/*` | `temir-cli` | M0 | 未開始 |
| Web 伺服器、API gateway、SSE | `web/*`、`api/*` | `temir-server` | M0 | 未開始 |
| Web client（67 個 UI 套件） | `client/*` | `web/` | M0 起分批 | 未開始 |
| Skills（provider、目錄探索、tool-skill） | `skill/*` | `temir-skills` | M3 | 未開始 |
| MCP client 與 resources | `mcp/*` | `temir-skills` | M3 | 未開始 |
| 插件管理與市集 | `boot/plugin-manager`、`boot/plugin-market` | `temir-skills`／`temir-cli` | M3 | 未開始 |
| 子代理（fork／spawn／外部 agent） | `subagent/*` | `temir-agent` | M4 | 未開始 |
| 背景工作、排程、webhook | `jobs/*`、`schedule/*`、`experimental/webhook*` | `temir-agent`／`temir-server` | M4 | 未開始 |
| 上下文壓縮、spill | `compaction/*`、`spill/*`、`context/*` | `temir-agent` | M4 | 未開始 |
| Sandbox、SSH、遠端工作區 | `sandbox/*`、`ssh/*`、`workspace/*` | `temir-tools` | M4 | 未開始 |
| 終端機（PTY）、LSP | `terminal/*`、`lsp/*` | `temir-tools` | M4 | 未開始 |
| 目標、計畫、待辦、工作流 | `goal/*`、`plan/*`、`todo/*`、`workflow/*` | `temir-memory`（個體自己的目標） | M1／M4 | 未開始 |
| 附件、文件、交付物 | `attachment/*`、`document/*`、`deliverables/*` | 待定 | M4 | 未開始 |
| 憑證、身份、遙測、回饋 | `credentials/*`、`identity/*`、`telemetry/*`、`feedback/*` | 待定 | M4 | 未開始 |
| Browser-use、computer-use、語音 | `browser-use/*`、`computer-use/*`、`experimental/*speech*` | 插件 | M4 以後 | 未開始 |
| SDK（TS／Python）、ACP | `sdk/*`、`acp/*` | 待定 | M4 以後 | 未開始 |
| 桌面應用 | `apps/desktop*` | 不在範圍（CLI＋Web） | — | — |
