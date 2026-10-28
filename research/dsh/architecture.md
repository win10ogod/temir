# DeepSeek Harness 架構研究

來源：`references/deepseek-harness@f3803c96`。主要讀過的檔案：`README.md`、`docs/architecture.md`、`docs/cordis-primer.md`、`docs/tool-execution-pipeline.md`、`docs/subsystems/skills.md`、`vendor/cordis/src/{context,service,fiber,events,registry}.ts`。
套件全表見 [`inventory.md`](inventory.md)（388 個套件，自動產生）；本專案的對齊狀態見 [`feature-matrix.md`](feature-matrix.md)。

## 1. Everything is a Plugin：Cordis

DSH 底層是 Cordis（`vendor/cordis/src`，約 2,700 行）。五個核心概念（`docs/cordis-primer.md`）：

1. **Plugin**：帶 `inject`（依賴的服務）與 `apply(ctx)` 的函式或 `Service` 子類別。
2. **Context 是服務倉庫**：服務佔用穩定的 `ctx.<key>`（如 `ctx.tools`、`ctx.llm`、`ctx.sessions`），其他 plugin 透過 key 找服務，不 import 具體實作。
3. **以 `inject` 宣告依賴**：所需服務出現前 plugin 停在 PENDING；載入順序由依賴表達，不靠手動排序。
4. **型別化事件**，五種派發模式：`emit`（不等待，依序觀察）、`waterfall`（中介鏈，listener 呼叫 `next()` 往下傳，可短路或改寫結果）、`parallel`（等待，平行）、`serial`（等待，依序，可回傳值）、`bail`（第一個回傳值即停止）。派發模式是事件公開契約的一部分。
5. **註冊是可逆的 effect**：prompt 段落、工具 schema、adapter、listener 都透過 `ctx.effect()`／`ctx.on()` 安裝，plugin 卸載時依註冊的反序釋放。

Fiber 生命週期（`fiber.ts`）：`PENDING → LOADING → ACTIVE`，失敗為 `FAILED`，卸載經 `UNLOADING → DISPOSED`。`Context.isolate(name)` 為子樹建立獨立的服務範圍，`intercept(name, config)` 為子樹注入服務設定。

Profile 與 bundle：執行中的 dsh 是開機時由多層設定組成的 plugin 樹（`web`、`headless`、`sdk`、`acp` 等 profile；`dsh-base` 為共同第一層），使用者可用 patch 替換任一列。

## 2. 核心服務

| 套件 | 擁有 | ctx key |
|---|---|---|
| `core/session` | 只增 `SessionEvent` 日誌與記憶體內 store | `ctx.sessions` |
| `core/system-prompt` | prompt 段落與工具 schema 組裝 | `ctx.systemPrompt` |
| `core/tools` | 有範圍的工具註冊表與受控執行管線 | `ctx.tools` |
| `core/agent` | Agent 介面、即時註冊表、`agent/*` 事件 | `ctx.agents` |
| `core/agent-loop` | 預設的驅動迴圈 | `ctx.agentLoop` |
| `core/scope` | 每個 agent 的範圍化註冊 | （函式庫） |
| `llm/llm` | 訊息與串流詞彙、adapter 接縫 | `ctx.llm` |

## 3. Turn／Step 流程（`docs/architecture.md` §Turn flow）

- **step**＝一次模型請求加上它呼叫的工具；**turn**＝零或多個 step。
- `agent/pre-step`（waterfall）可接受、改寫或拒絕待處理訊息；`agent/request` 準備呼叫；`llm/stream` 串流；`tool/call` → `tools/pre-execute` → `tools/execute` → `tools/post-execute` → `tool/result`。
- `turn/*`、`step/*`、`system/message`、`user/message`、`assistant/message`、`assistant/attempt`、`tool/*` 是**持久的 session 事件**；其他是即時擴充點。

## 4. 「Model-visible means logged」

session 日誌是模型所見上下文的唯一來源：每個模型請求都必須能從日誌重建；新的模型可見輸入必須是 session 事件。fork、resume、逐字稿、遙測、持久化都從日誌推導。

**對個體的意義**：這條原則與「完整保存經歷」相同。個體的事件日誌除了對話，還要包含內部念頭、預測、評價與自我修訂——它們也是「模型可見」的輸入。

## 5. 工具執行管線（`docs/tool-execution-pipeline.md`）

`tool/call` 先記錄 → `tools/pre-execute` waterfall（hooks、權限、sandbox；可 allow／deny／ask）→ 單調 guard（只能拒絕或棄權）→ ask 時走 `ctx.approval` 一次性詢問（不可回答則拒絕）→ `tools/execute` waterfall（timeout、重試、量測）→ 工具本體（檔案寫入另經 `fs/write-intent`）→ `tools/post-execute` waterfall（接受、阻擋、替換、加上下文）→ `tool/result` 記錄。

## 6. Skills（`docs/subsystems/skills.md`）

`ctx.skills` 合併多個 provider；本機 provider 依序掃描：`<project>/.dsh/skills`(100)、`<project>/.agents/skills`(200)、自訂目錄(300)、`<dshHome>/skills`(400)、`<agentsHome>/skills`(500)、bundled(600)。同名依 rank 決定。技能為含 `SKILL.md` 的目錄。

## 7. 「新行為放哪裡」對照（`docs/architecture.md` §Where new behavior goes）

新增模型供應商 → 在 `ctx.llm` 註冊 adapter；新增模型可用能力 → 在 `ctx.tools` 註冊；攔截請求／工具／turn → `agent/*`、`tools/*` 事件；新增持久 session 狀態 → 擴充 `SessionEventMap`；外部 webhook 啟動 session → `ctx.webhookRuntime`；同 session 目標 → `ctx.goals`；背景工作 → `ctx.jobs`。

## 8. 對本專案的結論

- **採用**：Cordis 的五個概念（服務倉庫、依賴注入、五種事件派發模式、可逆 effect、fiber 生命週期）、「model-visible means logged」、工具管線的 waterfall＋guard＋approval 結構、技能目錄格式與多 root 探索。
- **不照搬**：TypeScript 的 Proxy／原型繼承機制、profile/bundle 的 YAML patch 系統、Web client 的 67 個 UI 套件。Rust 版本以 trait 物件與型別擦除實作相同語意。
- **規模的誠實估計**：388 個套件、約 61 萬行非測試 TS。「具備全部能力」需要分批完成，進度以 `feature-matrix.md` 逐項追蹤，不以「架構相似」代替「功能已實作」。
