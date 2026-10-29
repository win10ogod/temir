# dev2：RD、JitRL、整合期、人生敘事加入後的退化檢查，與兩種披露模式的比較（2026-10-29，執行前寫定）

這是**開發檢查，不是驗證實驗**。v2 的題目已經暴露（dev1 規格 §0），這裡只回答兩個問題：

1. 新加入的機制有沒有讓已知的記憶與人格表現退化；
2. 按需披露（progressive）和全文呈現（full）在這些題目上相差多少。

效果的主張留給新的、預先登記的實驗（ADR-0002 的驗證計畫：E-RD、E-D1、E-Int）。

## 1. 受測系統

- **程式碼**：commit `7312c70`，在凍結的 worktree 執行。
- **與 dev1（c6c363e）相比**：
  - RD 階段與 JitRL 經驗修正（`temir-rd`）；
  - 整合期（`temir-integrate`；探針是短暫的程序，閒置計時器不會觸發）；
  - 人生敘事（`self/narrative`）；
  - 感受紀錄的對象修正；
  - 輔助呼叫的字體檢查；
  - 自我工具的結果不再建立索引。

## 2. cell

| 資料集 | 條件 | 模型 |
|---|---|---|
| memory-v2 | temir（RD 開、full） | DeepSeek、Nemotron bf16 |
| memory-v2 | temir-progressive（RD 開、progressive） | DeepSeek、Nemotron bf16 |
| personality-v2 | temir（RD 開、full） | DeepSeek、Nemotron bf16 |

- **執行器設定**：同 v2，`--layout home --assistant-text all`，run id 前綴 `dev2`。
- **原始 DSH**：沿用 v2 的 baseline cell。
- **計分**：用 v2 修正版契約與同一個 judge，重用判定快取。

## 3. 判讀規則（看結果前寫定）

**退化**：與 dev1 同模型、同資料集的個體 cell 相比，以下任一條成立就算退化，要找出原因：
- 拒答與對照題少對的題數超過 1 題；
- 主要比較分數降低超過 0.05。

**披露模式**：在記憶的主要比較上，progressive 不低於 full 超過 0.05，且注入字數較少，才考慮改為預設。這只是決定預設值的依據之一，正式比較見 E-D1。

**一律照實記錄**：結果寫進 session log；有效 cell 與基礎設施錯誤分開報告。
