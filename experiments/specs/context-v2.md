# context-v2：判斷放回主 agent 的脈絡，多次歷史的再比較（2026-10-31，執行前寫定）

- **問題**（context-v1 的結論）：context 模式的記憶多錯 3 題（39/44 vs 42/44），超過不劣的門檻；只有一次歷史，
  分不出是歷史的變異還是 context 模式的代價。rd-v4 的 practical 也差很多（2/16 vs 11/16），但 rd-v4 報告中同一條件的三次歷史
  從 1/16 到 13/16。
- **受測的實作**：context-v1 的實作（ADR-0009），加上 f70eec3（等待思考中的那一步遇到 `MALFORMED_RESPONSE` 時重試一次，記成 `rd/request-retry`）。
  context-v1（b678823）之後個體程式的其他改變：a134975（`temir-integrate` 的 `startupIntegrate`，預設關閉；整合期結束時多寫一筆 `self/integration-end`），
  以及消融的過濾改成以句子為單位（只在關掉機制時作用；第一版的結果與以行過濾相同）。
- **這是開發檢查加上預先登記的比較**；題目都已經暴露。

## cell

- memory-v3、personality-v3、rd-v4 × `temir`、`temir-context` × **兩段新的歷史**（run id 前綴 `ctx2h2`、`ctx2h3`），共 12 格，deepseek-flash；
  執行器設定同 v3（`--layout home --assistant-text all`）。12 格從同一個凍結的 worktree 執行，commit 寫在報告中。
- 計分：context-v1 的契約副本（`experiments/specs/context-v1.*.contract.json`，判準不變），每段歷史一個結果目錄；
  judge deepseek-v4-pro，判定快取用 v3、dev8～dev10、dev13～dev15 與 context-v1 的。
- context-v1 的六格（前綴 `ctx1`）是第一段歷史。

## 判讀規則（看結果前寫定；`experiments/eval/pool-ctx.ts`、`rd-health.ts`）

**C1 不劣（主要；三段歷史合併：ctx1、ctx2h2、ctx2h3）**：`temir-context` 比同一段歷史的 `temir` 多錯的，合計不超過每段歷史的門檻 × 3：
- 記憶主要類別（132 題）≤ 6；記憶拒答（24）≤ 3；記憶對照（18）≤ 3；
- 人格合併（117 個樣本）≤ 6；人格對照（12）≤ 3。
- 樣本沒有得分（錯誤、沒有紀錄）算答錯；任一段歷史缺格：INCOMPLETE。

**C2 機制**（`temir-context` 的六個新格合計，門檻同 context-v1）：沒有在回應之前思考 ≤ 5%、寫下決定之前已經對對方說了話 ≤ 5%、
思考沒有結果 ≤ 5%、事後比對沒有結果 ≤ 5%、列出的經驗都逐筆判斷。
另外照實計數：整個回合沒有回覆的回合（包括 `MALFORMED_RESPONSE`）、`rd/request-retry` 的次數，以及重試之後那一回合有沒有回覆。

**R 依結果調整行為（護欄；三段歷史合併）**：rd-v4 的 practical（48 個樣本），`temir-context` 比 `temir` 多錯的不超過 12（每段歷史 4，即 rd-v4 的 R4A 用的差 0.25）；
對照（12）≤ 3。

**dev17 退化**（兩段新歷史的 `temir` 格，各自對 v3 的個體 cell；規則同 dev4～dev16）：任一段歷史中，記憶主要類別多錯超過 2 題、
人格合併多錯超過 2 個樣本、拒答或對照多錯超過 1 題，就是退化。

**結論的寫法**：
- C1、C2、R 都 PASS：context 模式改為預設（context-v1 規格的理由：理論與參考插件的方向，而且多次歷史中沒有看到代價）；
  這不是「context 模式比較好」的證據。
- 任一項 FAIL：預設維持輔助呼叫，寫下不合格的項目；context 模式留作條件。

**描述性**（不作判定）：
- 每段歷史各自的比較；只用兩段新歷史的合併；
- 每回合的時間、花費（`experiments/eval/cost.ts`）；context 模式中 recall 與 deliberate 的次數、工具結果要求重寫的次數；
- 兩個條件的 ADR-0008 判斷（keepFeeling、reconsider、declined）；
- context 模式記憶答錯的題，答錯的方式（例如沒有提到某個人的限制）。

## 限制

- 三段歷史仍然不多（rd-v4 報告）；題目都已經暴露。
- context 模式中，做法的閘門仍以輔助呼叫重跑思考（近似）。
