# v2 協定修正 1：Nemotron 改用付費端點（固定 bf16 供應商）

- 日期：2026-10-28（UTC 11:3x），在任何 Nemotron 結果計分或檢視之前寫定。
- 決定者：使用者（「用付費端點把 4 個 Nemotron cell 全部重跑」）。
- 適用：`memory-accuracy-v2`、`personality-consistency-v2` 的 Nemotron cell。修正版契約：`memory-accuracy-v2.amend1.contract.json`、`personality-consistency-v2.amend1.contract.json`（version 2.1.0）。原始預先登記（version 2.0.0）不修改。

## 原因

預先登記的 Nemotron cell 使用 OpenRouter 免費端點 `nvidia/nemotron-3.5-super-vl:free`（每日 1000 次請求），依 §8.3 需分兩天執行。第一天的兩個 cell 完成後，使用者決定改用付費端點，在同一天內完成全部 Nemotron cell。這是執行面的理由；修正時沒有計分或檢視任何 Nemotron 的回答內容（只看過回合錯誤數與輔助呼叫失敗數）。

## 修正內容

1. Nemotron 必要 cell 的模型字串改為 `nvidia/nemotron-3.5-super-vl`（付費端點）。契約的其他欄位（類別、題數、驗收線、統計方法、judge）完全不變；`experiments/eval/test/amendment-v2.test.ts` 檢查修正版與原始契約只差在模型字串、version 與 amendment 說明。
2. **固定供應商**：付費端點由多家第三方供應商提供，量化從 fp4 到 bf16 都有，OpenRouter 預設逐請求分流（2026-10-28 查詢 `/api/v1/models/nvidia/nemotron-3.5-super-vl/endpoints`：Darkbloom、Crusoe、Io Net、Together、DeepInfra、CoreWeave、Venice、BaseTen、Nebius）。DSH 的 llm-pi-ai 不開放 OpenRouter 的供應商路由（`catalog.ts` 的 `openRouterRouting: 'withhold'`），因此以 `experiments/runner/openrouter-pin.ts` 在 DSH 與 OpenRouter 之間為每個請求加上 `provider: { order: ["Crusoe", "Nebius"], quantizations: ["bf16"], allow_fallbacks: false, require_parameters: true }`，並記錄每個請求實際的供應商。內容不做任何修改。
3. **請求格式一致**：DSH 端 baseURL 為 `http://127.0.0.1:8787/openrouter.ai/api/v1`，讓 pi-ai 依「baseUrl 含 openrouter.ai」套用與免費路由相同的 OpenRouter 請求格式（`dist/api/openai-completions.js` 的 `isOpenRouter`）。
4. **四個 cell 全部重跑**：比較必須在同一端點上進行，所以第一天以免費端點完成的兩個 cell（記憶 × 個體、人格 × 原始 DSH）移到 `experiments/runs/archived__v2-free__*`，保留不計分；四個 Nemotron 必要 cell 以付費端點重新執行（`--history-model nemotron-bf16`，目錄配置與每輪全部可見文字同 v2）。
5. **花費**：付費端點由使用者的 OpenRouter 額度支付（估計 US$1–2）；免費端點的每日上限與排程（§8.3）不再適用於 Nemotron cell。

## 對結論的影響

模型獨立性的主張改由「DeepSeek＋付費 bf16 Nemotron」承擔。免費端點（NVIDIA 自營，量化未公開）與付費 bf16 端點可能不是同一份部署；報告中以「Nemotron（OpenRouter 付費端點，bf16）」稱呼，不與免費端點的結果混用。
