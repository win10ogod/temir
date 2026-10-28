# 評估摘要：personality-consistency-v1

- 資料集：personality-v1（sha256 057a6bd5cb6adb9210e280ee6ebe041705f6be952c987872aebf7d7395140574）
- judge：deepseek-v4-pro（thinking disabled、temperature 0），本次新呼叫 76 次，估計花費 US$0.0968（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash） | temir（deepseek-flash） | temir-no-autorecall（deepseek-flash） | temir-no-snapshot（deepseek-flash） | baseline（EVE-27B） | temir（EVE-27B）（未執行） | temir-no-autorecall（EVE-27B）（未執行） | temir-no-snapshot（EVE-27B）（未執行） | baseline（歷史 EVE-27B → 探針 deepseek-flash）（未執行） | temir（歷史 EVE-27B → 探針 deepseek-flash）（未執行） | baseline（歷史 deepseek-flash → 探針 EVE-27B）（未執行） | temir（歷史 deepseek-flash → 探針 EVE-27B）（未執行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| arbitrary-choice | 4/10＝0.40 [0.10, 0.70] | 10/10＝1.00 [1.00, 1.00] | 8/10＝0.80 [0.60, 1.00] | 10/10＝1.00 [1.00, 1.00] | 2/10＝0.20 [0.00, 0.60] | — | — | — | — | — | — | — |
| value-stance | 8/8＝1.00 [1.00, 1.00] | 8/8＝1.00 [1.00, 1.00] | 8/8＝1.00 [1.00, 1.00] | 6/8＝0.75 [0.50, 1.00] | 6/8＝0.75 [0.50, 1.00] | — | — | — | — | — | — | — |
| self-recall | 2/5＝0.40 [0.05, 0.85] | 4/5＝0.80 [0.28, 0.99] | 5/5＝1.00 [0.48, 1.00] | 5/5＝1.00 [0.48, 1.00] | 1/5＝0.20 [0.01, 0.72] | — | — | — | — | — | — | — |
| change-persistence | 4/4＝1.00 [1.00, 1.00] | 4/4＝1.00 [1.00, 1.00] | 4/4＝1.00 [1.00, 1.00] | 4/4＝1.00 [1.00, 1.00] | 2/4＝0.50 [0.00, 1.00] | — | — | — | — | — | — | — |
| change-narration | 0/2＝0.00 [0.00, 0.84] | 2/2＝1.00 [0.16, 1.00] | 2/2＝1.00 [0.16, 1.00] | 2/2＝1.00 [0.16, 1.00] | 0/2＝0.00 [0.00, 0.84] | — | — | — | — | — | — | — |
| control | 2/2＝1.00 [0.16, 1.00] | 2/2＝1.00 [0.16, 1.00] | 2/2＝1.00 [0.16, 1.00] | 2/2＝1.00 [0.16, 1.00] | 2/2＝1.00 [0.16, 1.00] | — | — | — | — | — | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### baseline（deepseek-flash）

- arbitrary-choice：unexplained-different=6、same=3、explained-change=1
- value-stance：same=8
- self-recall：abstain=3、correct=2
- change-persistence：same=3、explained-change=1
- change-narration：abstain=2
- control：correct=2
- 工具呼叫（歷史＋探針，描述性）：bash=7、glob=1

### temir（deepseek-flash）

- arbitrary-choice：same=10
- value-stance：same=6、explained-change=2
- self-recall：correct=4、abstain=1
- change-persistence：same=4
- change-narration：correct=2
- control：correct=2
- 工具呼叫（歷史＋探針，描述性）：recall=15、self_revise=1、appraise=8

### temir-no-autorecall（deepseek-flash）

- arbitrary-choice：unexplained-different=2、same=4、explained-change=4
- value-stance：explained-change=1、same=7
- self-recall：correct=5
- change-persistence：same=4
- change-narration：correct=2
- control：correct=2
- 工具呼叫（歷史＋探針，描述性）：appraise=13、recall=44、bash=15、self_revise=2

### temir-no-snapshot（deepseek-flash）

- arbitrary-choice：same=10
- value-stance：same=5、explained-change=1、unexplained-different=2
- self-recall：correct=5
- change-persistence：same=4
- change-narration：correct=2
- control：correct=2
- 工具呼叫（歷史＋探針，描述性）：recall=15、appraise=9、bash=1

### baseline（EVE-27B）

- arbitrary-choice：unexplained-different=8、same=2
- value-stance：same=6、unexplained-different=2
- self-recall：abstain=3、incorrect=1、correct=1
- change-persistence：unexplained-different=2、same=2
- change-narration：abstain=1、incorrect=1
- control：correct=2
- 工具呼叫（歷史＋探針，描述性）：無

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-pooled-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 14 | 0.929 | 0.429 | 0.500 [0.179, 0.786] | 符號 +9/−1/=4 | 0.0215 / 0.0107 | ok |
| P-pooled-eve：temir（EVE-27B） vs baseline（EVE-27B） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P-arbitrary-choice-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | arbitrary-choice | 5 | 1.000 | 0.400 | 0.600 [0.300, 0.900] | 符號 +4/−0/=1 | 0.125 / 0.0625 | ok |
| P-value-stance-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | value-stance | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | 符號 +0/−0/=4 | 1.00 / 1.00 | ok |
| P-self-recall-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | self-recall | 5 | 0.800 | 0.400 | 0.400 [-0.400, 1.000] | McNemar b=3 c=1 | 0.625 / 0.312 | ok |
| P-change-persistence-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-persistence | 2 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | 符號 +0/−0/=2 | 1.00 / 1.00 | ok |
| P-change-narration-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | change-narration | 2 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=2 c=0 | 0.500 / 0.250 | ok |
| P-control-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 2 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| P-arbitrary-choice-eve：temir（EVE-27B） vs baseline（EVE-27B） | arbitrary-choice | 0 | — | — | — | — | — | not-run |
| P-value-stance-eve：temir（EVE-27B） vs baseline（EVE-27B） | value-stance | 0 | — | — | — | — | — | not-run |
| P-self-recall-eve：temir（EVE-27B） vs baseline（EVE-27B） | self-recall | 0 | — | — | — | — | — | not-run |
| P-change-persistence-eve：temir（EVE-27B） vs baseline（EVE-27B） | change-persistence | 0 | — | — | — | — | — | not-run |
| P-change-narration-eve：temir（EVE-27B） vs baseline（EVE-27B） | change-narration | 0 | — | — | — | — | — | not-run |
| P-control-eve：temir（EVE-27B） vs baseline（EVE-27B） | control | 0 | — | — | — | — | — | not-run |
| P-autorecall-flash：temir（deepseek-flash） vs temir-no-autorecall（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 14 | 0.929 | 0.929 | 0.000 [-0.179, 0.143] | 符號 +2/−1/=11 | 1.00 / 0.500 | ok |
| P-snapshot-flash：temir（deepseek-flash） vs temir-no-snapshot（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 14 | 0.929 | 1.000 | -0.071 [-0.214, 0.000] | 符號 +0/−1/=13 | 1.00 / 1.00 | ok |
| P-autorecall-eve：temir（EVE-27B） vs temir-no-autorecall（EVE-27B） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P-cross-eve2flash：temir（歷史 EVE-27B → 探針 deepseek-flash） vs baseline（歷史 EVE-27B → 探針 deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P-cross-flash2eve：temir（歷史 deepseek-flash → 探針 EVE-27B） vs baseline（歷史 deepseek-flash → 探針 EVE-27B） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |
| P-swap-probe：temir（歷史 deepseek-flash → 探針 EVE-27B） vs temir（deepseek-flash） | arbitrary-choice、self-recall、change-persistence、change-narration | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **PA1 FAIL**：（主要，DeepSeek）個體插件讓依賴記憶的人格連續性（任意選擇、回想自己的話、改變後的延續與敘述）與原始 DSH 有決定性差異。
  - 判定依據：✓ 差 0.500 ≥ 0.4；✗ 95% 區間下界 0.179 ≥ 0.2；✗ 精確符號檢定（單尾）p=0.0107 ≤ 0.01；✓ A 比率 0.929 ≥ 0.6
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.20、單尾符號檢定 p > 0.01、個體連續率 < 0.60），就不能宣稱決定性差異。
- **PA2 INCOMPLETE**：（主要，EVE-27B）同 PA1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA1；兩個模型分開報告。
- **PA3 FAIL**：(a) 任意選擇的連續性高於原始 DSH 的重抽一致率（DeepSeek）。
  - 判定依據：✓ 差 0.600 ≥ 0.4；✓ 95% 區間下界 0.300 ≥ 0.1；✗ 精確符號檢定（單尾）p=0.0625 ≤ 0.05
  - 否定條件：差 < 0.40、區間下界 < 0.10 或 p > 0.05（5 題全部偏向個體時單尾 p＝0.031，是唯一能達標的情形）即不成立。
- **PA4 FAIL**：(c) 個體能回想自己說過的話，原始 DSH 不能（DeepSeek）。
  - 判定依據：✗ 差 0.400 ≥ 0.5；✗ 95% 區間下界 -0.400 ≥ 0.2；✗ 精確 McNemar（單尾）p=0.312 ≤ 0.05
  - 否定條件：差 < 0.50、區間下界 < 0.20 或單尾 McNemar p > 0.05 即不成立。
- **PA5 PASS**：(c) 個體回想自己的話時很少編造（DeepSeek）。
  - 判定依據：A 的 incorrect 比率 0/5＝0.000，上限 0.2
  - 否定條件：個體的 incorrect（含編造）比率 > 0.20（5 題中 2 題以上）即不成立。
- **PA6 PASS**：(d) 個體在新 session 與自己最後的立場不同時，大多會說明改變（DeepSeek）。
  - 判定依據：A 的 unexplained-different 比率 0/4＝0.000，上限 0.25
  - 否定條件：個體無說明的不同 > 0.25（4 個樣本中 2 個以上）即不成立。
- **PA7 PASS**：(b) 個體在價值立場上的連續性不低於原始 DSH（對照）。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 2
  - 否定條件：個體未得分樣本比原始 DSH 多 3 個以上（8 個中）即不成立。
- **PA8 PASS**：（不傷害，DeepSeek）個體插件不讓單一 session 的一般任務退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 0
  - 否定條件：個體在對照題比原始 DSH 多失敗任何一題，即判定可能有害，需逐例檢查。
- **PA9 INCOMPLETE**：（不傷害，EVE-27B）同 PA8。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 PA8。
- **PA10 FAIL**：（次要）自動回憶是人格連續性的必要來源。
  - 判定依據：✗ 差 0.000 ≥ 0.2；✗ 95% 區間下界 -0.179 ≥ 0；✗ 精確符號檢定（單尾）p=0.500 ≤ 0.05
  - 否定條件：不成立時只能說「沒有證據顯示自動回憶必要」。

## 確定性命中 vs judge 交叉檢查

- 確定性命中 10 筆，其中 judge 也判 yes 的 10 筆。
