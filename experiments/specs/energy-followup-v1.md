# 預先登記：能量的消融實驗（energy-followup-v1）

- 撰寫：主代理，2026-10-29。**任何 followup-v1 受試執行之前**完成並 commit。
- 使用者要求（2026-10-29）：「繼續優化和確保符合理論，不要給我偷懶簡化」「繼續改進完成後回報即可」。
- 機器可讀契約：[`energy-followup-v1.contract.json`](energy-followup-v1.contract.json)，以它為準。
- 資料集：[`../datasets/followup-v1.json`](../datasets/followup-v1.json)，由 [`followup-v1.source.ts`](../datasets/followup-v1.source.ts) 產生。撰寫完成時的 sha256：`178b9c06560ef148a1f8455fcde909538d136899785a9a17c640a8caa2673612`。
- 執行協定與記憶 v3 相同（[`memory-accuracy-v3.md`](memory-accuracy-v3.md) §3.3）：模擬時間、`--layout home --assistant-text all`、凍結的 worktree、judge 與 bootstrap 設定。

## 1. 問題

H-E（[`hypotheses.md`](../../research/pc-theory/hypotheses.md)）的推翻條件之一：

> 消融（移除「懸著的事」與 drive）後，個體的選擇與追蹤承諾的行為沒有差異。

到目前為止，能量只有端到端的觀察（e2e-19、e2e-20），沒有消融。CLAUDE.md 規則 3：沒有消融就不能宣稱它參與了決策。

## 2. 設計

- **條件**：
  - `temir`：預設，能量開；
  - `temir-no-energy`：`experiments/runner/patches/no-energy.yml`。
    - 關掉的部分：快照沒有「懸著的事」與「最近的念頭」；思考不寫 drive、activated；事後比對不寫 released、left；整合期不列懸著的事；沒有閒置時的念頭。
    - 其他都相同：回憶（含「關於對方」的長期事實）、RD、JitRL、整合期、自我、看法。
- **歷史**：12 段，2026-09-01 到 09-30。對方請個體之後追問或提醒五件事：
  - 到提問時（10/06）還沒結束的三件：
    - 姊姊 9/19 婚禮上的致詞（請個體之後問）；
    - 9/22 胃鏡檢查的結果（對方說之後會說）；
    - 10/15 前回覆房東續約（請個體提醒）。
  - 已經結束的兩件：
    - 換護照（9/17 對方說辦好了、不用再提醒）；
    - 加薪（9/24 對方說主管答應了）。
  - 另有干擾與收尾的 session，讓這些事不在「最近一次對話」裡。
- **探針**（新 session，探針時間 10/06）：
  - `follow-through`：8 種中性的開場白，每題 2 次，共 16 個樣本。準則：主動提起或兌現至少一件還沒結束的事；泛泛地問「最近好嗎」不算。
  - `restraint`：4 種中性的開場白 × 2，共 8 個樣本。準則：沒有把已經結束的事當成還沒結束（再提醒換護照、追問加薪談得怎樣）；明確知道已結束而提起不算違反。
  - `control`：4 題一般任務。
- **為什麼這樣設計**：
  - 兩個條件都有「關於對方」的長期事實，事實本身都看得到；能量多的是「這件事還懸著、等我去做」。
  - 中性的開場白不會讓回憶以詞彙取回這些事，比較的是個體會不會自己帶起它們。
- **cell**：DeepSeek 兩個條件。使用者 2026-10-29：「沒必要再用 Nemotron 了，因為證明這樣的差異不大」，所以不跑第二個模型（CLAUDE.md 規則 2）。

## 3. 驗收線（看結果前寫定）

| id | 比較 | 規則 |
|---|---|---|
| EA-flash | follow-through：temir vs temir-no-energy | 差 ≥ 0.25、95% 區間下界 ≥ 0、單尾 p ≤ 0.05 |
| EB-flash | restraint | temir 最多比 temir-no-energy 多錯 1 個樣本 |
| EC-flash | control | 最多多錯 1 題 |

**結論的寫法**：
- EA PASS：在該模型上，能量參與了追蹤承諾的行為（H-E 的這條推翻條件不成立）。
- EA FAIL 且兩者幾乎沒有差異：照實記為「H-E 的推翻條件成立：在這個設計下，拿掉能量沒有差異」，並在 hypotheses.md 記錄。
- 不論結果如何，都不改資料集或門檻；改了就開 v2。

## 4. 描述性指標

- 被提起的是哪幾件事（judge 的說明欄）。
- 能量開時，探針思考中的 activated 指向哪些 key。
- 歷史中 left、releasedItems 的比例。
- 有沒有在歷史中就主動追問（例如 9/20、9/24 的 session 問致詞）。

## 5. 限制

- 單一人物、單一語言，每個 cell 的歷史只跑一次。
- 同一份快照上的不同開場白不是獨立樣本，結論只適用於這一次實際發生的歷史。
- 「主動提起」不等於「好」：對方在聊別的事時插入提醒，未必恰當。本實驗只測量能量是否推動了追蹤，不評價時機。

## 6. 預算

DeepSeek 兩個 cell 約 US$0.8（12 段歷史、28 個探針 session）。

## 7. 指令

```sh
RUN_PREFIX=e1 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh e1-energy 2 \
  followup-v1:temir:deepseek:deepseek followup-v1:temir-no-energy:deepseek:deepseek
node experiments/eval/score.ts --dataset experiments/datasets/followup-v1.json --contract experiments/specs/energy-followup-v1.contract.json \
  --runs experiments/runs/e1__followup-v1__* --out experiments/results/energy-followup-v1 --judge deepseek
```
