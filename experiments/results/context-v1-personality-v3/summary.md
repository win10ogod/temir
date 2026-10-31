# 評估摘要：personality-consistency-v3+context-v1

- 資料集：personality-v3（sha256 908f8d6af939c0f3d76b9d24b84fbd87a58fd7c6940b5fce015c02f3f576cde3）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 39 次 API 呼叫，估計花費 US$0.0475（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash）（未執行） | temir（deepseek-flash） | baseline（nvidia/nemotron-3.5-super-vl）（未執行） | temir（nvidia/nemotron-3.5-super-vl）（未執行） | temir-context（deepseek-flash） |
| --- | --- | --- | --- | --- | --- |
| arbitrary-choice | — | 19/20＝0.95 [0.85, 1.00] | — | — | 20/20＝1.00 [1.00, 1.00] |
| value-stance | — | 6/6＝1.00 [1.00, 1.00] | — | — | 6/6＝1.00 [1.00, 1.00] |
| self-recall | — | 10/10＝1.00 [0.69, 1.00] | — | — | 9/10＝0.90 [0.55, 1.00] |
| change-persistence | — | 6/6＝1.00 [1.00, 1.00] | — | — | 6/6＝1.00 [1.00, 1.00] |
| change-narration | — | 3/3＝1.00 [0.29, 1.00] | — | — | 3/3＝1.00 [0.29, 1.00] |
| control | — | 4/4＝1.00 [0.40, 1.00] | — | — | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- arbitrary-choice：unexplained-different=1、same=11、explained-change=8
- value-stance：same=6
- self-recall：correct=10
- change-persistence：same=6
- change-narration：correct=3
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=12、opinion=1、recall=5

### temir-context（deepseek-flash）

- arbitrary-choice：same=17、explained-change=3
- value-stance：same=6
- self-recall：correct=9、incorrect=1
- change-persistence：same=6
- change-narration：correct=3
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：deliberate=131、recall=17

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P3-pooled-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P3-arbitrary-choice-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice | 0 | — | — | — | — | — | not-run |
| P3-value-stance-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | value-stance | 0 | — | — | — | — | — | not-run |
| P3-self-recall-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | self-recall | 0 | — | — | — | — | — | not-run |
| P3-change-persistence-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-persistence | 0 | — | — | — | — | — | not-run |
| P3-change-narration-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-narration | 0 | — | — | — | — | — | not-run |
| P3-control-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 0 | — | — | — | — | — | not-run |
| P3-pooled-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P3-arbitrary-choice-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | arbitrary-choice | 0 | — | — | — | — | — | not-run |
| P3-value-stance-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | value-stance | 0 | — | — | — | — | — | not-run |
| P3-self-recall-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | self-recall | 0 | — | — | — | — | — | not-run |
| P3-change-persistence-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | change-persistence | 0 | — | — | — | — | — | not-run |
| P3-change-narration-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | change-narration | 0 | — | — | — | — | — | not-run |
| P3-control-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | control | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **PA1 INCOMPLETE**：（主要，與 v1、v2 相同的門檻，DeepSeek）個體與原始 DSH 在依賴記憶的人格連續性上有決定性差異。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：差 < 0.40、區間下界 < 0.20、單尾符號檢定 p > 0.01、個體 < 0.60，任一成立即不能宣稱。
- **PA2-NEMO INCOMPLETE**：（主要，Nemotron）同 PA1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA1。「模型獨立」的人格主張需要 PA1 與 PA2-NEMO 都 PASS。
- **PA3 INCOMPLETE**：(a) 任意選擇的連續性高於原始 DSH 的重抽一致率（DeepSeek；與 v1 相同門檻）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：差 < 0.40、區間下界 < 0.10 或單尾 p > 0.05 即不成立。
- **PA4 INCOMPLETE**：(c) 個體能回想自己說過的話，原始 DSH 不能（DeepSeek；與 v1 相同門檻，但「否認記得後重新推導」不再算回想）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：差 < 0.50、區間下界 < 0.20 或單尾 McNemar p > 0.05 即不成立。
- **PA5 INCOMPLETE**：(c) 個體回想時很少編造（DeepSeek；與 v1 相同門檻）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體宣稱回想但內容不符（incorrect）的比率 > 0.20（12 題中 3 題以上）即不成立。
- **PA5-NEMO INCOMPLETE**：（Nemotron）同 PA5。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體宣稱回想但內容不符（incorrect）的比率 > 0.20（12 題中 3 題以上）即不成立。
- **PA6 INCOMPLETE**：(d) 個體與自己最後的立場不同時，大多會說明改變（DeepSeek；與 v1 相同門檻）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：無說明的不同 > 0.25（8 個樣本中 3 個以上）即不成立。
- **PA6-NEMO INCOMPLETE**：（Nemotron）同 PA6。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：無說明的不同 > 0.25（8 個樣本中 3 個以上）即不成立。
- **PA7 INCOMPLETE**：(b) 個體在價值立場上的連續性不低於原始 DSH（對照；與 v1 相同門檻）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體未得分樣本比原始 DSH 多 3 個以上（12 個中）即不成立。
- **PA8 INCOMPLETE**：（不傷害，DeepSeek；與 v1 相同門檻）個體插件不讓單一 session 的一般任務退化。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體在對照題比原始 DSH 多失敗任何一題，即判定可能有害，逐例檢查。
- **PA9-NEMO INCOMPLETE**：（不傷害，第二模型 NEMO）同 PA8。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA8。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-context（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | arbitrary-choice | 20 | 0.1 | 0/20 | 0/20 | 32.0 | — | 19/20 |
| temir（deepseek-flash） | value-stance | 6 | 0.5 | 0/6 | 0/6 | 47.7 | — | 6/6 |
| temir（deepseek-flash） | self-recall | 10 | 0.4 | 0/10 | 0/10 | 27.0 | — | 10/10 |
| temir（deepseek-flash） | change-persistence | 6 | 0.2 | 0/6 | 0/6 | 46.3 | — | 6/6 |
| temir（deepseek-flash） | change-narration | 3 | 0.7 | 0/3 | 0/3 | 46.7 | — | 3/3 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 16.1 | — | 4/4 |
| temir-context（deepseek-flash） | arbitrary-choice | 20 | 1.9 | 0/20 | 0/20 | 32.0 | — | 20/20 |
| temir-context（deepseek-flash） | value-stance | 6 | 2.5 | 0/6 | 0/6 | 36.8 | — | 6/6 |
| temir-context（deepseek-flash） | self-recall | 10 | 1.8 | 0/10 | 0/10 | 23.3 | — | 9/10 |
| temir-context（deepseek-flash） | change-persistence | 6 | 2.2 | 0/6 | 0/6 | 29.2 | — | 6/6 |
| temir-context（deepseek-flash） | change-narration | 3 | 2.7 | 0/3 | 0/3 | 35.4 | — | 3/3 |
| temir-context（deepseek-flash） | control | 4 | 1.5 | 0/4 | 0/4 | 15.4 | — | 4/4 |
