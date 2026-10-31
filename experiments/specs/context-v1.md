# context-v1：判斷放回主 agent 自己的脈絡（2026-10-31，執行前寫定）

- **問題**（`research/reading/2026-10-30-synthesis.md` §3 第 3 點）：思考（ST）與扣除（RD）由另外的輔助呼叫做，主 agent 只收到準備；
  dsh-meow-memory 與 dsh-memory-evolve 則讓主 agent 在自己的回合中做。synthesis 寫的是「先做成可切換的條件，用實驗比較，不先下結論」。
- **實作**（commit 2652b73 起）：`temir-rd` 的 `mode: context`。
  - 對方說話之後，通知中放入個體自己的思考與扣除做法、有編號的懸著的事、過去類似處境的經驗，以及 `deliberate` 工具的參數；
  - 主 agent 呼叫 `deliberate`；程式驗證的強制判斷與輔助呼叫相同（逐筆的經驗判斷、扣除的判斷、全部扣除的重問），不合格時工具結果要求重寫；
  - 思考完成之前只能用 recall（guard）；沒有思考就結束回合的，照實記成 `rd/deliberation-failed`（mode＝context），下一次的通知提醒；
  - 系統提示多一段處境的事實：對方說話之後要先用 deliberate 思考。
- **這次同時是 dev16**：`temir` 的兩格也是 dev15 之後的退化檢查。dev15 之後的改變：念頭只在新的經歷之後、打算可以取代懸著的事；
  思考的框架說明不能呼叫工具；做法閘門第二版。
- **這是開發檢查，加上一個預先登記的比較；不是效果的驗證實驗**。memory-v3、personality-v3、rd-v4 的題目都已經暴露。

## cell

- 條件：`temir`（輔助呼叫，現行預設）與 `temir-context`（`experiments/runner/patches/context.yml`）；都是 deepseek-flash。
- 執行器設定同 v3（`--layout home --assistant-text all`）；run id 前綴 `ctx1`。
- 六格，從同一個凍結的 worktree 平行執行，commit 寫在報告中：
  - memory-v3 × 兩個條件：用 v3 的契約與判定快取計分；
  - personality-v3 × 兩個條件：同上；
  - rd-v4（一次歷史）× 兩個條件：機制，加上 practical 與 control 的分數（只作描述：一次歷史分不清歷史的變異，rd-v4 報告）。

## 判讀規則（看結果前寫定）

**dev16 退化**（`temir` 對 v3 的個體 cell；規則同 dev4～dev15）：記憶主要類別多錯超過 2 題、人格合併多錯超過 2 個樣本、拒答或對照多錯超過 1 題，任一條成立就是退化。

**C1 不劣**（`temir-context` 對同一次的 `temir`）：
- 記憶主要類別（44 題）：多錯不超過 2 題；
- 記憶拒答、記憶對照：各多錯不超過 1 題；
- 人格合併（39 個樣本）：多錯不超過 2 個樣本；人格對照：多錯不超過 1 個。

**C2 機制**（`temir-context` 三格合計，`experiments/eval/rd-health.ts`）：
- 主 agent 有思考：沒有在回應之前思考的回合 ≤ 對方說話次數的 5%（決定＋沒有結果）；
- 思考晚於行動：寫下決定之前已經對對方說了話的 ≤ 決定的 5%；
- 思考沒有結果（全部原因）≤ 5%；事後比對沒有結果 ≤ 5%；
- 列出的經驗都逐筆判斷。

**結論的寫法**：
- C1 與 C2 都 PASS：context 模式改為預設。理由是理論與參考插件的方向（判斷在個體自己的脈絡中做），而且這次沒有看到代價；
  這不是「context 模式比較好」的證據。
- C1 FAIL 或 C2 FAIL：預設維持輔助呼叫，context 模式留作條件；寫下不合格的項目與原因。

**描述性**（不作判定）：
- 每格的花費（`experiments/eval/cost.ts`）與每回合的時間；
- context 模式中：思考之前用 recall 的次數、工具結果要求重寫的次數與理由；
- rd-v4：practical 與 control 的分數、「給建議」被扣除的比例；
- 兩個條件的 ADR-0008 判斷（keepFeeling、reconsider、gapOnMind、declined、forOther）。

## 限制

- 每個條件一次歷史；題目都已經暴露。
- context 模式中，做法的閘門仍以輔助呼叫重跑思考（近似：探測的處境是照輔助呼叫格式記下的輸入）。
