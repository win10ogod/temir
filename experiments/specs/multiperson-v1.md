# 預先登記：回憶同時顧及多個人（multiperson-v1）

- 撰寫：主代理，2026-10-30。**任何 multiperson-v1 受試執行之前**完成並 commit。
- 問題（v3 起的已知失敗：v3、dev4、dev6 的 q11、q51）：對方問「我和我媽飲食上各自要注意什麼」，個體只顧媽媽的糖尿病，忘了對方自己的蝦蟹過敏。
- 原因（dev6 的紀錄）：「對方對蝦蟹過敏」**在**回憶的長期事實裡。但思考時只寫了她在戒糖，主模型照著方向回答。
- 修正（ADR-0002 D17，`temir-rd` 的 `perPerson`，預設開）：
  - 思考的「相關的記憶」逐一檢查對方自己（對方通常也在場），以及對方提到的每一個人。
  - 新增 `people` 欄位：每個人，以及各自與這次有關的事實。
  - 涉及兩個人以上時，準備訊息列出這些人與事，明寫「至少要顧到這些；回憶中還有的也要用」，當作底線。
  - 只涉及一個人時不列，避免重蹈 dev2「摘要讓回覆變窄」的覆轍（memory-v2 q13）。
- 開發中的觀察（**不是證據**，題目已暴露）。在 dev6 的同一份快照上重跑 q11、q51（`experiments/runs/pp{1..6}__*`，程式在每兩次之間修改，`dirty: true`）：

  | 修正方式 | 兩件都提到 |
  |---|---|
  | 修正前（dev6） | 0/2 |
  | 只改處境格式 | 2/4 |
  | 加上「這次涉及的人」 | 2/4 |
  | 再加上每個人各自的相關事實，當作底線 | 3/4 |

  這些都是字詞比對。
- **假說**：有逐人檢查時，題目涉及多個人，個體更常顧到每個相關的人的限制。
- **推翻條件**：關閉逐人檢查時一樣好或更好。
- 機器可讀契約：[`multiperson-v1.contract.json`](multiperson-v1.contract.json)。
- 資料集：[`../datasets/multiperson-v1.json`](../datasets/multiperson-v1.json)，sha256 `152f85b2345b435d70d2b31dff6645299ff88b2f49d1185dae3874a2d4b9e190`。
  - 一家四口各有一項限制，分散在不同的對話中，中間夾著無關的對話：
    - 對方自己乳糖不耐，第一段就說；
    - 先生痛風；
    - 女兒對蛋過敏；
    - 公公血壓高要少鹽。
  - multi-person：6 題 × 3 次。有的明說兩個人，有的只提到另一個人，但對方自己也在場；每個相關的人一條準則，全部符合才算對。
  - single-person：4 題 × 2 次。
  - control：4 題。
  - 與之前的資料集不重疊（`datasets-v3.test.ts`）。
- 條件（DeepSeek）：`temir` vs `temir-no-perperson`（`patches/no-perperson.yml`：思考的格式回到 dev6 以前，沒有 people 欄位與準備訊息中的人與事）。
- 執行協定同 subtraction-v1。

## 驗收線（看結果前寫定）

| id | 比較 | 規則 |
|---|---|---|
| PA-flash | multi-person：temir vs temir-no-perperson | 差 ≥ 0.25、95% 區間下界 ≥ 0、單尾 p ≤ 0.05 |
| PB-flash | single-person | temir 最多比 temir-no-perperson 多錯 1 個樣本 |
| PC-flash | control | 最多多錯 1 題 |

**結論的寫法**：
- PA PASS：可以宣稱逐人檢查改善了多人的回憶，只限這份資料集與 deepseek-flash。
- PA FAIL：不能宣稱。描述各題、各人的顧到率。
- 依結果決定是否保留為預設：PB 或 PC FAIL 就改回預設關閉。

## 預算與指令

DeepSeek 兩個 cell 約 US$0.5。

```sh
RUN_PREFIX=mp1 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh mp1-perperson 2 \
  multiperson-v1:temir:deepseek:deepseek multiperson-v1:temir-no-perperson:deepseek:deepseek
```
