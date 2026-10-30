# ADR-0005：個體寫給自己的插件（plan v2 M3）

- 日期：2026-10-30
- 狀態：已實作。單元測試；e2e-30（DeepSeek）驗證。
- 觸發：使用者 2026-10-30：「做完整再回報可以嗎？不要給我留一堆沒做好的」。ADR-0003 把「個體寫插件」列為沒有做，理由是需要使用者核准的路徑。

## 背景

- **技能與插件的差別**：技能是說明，主模型讀了照做；插件是程式碼，在主程序中執行，例如新的工具、對事件的反應。Harness² 的元件表中，middleware plugin 是「強制」而不是「指示」行為（`research/methods/harness2.md`）。
- **DSH 已有的能力**：
  - `dsh-cordis-host-runner` 的 `DynamicCordisRunnerService`：`define`／`run`／`stop`。主程序的那一半在 `node:vm` 中執行，ctx 只開放白名單內的動詞。
  - 它的說明明寫：「這不是隔離：主程序的輔助函式仍是逃逸的路」（`sandbox.d.ts`）。
  - 主模型用的 `cordis_define`／`cordis_run` 工具由 Web 用戶端提供。headless 與 SDK 模式沒有這些工具，也沒有這個服務（e2e-30 第一次執行：「這個執行環境沒有 DSH 的插件執行器」）。
  - DSH 的動態插件只屬於一段對話，重啟就消失（`missingPluginMessage`）。

## 決定

1. **生命日誌是唯一的真相來源**：
   - `plugin/proposal`：程式碼、用途、sha256，以及新增、修改或移除；
   - `plugin/approval`：創造者核准了哪個版本；
   - `plugin/run`：在哪段對話啟用、成功與否。
2. **`plugin_write`**：寫下不需要核准，因為還沒有執行。確定性驗證：
   - 名字規則；
   - 長度上限：程式碼 20,000 字、用途 300 字；
   - 最多 10 個插件；
   - 程式碼能不能解析：只編譯、不執行，與 DSH 相同，是 async 函式本體。
3. **`plugin_activate`**：
   - 還沒核准過的版本，`tools/pre-execute` 回傳 `ask`，核准畫面附上用途、雜湊與程式碼，並寫明 DSH 的沙盒不是隔離。
   - 創造者在 DSH 的核准介面決定；沒有核准管道的環境，`ask` 會變成拒絕（`dsh-tools` events.d.ts）。
   - 核准後記下 `plugin/approval`，以 `define`＋`run` 啟用。
   - 修改後的版本要重新核准：核准對應的是那個版本的事件 id 與雜湊。
4. **每段對話的第一步（`agent/pre-step`）**：核准過的版本自動重新啟用。DSH 重啟後也一樣，這讓插件成為個體的一部分，而不只屬於一段對話。
5. **執行器**：
   - Web 模式的設定檔本來就載入 `dsh-cordis-host-runner`，直接使用。
   - 其他模式在第一次需要時，以子插件載入 DSH 自己的 `DynamicCordisRunnerService`：不 fork，也不會在 Web 模式重複載入。
6. **處境描述與自我快照**：說明可以寫插件、每個新版本都要核准，並列出自己的插件與核准狀態。

## 有 IM 通道時（ADR-0006）

- dsh-im 會把 DSH 的核准請求轉到 IM 聊天。IM 上看不到程式碼，群組裡也可能是別人核准。
- 所以有 dsh-im 時，`plugin_activate` 不走 DSH 的核准（`activationRoute`），改為：創造者在本機面板 `/temir/plugins` 看過完整程式碼，按下「核准這個版本」（`approveFromPanel`，記下 `via: panel`），個體再呼叫 `plugin_activate`。
- 面板只回應本機、檢查 Host 與 Origin。
- 沒有面板（不是 dsh web）又接了 dsh-im 時無法核准，照實告訴個體。

## 驗證

- 單元測試（`individual/test/plugin.test.ts`）：
  - 驗證只編譯不執行；
  - 修改後的版本不沿用舊的核准；
  - 移除；
  - 核准畫面的內容。
- e2e-30（DeepSeek；harness 的 `onApproval` 代替創造者，印出核准請求後同意）：
  1. 對方請它為自己寫一個查「今天是今年第幾天」的工具。個體呼叫 `plugin_write`（22 行程式碼）與 `plugin_activate`。
  2. DSH 送出核准請求「temir plugin activation: day-of-year (sha256 057597fd7a1b)」；同意後記下 `plugin/approval`，插件啟用。
  3. 個體用自己寫的 `day_of_year` 工具查到「2026-10-30 303」。
  4. **DSH 重新啟動**後的新對話：插件在第一步自動啟用，個體再次使用它，並說明「這個工具來自我在上一段對話中寫的插件；這次對話它自動啟用」。
  - 第一次執行時沒有執行器，啟用失敗，個體照實回報。這次失敗促成了決定 5。

## 限制

- 安全邊界是創造者的核准，不是沙盒。核准畫面顯示前 80 行與完整程式碼的雜湊。
- 只有主程序的那一半，沒有用戶端 UI 的那一半；用戶端插件需要 Web 用戶端的執行器與它自己的核准流程。
- 插件沒有經過技能的對照閘門：插件改變的是能力（多了工具），是否採用由創造者核准與個體自己決定。
