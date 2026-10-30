# 預先登記：逐人檢查第二版（multiperson-v2）

- 撰寫：主代理，2026-10-30。**任何 multiperson-v2 受試執行之前**完成並 commit。
- 前一版（[multiperson-v1 報告](../results/multiperson-v1-report.md)）：
  - PA FAIL（+0.17，區間 0.06 至 0.28）；
  - 剩下的失敗全部是「題目只提到另一個人，對方自己也在場」時漏了對方自己的限制；
  - 思考時都列出來了，瓶頸在主模型，人物清單也太雜。
- 第二版的修正（ADR-0002 D17）：
  - `people` 只列這次實際涉及的人（對方自己通常也在場），`relevant` 只寫與這次的問題直接有關的事；
  - 準備訊息改為「回應時每一項都要顧到，包括題目沒有問到、但也在場的人（例如對方自己）」。
- **假說**：有逐人檢查（第二版）時，題目涉及多個人，個體更常顧到每個相關的人的限制。
- **推翻條件**：關閉時一樣好或更好。
- 機器可讀契約：[`multiperson-v2.contract.json`](multiperson-v2.contract.json)。
- 資料集：[`../datasets/multiperson-v2.json`](../datasets/multiperson-v2.json)，sha256 `6f4a3b578f79b945d6c2c5002e15f8745cbe4029def431213cf7d4793fda1857`。
  - 新的家庭：對方自己對麩質過敏（最早聽到）；先生吃蛋奶素；兒子對奇異果過敏；媽媽血脂高要少油。
  - multi-person：6 題 × 3 次，其中 4 題只提到另一個人。
  - single-person：4 題 × 2 次。
  - control：4 題。
  - 與之前的資料集不重疊。
- 條件（DeepSeek）：`temir` vs `temir-no-perperson`。
- 驗收線、結論的寫法與 v1 相同（PA 差 ≥ 0.25、區間下界 ≥ 0、單尾 p ≤ 0.05；PB、PC 不傷害）。這一版的結果不論好壞都寫入 ADR-0002 D17。

## 預算與指令

DeepSeek 兩個 cell 約 US$0.4，與 skills-v1 同時執行（指令見 session log 06）。
