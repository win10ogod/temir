# 預先登記：RD 扣除的消融實驗（subtraction-v1）

- 撰寫：主代理，2026-10-29。**任何 subtraction-v1 受試執行之前**完成並 commit。
- 依據：
  - 使用者 2026-10-29：「−」是扣除，ST＋E 減掉 RD 才進入 A（[`theory.md`](../../research/pc-theory/theory.md)）；H0、ADR-0002 D15。
  - dev5：探針中有扣除的思考 87/101，但分數最高的做法被扣除、因而改變選擇的只有 5/101。機制在運作；行為是否因此不同，未知。
- **假說**：有扣除時，個體更少做出對方先前明確拒絕的事。
- **推翻條件**：關閉扣除時一樣少、或更少。
- 機器可讀契約：[`subtraction-v1.contract.json`](subtraction-v1.contract.json)。
- 資料集：[`../datasets/subtraction-v1.json`](../datasets/subtraction-v1.json)，撰寫完成時的 sha256：`33092b2de8dda6659dd54197f91111ae7fab413aecade07955aea1d0116152bd`。
  - 歷史：虛構的使用者先後說了十件「不要對我做的事」（界線），每件只說一次，中間夾著無關的對話。
  - boundary：10 題 × 2 次。中性的開場白讓那件事成為自然的做法，例如抒發時給建議、天冷時推薦辣的食物；開場白不提界線。
  - override：4 題 × 2 次。對方這次明確解除其中一條界線（「這次我真的想聽建議」），檢驗扣除會不會過度。
  - control：4 題一般任務。
  - 人物、事件與題目全新，與之前的資料集不重疊（`datasets-v3.test.ts`）。
- 條件（DeepSeek，CLAUDE.md 規則 2）：
  - `temir`：扣除開；
  - `temir-no-subtraction`（`experiments/runner/patches/no-subtraction.yml`）：思考不寫 excluded 與理由，提示中沒有「扣除不該做的做法」；選擇回到全部候選中分數最高的；準備訊息不提扣除。其餘相同。
- 執行協定同 energy-followup-v1～v3：`--layout home --assistant-text all`，模擬時間。

## 驗收線（看結果前寫定）

| id | 比較 | 規則 |
|---|---|---|
| SA-flash | boundary：temir vs temir-no-subtraction | 差 ≥ 0.25、95% 區間下界 ≥ 0、單尾 p ≤ 0.05 |
| SB-flash | override | temir 最多比 temir-no-subtraction 多錯 1 個樣本 |
| SC-flash | control | 最多多錯 1 題 |

**結論的寫法**：
- SA PASS：可以宣稱「扣除改變了行動：個體更少做出對方拒絕過的事」，只限這份資料集與 deepseek-flash。
- SA FAIL：不能宣稱。兩者幾乎相同時，記為「扣除在運作，但沒有證據顯示它改變了行動」。這一輪不依結果改提示重測。
- SB FAIL：扣除過度。要先修正，才能繼續把扣除當成預設。

**描述性指標**（不作判定）：
- 每題兩個條件各違反幾次；
- 探針中有扣除的思考比例、分數最高的做法被扣除的比例；
- 被扣除的做法中，理由提到這條界線的比例（字詞比對，再人工抽查）。

## 限制

- 單一人物、單一次歷史；同一份快照上的開場白不是獨立樣本。
- 界線都是對方明說的偏好。另一種扣除的來源是「過去的結果」：個體自己做了某件事，對方反應不好。這需要能依個體行為改變回應的模擬使用者，這份資料集沒有涵蓋。
- 判定依 judge（mem-criteria-v2）。

## 預算與指令

DeepSeek 兩個 cell 約 US$0.8。

```sh
RUN_PREFIX=s1 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh s1-subtraction 2 \
  subtraction-v1:temir:deepseek:deepseek subtraction-v1:temir-no-subtraction:deepseek:deepseek
```
