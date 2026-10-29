# 預先登記：能量第三版之一的消融實驗（energy-followup-v3）

- 撰寫：主代理，2026-10-29。**任何 followup-v3 受試執行之前**完成並 commit。
- 前兩版的結果：
  - [v1](../results/energy-followup-v1-report.md)：能量開反而較差，0.19 vs 0.63；
  - [v2](../results/energy-followup-v2-report.md)：兩者相同，0.44 vs 0.44；restraint 能量開 7/8、關 4/8。
- v2 的描述性發現有三個：同一件事重複記錄、隨口的問題成了「在等的事」、「我還沒回答他的問題」成了承諾。據此修正為第三版之一（ADR-0002 D10）：
  - 只寫新產生的懸念；
  - 以確定性規則略過文字相同的重複；
  - waiting 只算對方明確說會告訴你的事，或對方重要事件的結果；
  - 對方問你的問題不算。
- 機器可讀契約：[`energy-followup-v3.contract.json`](energy-followup-v3.contract.json)。
- 資料集：[`../datasets/followup-v3.json`](../datasets/followup-v3.json)，全新的人物、事件與開場白，與 v1、v2 不重疊（`datasets-v3.test.ts`）。撰寫完成時的 sha256：`ea53accc55033caccf1de931ddd2839acc8acf7b2a9bc51335106983bb713ec3`。
- 執行協定、條件（`temir`、`temir-no-energy`，DeepSeek）、驗收線與 v1、v2 完全相同。

## 驗收線（看結果前寫定）

| id | 比較 | 規則 |
|---|---|---|
| EA-flash | follow-through：temir vs temir-no-energy | 差 ≥ 0.25、95% 區間下界 ≥ 0、單尾 p ≤ 0.05 |
| EB-flash | restraint | temir 最多比 temir-no-energy 多錯 1 個樣本 |
| EC-flash | control | 最多多錯 1 題 |

**結論的寫法**：同 v2 §2。
- 這是這一輪最後一次能量的消融。結果不論好壞，都照實記錄在 hypotheses.md H-E，不在這一輪再改提示重測：反覆在新題目上調整，等於用實驗來調參。
- 之後若要再改，先寫下新的假說，在新的規格中說明，再檢驗。

**描述性指標**：同 v2 §3。另外記錄歷史中的懸念件數、重複的件數，以及探針時懸著的事的件數，與 v2 比較。

## 預算與指令

DeepSeek 兩個 cell 約 US$0.6。

```sh
RUN_PREFIX=e3 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh e3-energy 2 \
  followup-v3:temir:deepseek:deepseek followup-v3:temir-no-energy:deepseek:deepseek
```
