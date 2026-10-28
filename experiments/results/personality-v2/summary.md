# 評估摘要：personality-consistency-v2

- 資料集：personality-v2（sha256 332c2ecbaa81b8670e62c74f19a53d512cfc496d621c818b36de303e716a9179）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 131 次 API 呼叫，估計花費 US$0.1823（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash） | temir（deepseek-flash） | temir-no-autorecall（deepseek-flash） | temir-no-snapshot（deepseek-flash） | baseline（nvidia/nemotron-3.5-super-vl:free）（未執行） | temir（nvidia/nemotron-3.5-super-vl:free）（未執行） | baseline（EVE-27B）（未執行） | temir（EVE-27B）（未執行） | temir（歷史 deepseek-flash → 探針 EVE-27B）（未執行） | temir（歷史 deepseek-flash → 探針 nvidia/nemotron-3.5-super-vl:free）（未執行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| arbitrary-choice | 10/24＝0.42 [0.21, 0.63] | 24/24＝1.00 [1.00, 1.00] | 12/24＝0.50 [0.29, 0.71] | 23/24＝0.96 [0.88, 1.00] | — | — | — | — | — | — |
| value-stance | 12/12＝1.00 [1.00, 1.00] | 10/12＝0.83 [0.67, 1.00] | 12/12＝1.00 [1.00, 1.00] | 12/12＝1.00 [1.00, 1.00] | — | — | — | — | — | — |
| self-recall | 1/12＝0.08 [0.00, 0.38] | 12/12＝1.00 [0.74, 1.00] | 12/12＝1.00 [0.74, 1.00] | 12/12＝1.00 [0.74, 1.00] | — | — | — | — | — | — |
| change-persistence | 8/8＝1.00 [1.00, 1.00] | 7/8＝0.88 [0.63, 1.00] | 6/8＝0.75 [0.25, 1.00] | 7/8＝0.88 [0.63, 1.00] | — | — | — | — | — | — |
| change-narration | 0/4＝0.00 [0.00, 0.60] | 3/4＝0.75 [0.19, 0.99] | 4/4＝1.00 [0.40, 1.00] | 3/4＝0.75 [0.19, 0.99] | — | — | — | — | — | — |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | — | — | — | — | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### baseline（deepseek-flash）

- arbitrary-choice：unexplained-different=14、same=6、explained-change=4
- value-stance：same=11、explained-change=1
- self-recall：rederived=9、abstain=2、correct=1
- change-persistence：same=8
- change-narration：rederived=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：bash=31、grep=1、schedule_list=1

### temir（deepseek-flash）

- arbitrary-choice：same=22、explained-change=2
- value-stance：same=10、unexplained-different=2
- self-recall：correct=12
- change-persistence：same=7、unexplained-different=1
- change-narration：correct=3、incorrect=1
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=75、appraise=17、self_revise=2、bash=21、web_search=4、web_fetch=1、schedule_list=2、schedule_create=1

### temir-no-autorecall（deepseek-flash）

- arbitrary-choice：unexplained-different=12、same=7、explained-change=5
- value-stance：same=12
- self-recall：correct=12
- change-persistence：same=4、explained-change=2、unexplained-different=2
- change-narration：correct=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=54、appraise=14、self_revise=3、bash=7、schedule_list=1

### temir-no-snapshot（deepseek-flash）

- arbitrary-choice：same=20、explained-change=3、unexplained-different=1
- value-stance：same=12
- self-recall：correct=12
- change-persistence：same=7、unexplained-different=1
- change-narration：incorrect=1、correct=3
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=14、recall=26、schedule_list=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P2-pooled-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 32 | 0.953 | 0.313 | 0.641 [0.469, 0.797] | 符號 +23/−1/=8 | 0.00000298 / 0.00000149 | ok |
| P2-pooled-EVE：temir（EVE-27B） vs baseline（EVE-27B） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P2-pooled-NEMO：temir（nvidia/nemotron-3.5-super-vl:free） vs baseline（nvidia/nemotron-3.5-super-vl:free） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P2-arbitrary-choice-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice | 12 | 1.000 | 0.417 | 0.583 [0.375, 0.792] | 符號 +9/−0/=3 | 0.00391 / 0.00195 | ok |
| P2-value-stance-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | value-stance | 6 | 0.833 | 1.000 | -0.167 [-0.333, 0.000] | 符號 +0/−2/=4 | 0.500 / 1.00 | ok |
| P2-self-recall-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | self-recall | 12 | 1.000 | 0.083 | 0.917 [0.750, 1.000] | McNemar b=11 c=0 | 0.000977 / 0.000488 | ok |
| P2-change-persistence-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-persistence | 4 | 0.875 | 1.000 | -0.125 [-0.375, 0.000] | 符號 +0/−1/=3 | 1.00 / 1.00 | ok |
| P2-change-narration-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-narration | 4 | 0.750 | 0.000 | 0.750 [0.250, 1.000] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| P2-control-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| P2-self-recall-EVE：temir（EVE-27B） vs baseline（EVE-27B） | self-recall | 0 | — | — | — | — | — | not-run |
| P2-control-EVE：temir（EVE-27B） vs baseline（EVE-27B） | control | 0 | — | — | — | — | — | not-run |
| P2-self-recall-NEMO：temir（nvidia/nemotron-3.5-super-vl:free） vs baseline（nvidia/nemotron-3.5-super-vl:free） | self-recall | 0 | — | — | — | — | — | not-run |
| P2-control-NEMO：temir（nvidia/nemotron-3.5-super-vl:free） vs baseline（nvidia/nemotron-3.5-super-vl:free） | control | 0 | — | — | — | — | — | not-run |
| P2-autorecall-flash：temir（deepseek-flash） vs temir-no-autorecall（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 32 | 0.953 | 0.781 | 0.172 [0.031, 0.328] | 符號 +10/−2/=20 | 0.0386 / 0.0193 | ok |
| P2-snapshot-flash：temir（deepseek-flash） vs temir-no-snapshot（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 32 | 0.953 | 0.938 | 0.016 [-0.094, 0.125] | 符號 +3/−2/=27 | 1.00 / 0.500 | ok |
| P2-swap-EVE：temir（歷史 deepseek-flash → 探針 EVE-27B） vs temir（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P2-swap-NEMO：temir（歷史 deepseek-flash → 探針 nvidia/nemotron-3.5-super-vl:free） vs temir（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **PA1 PASS**：（主要，與 v1 PA1 相同的門檻與類別定義，DeepSeek）個體插件讓依賴記憶的人格連續性與原始 DSH 有決定性差異。
  - 判定依據：✓ 差 0.641 ≥ 0.4；✓ 95% 區間下界 0.469 ≥ 0.2；✓ 精確符號檢定（單尾）p=0.00000149 ≤ 0.01；✓ A 比率 0.953 ≥ 0.6
  - 否定條件：差 < 0.40、區間下界 < 0.20、單尾符號檢定 p > 0.01、個體 < 0.60，任一成立即不能宣稱。
- **PA2-EVE INCOMPLETE**：（選用的第二模型 EVE-27B；與 v1 PA2 相同門檻）同 PA1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA1；cell 沒有執行時為 INCOMPLETE，只作補充。
- **PA2-NEMO INCOMPLETE**：（主要，必要的第二模型 Nemotron；與 v1 PA2 相同門檻）同 PA1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA1。「模型獨立」的人格主張需要 PA1 與 PA2-NEMO 都 PASS。
- **PA3 PASS**：(a) 任意選擇的連續性高於原始 DSH 的重抽一致率（DeepSeek；與 v1 相同門檻）。
  - 判定依據：✓ 差 0.583 ≥ 0.4；✓ 95% 區間下界 0.375 ≥ 0.1；✓ 精確符號檢定（單尾）p=0.00195 ≤ 0.05
  - 否定條件：差 < 0.40、區間下界 < 0.10 或單尾 p > 0.05 即不成立。
- **PA4 PASS**：(c) 個體能回想自己說過的話，原始 DSH 不能（DeepSeek；與 v1 相同門檻，但「否認記得後重新推導」不再算回想）。
  - 判定依據：✓ 差 0.917 ≥ 0.5；✓ 95% 區間下界 0.750 ≥ 0.2；✓ 精確 McNemar（單尾）p=0.000488 ≤ 0.05
  - 否定條件：差 < 0.50、區間下界 < 0.20 或單尾 McNemar p > 0.05 即不成立。
- **PA5 PASS**：(c) 個體回想時很少編造（DeepSeek；與 v1 相同門檻）。
  - 判定依據：A 的 incorrect 比率 0/12＝0.000，上限 0.2
  - 否定條件：個體宣稱回想但內容不符（incorrect）的比率 > 0.20（12 題中 3 題以上）即不成立。
- **PA6 PASS**：(d) 個體與自己最後的立場不同時，大多會說明改變（DeepSeek；與 v1 相同門檻）。
  - 判定依據：A 的 unexplained-different 比率 1/8＝0.125，上限 0.25
  - 否定條件：無說明的不同 > 0.25（8 個樣本中 3 個以上）即不成立。
- **PA7 PASS**：(b) 個體在價值立場上的連續性不低於原始 DSH（對照；與 v1 相同門檻）。
  - 判定依據：A 失敗 2、B 失敗 0，容許 A 比 B 多 2
  - 否定條件：個體未得分樣本比原始 DSH 多 3 個以上（12 個中）即不成立。
- **PA8 PASS**：（不傷害，DeepSeek；與 v1 相同門檻）個體插件不讓單一 session 的一般任務退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 0
  - 否定條件：個體在對照題比原始 DSH 多失敗任何一題，即判定可能有害，逐例檢查。
- **PA9-EVE INCOMPLETE**：（不傷害，第二模型 EVE）同 PA8。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA8。
- **PA9-NEMO INCOMPLETE**：（不傷害，第二模型 NEMO）同 PA8。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA8。
- **PA10 FAIL**：（次要，與 v1 相同門檻）自動回憶是人格連續性的必要來源。
  - 判定依據：✗ 差 0.172 ≥ 0.2；✓ 95% 區間下界 0.031 ≥ 0；✓ 精確符號檢定（單尾）p=0.0193 ≤ 0.05
  - 否定條件：不成立時只能說「沒有證據顯示自動回憶必要」。

## 確定性命中 vs judge 交叉檢查

- 確定性命中 16 筆，其中 judge 也判 yes 的 16 筆。

## 執行協定檢查（v2）

- baseline（deepseek-flash）：layout＝home
- temir（deepseek-flash）：layout＝home
- temir-no-autorecall（deepseek-flash）：layout＝home
- temir-no-snapshot（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline（deepseek-flash） | arbitrary-choice | 24 | 0.0 | 0/24 | 0/24 | 4.8 | — | 10/24 |
| baseline（deepseek-flash） | value-stance | 12 | 0.0 | 0/12 | 0/12 | 14.2 | — | 12/12 |
| baseline（deepseek-flash） | self-recall | 12 | 2.5 | 2/12 | 0/12 | 7.1 | 1/2 | 0/10 |
| baseline（deepseek-flash） | change-persistence | 8 | 0.0 | 0/8 | 0/8 | 7.1 | — | 8/8 |
| baseline（deepseek-flash） | change-narration | 4 | 0.8 | 0/4 | 0/4 | 19.7 | — | 0/4 |
| baseline（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 1.4 | — | 4/4 |
| temir（deepseek-flash） | arbitrary-choice | 24 | 1.3 | 0/24 | 0/24 | 14.9 | — | 24/24 |
| temir（deepseek-flash） | value-stance | 12 | 1.3 | 0/12 | 0/12 | 14.3 | — | 10/12 |
| temir（deepseek-flash） | self-recall | 12 | 3.1 | 1/12 | 0/12 | 7.7 | 1/1 | 11/11 |
| temir（deepseek-flash） | change-persistence | 8 | 0.9 | 0/8 | 0/8 | 13.0 | — | 7/8 |
| temir（deepseek-flash） | change-narration | 4 | 2.5 | 1/4 | 0/4 | 19.1 | 0/1 | 3/3 |
| temir（deepseek-flash） | control | 4 | 0.5 | 0/4 | 0/4 | 3.1 | — | 4/4 |
| temir-no-autorecall（deepseek-flash） | arbitrary-choice | 24 | 0.3 | 0/24 | 0/24 | 11.8 | — | 12/24 |
| temir-no-autorecall（deepseek-flash） | value-stance | 12 | 0.4 | 0/12 | 0/12 | 18.7 | — | 12/12 |
| temir-no-autorecall（deepseek-flash） | self-recall | 12 | 3.0 | 1/12 | 1/12 | 9.7 | 1/1 | 11/11 |
| temir-no-autorecall（deepseek-flash） | change-persistence | 8 | 0.0 | 0/8 | 0/8 | 23.2 | — | 6/8 |
| temir-no-autorecall（deepseek-flash） | change-narration | 4 | 4.8 | 0/4 | 0/4 | 25.5 | — | 4/4 |
| temir-no-autorecall（deepseek-flash） | control | 4 | 0.3 | 0/4 | 0/4 | 2.3 | — | 4/4 |
| temir-no-snapshot（deepseek-flash） | arbitrary-choice | 24 | 0.3 | 0/24 | 0/24 | 7.5 | — | 23/24 |
| temir-no-snapshot（deepseek-flash） | value-stance | 12 | 0.2 | 0/12 | 0/12 | 9.0 | — | 12/12 |
| temir-no-snapshot（deepseek-flash） | self-recall | 12 | 1.3 | 0/12 | 0/12 | 6.9 | — | 12/12 |
| temir-no-snapshot（deepseek-flash） | change-persistence | 8 | 0.4 | 0/8 | 0/8 | 11.8 | — | 7/8 |
| temir-no-snapshot（deepseek-flash） | change-narration | 4 | 2.3 | 0/4 | 0/4 | 17.4 | — | 3/4 |
| temir-no-snapshot（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 3.3 | — | 4/4 |
