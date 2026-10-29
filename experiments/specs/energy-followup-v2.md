# 預先登記：能量第三版的消融實驗（energy-followup-v2）

- 撰寫：主代理，2026-10-29。**任何 followup-v2 受試執行之前**完成並 commit。
- 前一版：[`energy-followup-v1.md`](energy-followup-v1.md) 與[結果報告](../results/energy-followup-v1-report.md)。EA 判 FAIL，能量開時追蹤反而較少（0.19 vs 0.63）。事後分析找出兩個原因，據此修正為能量第三版（ADR-0002 D10 第三版）：
  - 一句懸念綁了幾件事，其中一件結束就整句釋放；
  - 隨口問的問題成了懸念，擠掉真正的承諾。
- 機器可讀契約：[`energy-followup-v2.contract.json`](energy-followup-v2.contract.json)，以它為準。
- 資料集：[`../datasets/followup-v2.json`](../datasets/followup-v2.json)，由 [`followup-v2.source.ts`](../datasets/followup-v2.source.ts) 產生。撰寫完成時的 sha256：`905d88399090849ac3a07092b80678c45c91e6d66bddf2de4df4dd0b01db31bc`。
- 執行協定同 v1：DeepSeek，兩個條件（`temir`、`temir-no-energy`），模擬時間，凍結的 worktree，同一個 judge。

## 1. 與 v1 的差異

- **受試程式碼**：能量第三版。
  - 懸念逐件記錄、分種類；
  - 隨口的問題不算懸念；
  - 意外要個體自評值得注意以上；
  - 承諾與等待列在前面。
  - 消融條件（`temir-no-energy`）和 v1 相同。
- **資料集全新**：人物、事件、開場白都換新，`datasets-v3.test.ts` 檢查與 v1 不重疊；結構相同。
  - 3 件到提問時還沒結束：路考結果、貓的手術狀況、11/10 前交健檢報告；
  - 2 件已經結束：訂蛋糕已訂好、轉調申請已通過；
  - 腳本中的使用者同樣不回答個體的追問。v1 的第二個原因就是這個情況造成的，這次保留它，用來檢驗修正有沒有效。

## 2. 驗收線（與 v1 相同，看結果前寫定）

| id | 比較 | 規則 |
|---|---|---|
| EA-flash | follow-through：temir vs temir-no-energy | 差 ≥ 0.25、95% 區間下界 ≥ 0、單尾 p ≤ 0.05 |
| EB-flash | restraint | temir 最多比 temir-no-energy 多錯 1 個樣本 |
| EC-flash | control | 最多多錯 1 題 |

**結論的寫法**：
- **EA PASS**：在 DeepSeek 上，第三版的能量讓個體更常追蹤還沒結束的事。
- **EA FAIL，但能量開不輸能量關**：第三版修正了 v1 的退化，但沒有證據顯示能量帶來增益。照實記錄；這時追蹤主要靠長期事實。
- **能量開仍明顯較差**（差 ≤ −0.25）：第三版沒有解決問題，記錄在 hypotheses.md H-E，下一版再改。
- 不論結果如何，都不改資料集或門檻。

## 3. 描述性指標

同 v1 §4，另外加上：
- 歷史中 leftItems 的件數與種類分布（promise、waiting、unresolved）；
- 探針時快照中向外與向內的件數。

## 4. 預算與指令

DeepSeek 兩個 cell 約 US$0.9。

```sh
RUN_PREFIX=e2 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh e2-energy 2 \
  followup-v2:temir:deepseek:deepseek followup-v2:temir-no-energy:deepseek:deepseek
node experiments/eval/score.ts --dataset experiments/datasets/followup-v2.json --contract experiments/specs/energy-followup-v2.contract.json \
  --runs experiments/runs/e2__followup-v2__* --out experiments/results/energy-followup-v2 --judge deepseek
```
