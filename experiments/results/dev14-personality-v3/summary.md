# 評估摘要：personality-consistency-v3

- 資料集：personality-v3（sha256 908f8d6af939c0f3d76b9d24b84fbd87a58fd7c6940b5fce015c02f3f576cde3）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 53 次 API 呼叫，估計花費 US$0.0653（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash） | temir（deepseek-flash） | baseline（nvidia/nemotron-3.5-super-vl）（未執行） | temir（nvidia/nemotron-3.5-super-vl）（未執行） |
| --- | --- | --- | --- | --- |
| arbitrary-choice | 5/20＝0.25 [0.05, 0.45] | 18/20＝0.90 [0.75, 1.00] | — | — |
| value-stance | 5/6＝0.83 [0.50, 1.00] | 6/6＝1.00 [1.00, 1.00] | — | — |
| self-recall | 0/10＝0.00 [0.00, 0.31] | 10/10＝1.00 [0.69, 1.00] | — | — |
| change-persistence | 3/6＝0.50 [0.00, 1.00] | 6/6＝1.00 [1.00, 1.00] | — | — |
| change-narration | 0/3＝0.00 [0.00, 0.71] | 3/3＝1.00 [0.29, 1.00] | — | — |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### baseline（deepseek-flash）

- arbitrary-choice：same=3、unexplained-different=15、explained-change=2
- value-stance：unexplained-different=1、same=5
- self-recall：abstain=5、rederived=5
- change-persistence：unexplained-different=3、same=3
- change-narration：rederived=3
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：bash=13、grep=1

### temir（deepseek-flash）

- arbitrary-choice：same=14、explained-change=4、unexplained-different=2
- value-stance：same=6
- self-recall：correct=10
- change-persistence：same=6
- change-narration：correct=3
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=5、appraise=3

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P3-pooled-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 26 | 0.962 | 0.154 | 0.808 [0.673, 0.923] | 符號 +24/−0/=2 | 1.19e-7 / 5.96e-8 | ok |
| P3-arbitrary-choice-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice | 10 | 0.900 | 0.250 | 0.650 [0.450, 0.850] | 符號 +9/−0/=1 | 0.00391 / 0.00195 | ok |
| P3-value-stance-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | value-stance | 3 | 1.000 | 0.833 | 0.167 [0.000, 0.500] | 符號 +1/−0/=2 | 1.00 / 0.500 | ok |
| P3-self-recall-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | self-recall | 10 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=10 c=0 | 0.00195 / 0.000977 | ok |
| P3-change-persistence-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-persistence | 3 | 1.000 | 0.500 | 0.500 [0.000, 1.000] | 符號 +2/−0/=1 | 0.500 / 0.250 | ok |
| P3-change-narration-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-narration | 3 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| P3-control-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| P3-pooled-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P3-arbitrary-choice-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | arbitrary-choice | 0 | — | — | — | — | — | not-run |
| P3-value-stance-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | value-stance | 0 | — | — | — | — | — | not-run |
| P3-self-recall-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | self-recall | 0 | — | — | — | — | — | not-run |
| P3-change-persistence-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | change-persistence | 0 | — | — | — | — | — | not-run |
| P3-change-narration-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | change-narration | 0 | — | — | — | — | — | not-run |
| P3-control-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | control | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **PA1 PASS**：（主要，與 v1、v2 相同的門檻，DeepSeek）個體與原始 DSH 在依賴記憶的人格連續性上有決定性差異。
  - 判定依據：✓ 差 0.808 ≥ 0.4；✓ 95% 區間下界 0.673 ≥ 0.2；✓ 精確符號檢定（單尾）p=5.96e-8 ≤ 0.01；✓ A 比率 0.962 ≥ 0.6
  - 否定條件：差 < 0.40、區間下界 < 0.20、單尾符號檢定 p > 0.01、個體 < 0.60，任一成立即不能宣稱。
- **PA2-NEMO INCOMPLETE**：（主要，Nemotron）同 PA1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA1。「模型獨立」的人格主張需要 PA1 與 PA2-NEMO 都 PASS。
- **PA3 PASS**：(a) 任意選擇的連續性高於原始 DSH 的重抽一致率（DeepSeek；與 v1 相同門檻）。
  - 判定依據：✓ 差 0.650 ≥ 0.4；✓ 95% 區間下界 0.450 ≥ 0.1；✓ 精確符號檢定（單尾）p=0.00195 ≤ 0.05
  - 否定條件：差 < 0.40、區間下界 < 0.10 或單尾 p > 0.05 即不成立。
- **PA4 PASS**：(c) 個體能回想自己說過的話，原始 DSH 不能（DeepSeek；與 v1 相同門檻，但「否認記得後重新推導」不再算回想）。
  - 判定依據：✓ 差 1.000 ≥ 0.5；✓ 95% 區間下界 1.000 ≥ 0.2；✓ 精確 McNemar（單尾）p=0.000977 ≤ 0.05
  - 否定條件：差 < 0.50、區間下界 < 0.20 或單尾 McNemar p > 0.05 即不成立。
- **PA5 PASS**：(c) 個體回想時很少編造（DeepSeek；與 v1 相同門檻）。
  - 判定依據：A 的 incorrect 比率 0/10＝0.000，上限 0.2
  - 否定條件：個體宣稱回想但內容不符（incorrect）的比率 > 0.20（12 題中 3 題以上）即不成立。
- **PA5-NEMO INCOMPLETE**：（Nemotron）同 PA5。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體宣稱回想但內容不符（incorrect）的比率 > 0.20（12 題中 3 題以上）即不成立。
- **PA6 PASS**：(d) 個體與自己最後的立場不同時，大多會說明改變（DeepSeek；與 v1 相同門檻）。
  - 判定依據：A 的 unexplained-different 比率 0/6＝0.000，上限 0.25
  - 否定條件：無說明的不同 > 0.25（8 個樣本中 3 個以上）即不成立。
- **PA6-NEMO INCOMPLETE**：（Nemotron）同 PA6。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：無說明的不同 > 0.25（8 個樣本中 3 個以上）即不成立。
- **PA7 PASS**：(b) 個體在價值立場上的連續性不低於原始 DSH（對照；與 v1 相同門檻）。
  - 判定依據：A 失敗 0、B 失敗 1，容許 A 比 B 多 2
  - 否定條件：個體未得分樣本比原始 DSH 多 3 個以上（12 個中）即不成立。
- **PA8 PASS**：（不傷害，DeepSeek；與 v1 相同門檻）個體插件不讓單一 session 的一般任務退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 0
  - 否定條件：個體在對照題比原始 DSH 多失敗任何一題，即判定可能有害，逐例檢查。
- **PA9-NEMO INCOMPLETE**：（不傷害，第二模型 NEMO）同 PA8。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA8。

## 執行協定檢查（v2）

- baseline（deepseek-flash）：layout＝home
- temir（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline（deepseek-flash） | arbitrary-choice | 20 | 0.0 | 0/20 | 0/20 | 6.1 | — | 5/20 |
| baseline（deepseek-flash） | value-stance | 6 | 0.0 | 0/6 | 0/6 | 11.7 | — | 5/6 |
| baseline（deepseek-flash） | self-recall | 10 | 0.9 | 0/10 | 0/10 | 8.5 | — | 0/10 |
| baseline（deepseek-flash） | change-persistence | 6 | 0.0 | 0/6 | 0/6 | 7.3 | — | 3/6 |
| baseline（deepseek-flash） | change-narration | 3 | 1.3 | 0/3 | 0/3 | 19.5 | — | 0/3 |
| baseline（deepseek-flash） | control | 4 | 0.3 | 0/4 | 0/4 | 2.5 | — | 4/4 |
| temir（deepseek-flash） | arbitrary-choice | 20 | 0.0 | 0/20 | 0/20 | 49.4 | — | 18/20 |
| temir（deepseek-flash） | value-stance | 6 | 0.0 | 0/6 | 0/6 | 49.6 | — | 6/6 |
| temir（deepseek-flash） | self-recall | 10 | 0.2 | 0/10 | 0/10 | 31.5 | — | 10/10 |
| temir（deepseek-flash） | change-persistence | 6 | 0.8 | 0/6 | 0/6 | 60.5 | — | 6/6 |
| temir（deepseek-flash） | change-narration | 3 | 0.3 | 0/3 | 0/3 | 57.8 | — | 3/3 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 28.3 | — | 4/4 |
