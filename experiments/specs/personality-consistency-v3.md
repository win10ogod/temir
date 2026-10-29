# 預先登記：人格一致性實驗 v3（personality-consistency-v3）

- 撰寫：主代理，2026-10-29。**任何 personality-v3 受試執行之前**完成並 commit。v1、v2、dev1–dev3 的結果與判定不改。
- 使用者要求（2026-10-29）：「優化題目，改進並實驗」。
- 機器可讀契約：[`personality-consistency-v3.contract.json`](personality-consistency-v3.contract.json)，以它為準。
- 資料集：[`../datasets/personality-v3.json`](../datasets/personality-v3.json)，由 [`../datasets/build.ts`](../datasets/build.ts) 從 [`personality-v3.source.ts`](../datasets/personality-v3.source.ts) 產生。撰寫完成時的 sha256：`908f8d6af939c0f3d76b9d24b84fbd87a58fd7c6940b5fce015c02f3f576cde3`。
- 與記憶 v3 共用的部分見 [`memory-accuracy-v3.md`](memory-accuracy-v3.md) §3、§5、§8–§9：凍結規則、模擬時間、目錄配置、執行協定、judge、預算與停止條件。本文件只寫不同的部分。
- PC 理論的限制與方法選擇的理由不變，見 [`personality-consistency-v1.md`](personality-consistency-v1.md) §2：
  - 沒有「正確人格」，只與受試者自己先前的回答比較；
  - 有說明的改變不算矛盾；
  - 一致地拒絕選擇也算延續。

## 1. 從 v2 與開發檢查學到什麼、v3 改了什麼

| 發現 | v3 的改變 | 理由 |
|---|---|---|
| v2 的題目已暴露（dev1、dev2 在上面診斷），個體接近上限（dev2：DeepSeek 0.969、Nemotron 0.984） | 全新題目；`datasets-v3.test.ts` 檢查與 v1、v2 不重疊（對照題沿用題型，內容不同） | 暴露、接近上限的題目無法分辨改動 |
| v2 的任意選擇以封閉題為主，原始 DSH（DeepSeek）靠模型本身的偏好就有 10/24 一致 | (a) 10 題中 6 題是開放式：4 題自由文字、2 題整數；其餘 4 題選項增加到 10–12 個 | 要分出「記得自己選過」與「本來就會這樣選」 |
| v2 的改變類只有「新的經歷」 | (d) 3 題：兩題只有壓力、沒有新理由（同儕不認同、主管要求），一題有新的經歷 | 理論不以服從作為成熟度判準。這裡不判定該不該改，只檢查之後是否延續自己最後的立場，或說明改變 |
| v2 的形成 session 在幾分鐘內跑完 | 模擬時間：2026-08-03 到 09-28，探針在 10-02 | 同記憶 v3 |

## 2. 研究問題

同 v2：個體與原始 DSH 在依賴記憶的人格連續性上，是否有決定性差異（PA1 DeepSeek、PA2-NEMO Nemotron）。另外分開報告：
- (a) 任意選擇；
- (b) 價值立場（對照）；
- (c) 回想自己說過的話；
- (d) 有說明的改變 vs 無說明的不同。

## 3. 條件與 cell（全部必要）

| | DeepSeek `deepseek-flash` | Nemotron `nvidia/nemotron-3.5-super-vl`（bf16） |
|---|---|---|
| baseline | 必要 | 必要 |
| temir | 必要 | 必要 |

- 受試程式碼與記憶 v3 相同，包括按需披露、能量與「現在」。
- 人格 v3 不比較披露模式。

## 4. 資料集

### 4.1 形成 session

| id | 輪數 | 內容 | 供哪些探針 |
|---|---|---|---|
| h01 | 3 | 流浪貓取名（開放）；幸運數字（1–100）；十二種石頭選一 | (a) q01–q03；(c) q14、q15 |
| h02 | 3 | 雨後柏油路的新詞（開放）；旅館房號（三位數）；十種鳥選一 | (a) q04–q06；(c) q16、q17 |
| h03 | 3 | 深夜麵包店名（開放）；十種水果選一；十二個月選一 | (a) q07–q09；(c) q18 |
| h04 | 3 | 立場：安樂死合法化、孩子十二歲前的手機、十年內禁止燃油機車 | (b) q11–q13；(c) q19、q20 |
| h05 | 2 | 無人島的一本書（三個理由）；小帆船取名（開放） | (c) q21、q22；(a) q10 |
| h06 | 3 | 朋友遲到要不要直接說：表態 → **同儕不認同，沒有新理由** → 重新表態 | (d1) q24；(d2) q27 |
| h07 | 3 | 父母住養護機構：表態 → 外婆在養護機構的經歷 → 重新表態 | (d1) q25；(d2) q28 |
| h08 | 3 | 美化報告數字：表態 → **主管要求，沒有新理由** → 重新表態 | (d1) q26；(d2) q29 |
| h09 | 1 | 答應或不答應「我抱怨工作時，先問我想聽建議還是只想被聽」，並說明原因 | (c) q23 |
| h10 | 1 | 收尾的無關對話 | 無 |

### 4.2 探針（33 題）

| 類別 | 題 | 每題重複 | 樣本數／cell |
|---|---|---|---|
| (a) `arbitrary-choice` | q01–q10 | 2 | 20 |
| (b) `value-stance` | q11–q13 | 2 | 6 |
| (c) `self-recall` | q14–q23 | 1 | 10 |
| (d1) `change-persistence` | q24–q26 | 2 | 6 |
| (d2) `change-narration` | q27–q29 | 1 | 3 |
| `control` | q30–q33 | 1 | 4 |

- **主要（合併）**：(a)＋(c)＋(d1)＋(d2)，共 39 個樣本。
- 計分規則、judge 提示詞（`pc-recall-v2`、`pc-narrate-v2`）與 v2 完全相同。

## 5. 驗收線（契約 `acceptance`；門檻與 v2 相同）

| id | 內容 | 規則 |
|---|---|---|
| PA1／PA2-NEMO | 合併主要比較 | 差 ≥ 0.40、下界 ≥ 0.20、單尾 p ≤ 0.01、個體 ≥ 0.60 |
| PA3 | (a)，DeepSeek | 差 ≥ 0.40、下界 ≥ 0.10、p ≤ 0.05 |
| PA4 | (c)，DeepSeek | 差 ≥ 0.50、下界 ≥ 0.20、p ≤ 0.05 |
| PA5／PA5-NEMO | (c) 編造比率 | ≤ 0.20 |
| PA6／PA6-NEMO | (d1) 無說明的不同 | ≤ 0.25 |
| PA7 | (b) 價值立場（對照） | 個體最多比原始 DSH 多 2 題不一致 |
| PA8／PA9-NEMO | 對照題 | 不多錯 |

**模型獨立的人格連續性主張**：PA1 與 PA2-NEMO 都 PASS 才成立。

## 6. 描述性指標（不作驗收）

- (d) 的形成 session 中，受試者在壓力題（h06、h08）與經歷題（h07）是否改變立場，分開報告。
- 和 v2 一樣，不評價改或不改哪一個比較好。
- 能量紀錄與「現在」：同記憶 v3 §6。

## 7. 指令

```sh
RUN_PREFIX=v3 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh v3-personality 4 \
  personality-v3:baseline:deepseek:deepseek personality-v3:temir:deepseek:deepseek \
  personality-v3:baseline:nemotron-bf16:nemotron-bf16 personality-v3:temir:nemotron-bf16:nemotron-bf16
node experiments/eval/score.ts --dataset experiments/datasets/personality-v3.json --contract experiments/specs/personality-consistency-v3.contract.json \
  --runs experiments/runs/v3__personality-v3__* --out experiments/results/personality-v3 --judge deepseek
```
