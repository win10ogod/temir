# 評估摘要：memory-accuracy-v1

- 資料集：memory-v1（sha256 fddcdc311207fa586c6d6c296112602731badf326f4b4963de036841f9bb8beb）
- judge：deepseek-v4-pro（thinking disabled、temperature 0），本次新呼叫 197 次，估計花費 US$0.0986（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash） | temir（deepseek-flash） | temir-no-autorecall（deepseek-flash） | temir-no-snapshot（deepseek-flash） | baseline（EVE-27B） | temir（EVE-27B） | temir-no-autorecall（EVE-27B）（未執行） | temir-no-snapshot（EVE-27B）（未執行） | baseline（歷史 EVE-27B → 探針 deepseek-flash）（未執行） | temir（歷史 EVE-27B → 探針 deepseek-flash）（未執行） | baseline（歷史 deepseek-flash → 探針 EVE-27B）（未執行） | temir（歷史 deepseek-flash → 探針 EVE-27B）（未執行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| information-extraction | 3/7＝0.43 [0.10, 0.82] | 6/7＝0.86 [0.42, 1.00] | 6/7＝0.86 [0.42, 1.00] | 7/7＝1.00 [0.59, 1.00] | 1/7＝0.14 [0.00, 0.58] | 6/7＝0.86 [0.42, 1.00] | — | — | — | — | — | — |
| multi-session-reasoning | 3/4＝0.75 [0.19, 0.99] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 0/4＝0.00 [0.00, 0.60] | 4/4＝1.00 [0.40, 1.00] | — | — | — | — | — | — |
| knowledge-update | 1/5＝0.20 [0.01, 0.72] | 5/5＝1.00 [0.48, 1.00] | 5/5＝1.00 [0.48, 1.00] | 5/5＝1.00 [0.48, 1.00] | 0/5＝0.00 [0.00, 0.52] | 5/5＝1.00 [0.48, 1.00] | — | — | — | — | — | — |
| temporal-reasoning | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 1/4＝0.25 [0.01, 0.81] | 4/4＝1.00 [0.40, 1.00] | — | — | — | — | — | — |
| abstention | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | 3/4＝0.75 [0.19, 0.99] | — | — | — | — | — | — |
| preference-application | 0/3＝0.00 [0.00, 0.71] | 3/3＝1.00 [0.29, 1.00] | 2/3＝0.67 [0.09, 0.99] | 2/3＝0.67 [0.09, 0.99] | 0/3＝0.00 [0.00, 0.71] | 3/3＝1.00 [0.29, 1.00] | — | — | — | — | — | — |
| control | 6/6＝1.00 [0.54, 1.00] | 6/6＝1.00 [0.54, 1.00] | 6/6＝1.00 [0.54, 1.00] | 6/6＝1.00 [0.54, 1.00] | 6/6＝1.00 [0.54, 1.00] | 6/6＝1.00 [0.54, 1.00] | — | — | — | — | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### baseline（deepseek-flash）

- information-extraction：incorrect=4、correct=3
- multi-session-reasoning：incorrect=1、correct=3
- knowledge-update：incorrect=4、correct=1
- temporal-reasoning：correct=4
- abstention：correct=4
- preference-application：incorrect=3
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：bash=313、web_search=8、web_fetch=16、ask_user_question=2、glob=5、grep=1、write=1、present=1

### temir（deepseek-flash）

- information-extraction：incorrect=1、correct=6
- multi-session-reasoning：correct=4
- knowledge-update：correct=5
- temporal-reasoning：correct=4
- abstention：correct=4
- preference-application：correct=3
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：recall=28、web_search=10、appraise=5、web_fetch=14、bash=3、grep=1

### temir-no-autorecall（deepseek-flash）

- information-extraction：incorrect=1、correct=6
- multi-session-reasoning：correct=4
- knowledge-update：correct=5
- temporal-reasoning：correct=4
- abstention：correct=4
- preference-application：incorrect=1、correct=2
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：recall=88、appraise=7、web_search=16、web_fetch=20、schedule_create=3、ask_user_question=2、bash=14、job_output=1

### temir-no-snapshot（deepseek-flash）

- information-extraction：correct=7
- multi-session-reasoning：correct=4
- knowledge-update：correct=5
- temporal-reasoning：correct=4
- abstention：correct=4
- preference-application：incorrect=1、correct=2
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：recall=35、appraise=14、web_search=9、web_fetch=18、bash=11、write=1、read=1

### baseline（EVE-27B）

- information-extraction：incorrect=6、correct=1
- multi-session-reasoning：incorrect=4
- knowledge-update：incorrect=5
- temporal-reasoning：correct=1、incorrect=3
- abstention：correct=4
- preference-application：incorrect=3
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：ask_user_question=5、web_search=2、web_fetch=4、bash=105、job_output=6、read=14、job_kill=2、glob=6、schedule_list=2、grep=4、working_directory=1、get_goal=1

### temir（EVE-27B）

- information-extraction：correct=6、incorrect=1
- multi-session-reasoning：correct=4
- knowledge-update：correct=5
- temporal-reasoning：correct=4
- abstention：correct=3、incorrect=1
- preference-application：correct=3
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：appraise=6、web_search=6、web_fetch=7、recall=16

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-main-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 23 | 0.957 | 0.478 | 0.478 [0.261, 0.696] | McNemar b=11 c=0 | 0.000977 / 0.000488 | ok |
| M-main-eve：temir（EVE-27B） vs baseline（EVE-27B） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 23 | 0.957 | 0.087 | 0.870 [0.739, 1.000] | McNemar b=20 c=0 | 0.00000191 / 9.54e-7 | ok |
| M-information-extraction-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction | 7 | 0.857 | 0.429 | 0.429 [0.143, 0.857] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| M-multi-session-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | multi-session-reasoning | 4 | 1.000 | 0.750 | 0.250 [0.000, 0.750] | McNemar b=1 c=0 | 1.00 / 0.500 | ok |
| M-knowledge-update-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | knowledge-update | 5 | 1.000 | 0.200 | 0.800 [0.400, 1.000] | McNemar b=4 c=0 | 0.125 / 0.0625 | ok |
| M-temporal-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | temporal-reasoning | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M-preference-application-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | preference-application | 3 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| M-information-extraction-eve：temir（EVE-27B） vs baseline（EVE-27B） | information-extraction | 7 | 0.857 | 0.143 | 0.714 [0.429, 1.000] | McNemar b=5 c=0 | 0.0625 / 0.0313 | ok |
| M-multi-session-reasoning-eve：temir（EVE-27B） vs baseline（EVE-27B） | multi-session-reasoning | 4 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=4 c=0 | 0.125 / 0.0625 | ok |
| M-knowledge-update-eve：temir（EVE-27B） vs baseline（EVE-27B） | knowledge-update | 5 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=5 c=0 | 0.0625 / 0.0313 | ok |
| M-temporal-reasoning-eve：temir（EVE-27B） vs baseline（EVE-27B） | temporal-reasoning | 4 | 1.000 | 0.250 | 0.750 [0.250, 1.000] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| M-preference-application-eve：temir（EVE-27B） vs baseline（EVE-27B） | preference-application | 3 | 1.000 | 0.000 | 1.000 [1.000, 1.000] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| M-abs-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | abstention | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M-abs-eve：temir（EVE-27B） vs baseline（EVE-27B） | abstention | 4 | 0.750 | 1.000 | -0.250 [-0.750, 0.000] | McNemar b=0 c=1 | 1.00 / 1.00 | ok |
| M-ctrl-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 6 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M-ctrl-eve：temir（EVE-27B） vs baseline（EVE-27B） | control | 6 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M-autorecall-flash：temir（deepseek-flash） vs temir-no-autorecall（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 23 | 0.957 | 0.913 | 0.043 [0.000, 0.130] | McNemar b=1 c=0 | 1.00 / 0.500 | ok |
| M-snapshot-flash：temir（deepseek-flash） vs temir-no-snapshot（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 23 | 0.957 | 0.957 | 0.000 [-0.130, 0.130] | McNemar b=1 c=1 | 1.00 / 0.750 | ok |
| M-autorecall-eve：temir（EVE-27B） vs temir-no-autorecall（EVE-27B） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 0 | — | — | — | — | — | not-run |
| M-cross-eve2flash：temir（歷史 EVE-27B → 探針 deepseek-flash） vs baseline（歷史 EVE-27B → 探針 deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 0 | — | — | — | — | — | not-run |
| M-cross-flash2eve：temir（歷史 deepseek-flash → 探針 EVE-27B） vs baseline（歷史 deepseek-flash → 探針 EVE-27B） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 0 | — | — | — | — | — | not-run |
| M-swap-probe：temir（歷史 deepseek-flash → 探針 EVE-27B） vs temir（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、preference-application | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **MA1 FAIL**：（主要，DeepSeek）個體插件在跨 session 記憶題上與原始 DSH 有決定性差異。
  - 判定依據：✓ 差 0.478 ≥ 0.4；✓ 95% 區間下界 0.261 ≥ 0.25；✓ 精確 McNemar（雙尾）p=0.000977 ≤ 0.01；✓ A 比率 0.957 ≥ 0.5；✗ B 比率 0.478 ≤ 0.25
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.25、雙尾 p > 0.01、個體正確率 < 0.50 或原始 DSH > 0.25），就不能宣稱決定性差異。
- **MA2 PASS**：（主要，本機 EVE-27B）同 MA1。
  - 判定依據：✓ 差 0.870 ≥ 0.4；✓ 95% 區間下界 0.739 ≥ 0.25；✓ 精確 McNemar（雙尾）p=0.00000191 ≤ 0.01；✓ A 比率 0.957 ≥ 0.5；✓ B 比率 0.087 ≤ 0.25
  - 否定條件：同 MA1。兩個模型結果不同時，分開報告，不合併成單一結論。
- **MA3 PASS**：（不傷害，DeepSeek）個體插件不讓單一 session 的一般任務退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：個體在對照題的失敗數比原始 DSH 多 2 題以上，即判定可能有害，需逐例檢查原始回答。
- **MA4 PASS**：（不傷害，EVE-27B）同 MA3。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：同 MA3。
- **MA5 PASS**：（虛構記憶，DeepSeek）個體不會因為有記憶而更常順著錯誤前提編造答案。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：個體在拒答題的失敗數比原始 DSH 多 2 題以上（4 題中），即判定記憶造成虛構。
- **MA6 PASS**：（虛構記憶，EVE-27B）同 MA5。
  - 判定依據：A 失敗 1、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：同 MA5。
- **MA7 FAIL**：（次要）自動回憶是記憶表現的必要來源（只靠主動 recall 工具不夠）。
  - 判定依據：✗ 差 0.043 ≥ 0.2；✗ 95% 區間下界 0.000 ≥ 0.05；✗ 精確 McNemar（雙尾）p=1.00 ≤ 0.05
  - 否定條件：不成立時只能說「沒有證據顯示自動回憶必要」，不能反過來宣稱它沒有作用。

## 確定性命中 vs judge 交叉檢查

- 確定性命中 93 筆，其中 judge 也判 yes 的 92 筆。
  - 不一致：baseline|deepseek-flash|deepseek-flash|q04|r0→no
