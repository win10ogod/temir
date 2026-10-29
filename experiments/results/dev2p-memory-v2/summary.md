# 評估摘要：memory-accuracy-v2

- 資料集：memory-v2（sha256 4cd7b19a79c2ee95c32661a366d0ed50b5112413a65c6681d6c345affde42ba0）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 76 次 API 呼叫，估計花費 US$0.0371（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash） | temir（deepseek-flash） | temir-no-autorecall（deepseek-flash）（未執行） | temir-no-snapshot（deepseek-flash）（未執行） | baseline（nvidia/nemotron-3.5-super-vl） | temir（nvidia/nemotron-3.5-super-vl） | baseline（EVE-27B）（未執行） | temir（EVE-27B）（未執行） | temir（歷史 deepseek-flash → 探針 EVE-27B）（未執行） | temir（歷史 deepseek-flash → 探針 nvidia/nemotron-3.5-super-vl）（未執行） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| information-extraction | 2/10＝0.20 [0.03, 0.56] | 9/10＝0.90 [0.55, 1.00] | — | — | 0/10＝0.00 [0.00, 0.31] | 10/10＝1.00 [0.69, 1.00] | — | — | — | — |
| multi-session-reasoning | 2/8＝0.25 [0.03, 0.65] | 8/8＝1.00 [0.63, 1.00] | — | — | 0/8＝0.00 [0.00, 0.37] | 8/8＝1.00 [0.63, 1.00] | — | — | — | — |
| knowledge-update | 8/8＝1.00 [0.63, 1.00] | 7/8＝0.88 [0.47, 1.00] | — | — | 0/8＝0.00 [0.00, 0.37] | 7/8＝0.88 [0.47, 1.00] | — | — | — | — |
| temporal-reasoning | 4/6＝0.67 [0.22, 0.96] | 6/6＝1.00 [0.54, 1.00] | — | — | 1/6＝0.17 [0.00, 0.64] | 6/6＝1.00 [0.54, 1.00] | — | — | — | — |
| abstention | 8/8＝1.00 [0.63, 1.00] | 8/8＝1.00 [0.63, 1.00] | — | — | 8/8＝1.00 [0.63, 1.00] | 8/8＝1.00 [0.63, 1.00] | — | — | — | — |
| implicit-memory-use | 6/15＝0.40 [0.16, 0.68] | 15/15＝1.00 [0.78, 1.00] | — | — | 2/15＝0.13 [0.02, 0.40] | 15/15＝1.00 [0.78, 1.00] | — | — | — | — |
| control | 8/8＝1.00 [0.63, 1.00] | 8/8＝1.00 [0.63, 1.00] | — | — | 8/8＝1.00 [0.63, 1.00] | 7/8＝0.88 [0.47, 1.00] | — | — | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### baseline（deepseek-flash）

- information-extraction：incorrect=8、correct=2
- multi-session-reasoning：incorrect=6、correct=2
- knowledge-update：correct=8
- temporal-reasoning：incorrect=2、correct=4
- abstention：correct=8
- implicit-memory-use：incorrect=9、correct=6
- control：correct=8
- 工具呼叫（歷史＋探針，描述性）：web_search=14、web_fetch=9、bash=205、grep=2、schedule_create=2、glob=3、write=2、read=49、edit=12

### temir（deepseek-flash）

- information-extraction：correct=9、incorrect=1
- multi-session-reasoning：correct=8
- knowledge-update：incorrect=1、correct=7
- temporal-reasoning：correct=6
- abstention：correct=8
- implicit-memory-use：correct=15
- control：correct=8
- 工具呼叫（歷史＋探針，描述性）：self_revise=1、web_search=10、bash=4、web_fetch=5、recall=13

### baseline（nvidia/nemotron-3.5-super-vl）

- information-extraction：incorrect=10
- multi-session-reasoning：incorrect=8
- knowledge-update：incorrect=8
- temporal-reasoning：incorrect=5、correct=1
- abstention：correct=8
- implicit-memory-use：incorrect=13、correct=2
- control：correct=8
- 工具呼叫（歷史＋探針，描述性）：bash=16、glob=15、web_search=11、grep=7、web_fetch=9、write=1

### temir（nvidia/nemotron-3.5-super-vl）

- information-extraction：correct=10
- multi-session-reasoning：correct=8
- knowledge-update：incorrect=1、correct=7
- temporal-reasoning：correct=6
- abstention：correct=8
- implicit-memory-use：correct=15
- control：correct=7、incorrect=1
- 工具呼叫（歷史＋探針，描述性）：無

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M2-main-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 47 | 0.957 | 0.468 | 0.489 [0.340, 0.638] | McNemar b=24 c=1 | 0.00000155 / 7.75e-7 | ok |
| M2-main-EVE：temir（EVE-27B） vs baseline（EVE-27B） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M2-main-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 47 | 0.979 | 0.064 | 0.915 [0.830, 0.979] | McNemar b=43 c=0 | 2.27e-13 / 1.14e-13 | ok |
| M2-implicit-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | implicit-memory-use | 15 | 1.000 | 0.400 | 0.600 [0.333, 0.867] | McNemar b=9 c=0 | 0.00391 / 0.00195 | ok |
| M2-implicit-EVE：temir（EVE-27B） vs baseline（EVE-27B） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M2-implicit-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | implicit-memory-use | 15 | 1.000 | 0.133 | 0.867 [0.667, 1.000] | McNemar b=13 c=0 | 0.000244 / 0.000122 | ok |
| M2-explicit-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning | 32 | 0.938 | 0.500 | 0.438 [0.250, 0.625] | McNemar b=15 c=1 | 0.000519 / 0.000259 | ok |
| M2-information-extraction-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction | 10 | 0.900 | 0.200 | 0.700 [0.400, 1.000] | McNemar b=7 c=0 | 0.0156 / 0.00781 | ok |
| M2-multi-session-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | multi-session-reasoning | 8 | 1.000 | 0.250 | 0.750 [0.375, 1.000] | McNemar b=6 c=0 | 0.0313 / 0.0156 | ok |
| M2-knowledge-update-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | knowledge-update | 8 | 0.875 | 1.000 | -0.125 [-0.375, 0.000] | McNemar b=0 c=1 | 1.00 / 1.00 | ok |
| M2-temporal-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | temporal-reasoning | 6 | 1.000 | 0.667 | 0.333 [0.000, 0.667] | McNemar b=2 c=0 | 0.500 / 0.250 | ok |
| M2-implicit-memory-use-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | implicit-memory-use | 15 | 1.000 | 0.400 | 0.600 [0.333, 0.867] | McNemar b=9 c=0 | 0.00391 / 0.00195 | ok |
| M2-abs-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | abstention | 8 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M2-abs-EVE：temir（EVE-27B） vs baseline（EVE-27B） | abstention | 0 | — | — | — | — | — | not-run |
| M2-abs-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | abstention | 8 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M2-ctrl-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 8 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M2-ctrl-EVE：temir（EVE-27B） vs baseline（EVE-27B） | control | 0 | — | — | — | — | — | not-run |
| M2-ctrl-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | control | 8 | 0.875 | 1.000 | -0.125 [-0.375, 0.000] | McNemar b=0 c=1 | 1.00 / 1.00 | ok |
| M2-autorecall-flash：temir（deepseek-flash） vs temir-no-autorecall（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M2-snapshot-flash：temir（deepseek-flash） vs temir-no-snapshot（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M2-swap-EVE：temir（歷史 deepseek-flash → 探針 EVE-27B） vs temir（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M2-swap-NEMO：temir（歷史 deepseek-flash → 探針 nvidia/nemotron-3.5-super-vl） vs temir（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **MA1 FAIL**：（主要，與 v1 MA1 相同的門檻與類別定義，DeepSeek）個體插件在跨 session 記憶題上與原始 DSH 有決定性差異。
  - 判定依據：✓ 差 0.489 ≥ 0.4；✓ 95% 區間下界 0.340 ≥ 0.25；✓ 精確 McNemar（雙尾）p=0.00000155 ≤ 0.01；✓ A 比率 0.957 ≥ 0.5；✗ B 比率 0.468 ≤ 0.25
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.25、雙尾 p > 0.01、個體 < 0.50、原始 DSH > 0.25）就不能宣稱決定性差異。
- **MA2-EVE INCOMPLETE**：（選用的第二模型 EVE-27B；與 v1 MA2 相同門檻）同 MA1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 MA1；cell 沒有執行時為 INCOMPLETE，只作補充。
- **MA2-NEMO PASS**：（主要，必要的第二模型 Nemotron；與 v1 MA2 相同門檻）同 MA1。
  - 判定依據：✓ 差 0.915 ≥ 0.4；✓ 95% 區間下界 0.830 ≥ 0.25；✓ 精確 McNemar（雙尾）p=2.27e-13 ≤ 0.01；✓ A 比率 0.979 ≥ 0.5；✓ B 比率 0.064 ≤ 0.25
  - 否定條件：同 MA1。「模型獨立」的記憶主張需要 MA1 與 MA2-NEMO 都 PASS。
- **MB1 FAIL**：（v2 新主要，DeepSeek）不明問記憶時，個體會運用記得的事，原始 DSH 不會。
  - 判定依據：✓ 差 0.600 ≥ 0.4；✓ 95% 區間下界 0.333 ≥ 0.2；✓ 精確 McNemar（雙尾）p=0.00391 ≤ 0.01；✓ A 比率 1.000 ≥ 0.6；✗ B 比率 0.400 ≤ 0.3
  - 否定條件：差 < 0.40、區間下界 < 0.20、雙尾 p > 0.01、個體 < 0.60 或原始 DSH > 0.30，任一成立即不能宣稱。
- **MB2-EVE INCOMPLETE**：（選用的第二模型 EVE-27B）同 MB1。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 MB1；cell 沒有執行時為 INCOMPLETE，只作補充。
- **MB2-NEMO PASS**：（v2 新主要，必要的第二模型 Nemotron）同 MB1。
  - 判定依據：✓ 差 0.867 ≥ 0.4；✓ 95% 區間下界 0.667 ≥ 0.2；✓ 精確 McNemar（雙尾）p=0.000244 ≤ 0.01；✓ A 比率 1.000 ≥ 0.6；✓ B 比率 0.133 ≤ 0.3
  - 否定條件：同 MB1。「模型獨立」的隱性運用主張需要 MB1 與 MB2-NEMO 都 PASS。
- **MB3 PASS**：（v2 次要，DeepSeek）在明問記憶的題目上，設計好的記憶仍優於原始 DSH 自己翻閱 session 存放區。
  - 判定依據：✓ 差 0.438 ≥ 0.2；✓ 95% 區間下界 0.250 ≥ 0.05；✓ 精確 McNemar（雙尾）p=0.000519 ≤ 0.05
  - 否定條件：不成立時只能說「明問時原始 DSH 自己翻日誌可以追上」，不影響 MA1、MB1 的判定。
- **MA3 PASS**：（不傷害，DeepSeek；與 v1 相同門檻）個體插件不讓單一 session 的一般任務退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：個體在 8 題對照中比原始 DSH 多失敗 2 題以上，即判定可能有害，逐例檢查。
- **MA4-EVE INCOMPLETE**：（不傷害，第二模型 EVE）同 MA3。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 MA3。
- **MA4-NEMO PASS**：（不傷害，第二模型 NEMO）同 MA3。
  - 判定依據：A 失敗 1、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：同 MA3。
- **MA5 PASS**：（虛構記憶，DeepSeek；與 v1 相同門檻）個體不會因為有記憶而更常順著錯誤前提編造答案。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：個體在 8 題拒答題中比原始 DSH 多失敗 2 題以上，即判定記憶造成虛構。
- **MA6-EVE INCOMPLETE**：（虛構記憶，第二模型 EVE）同 MA5。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：同 MA5。
- **MA6-NEMO PASS**：（虛構記憶，第二模型 NEMO）同 MA5。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：同 MA5。
- **MA7 INCOMPLETE**：（次要，與 v1 相同門檻）自動回憶是記憶表現的必要來源。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：不成立時只能說「沒有證據顯示自動回憶必要」（個體可能主動呼叫 recall 補上）。

## 執行協定檢查（v2）

- baseline（deepseek-flash）：layout＝home
- temir（deepseek-flash）：layout＝home
- baseline（nvidia/nemotron-3.5-super-vl）：layout＝home
- temir（nvidia/nemotron-3.5-super-vl）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline（deepseek-flash） | information-extraction | 10 | 3.1 | 1/10 | 0/10 | 6.6 | 0/1 | 2/9 |
| baseline（deepseek-flash） | multi-session-reasoning | 8 | 6.0 | 4/8 | 0/8 | 12.1 | 1/4 | 1/4 |
| baseline（deepseek-flash） | knowledge-update | 8 | 2.4 | 0/8 | 0/8 | 4.9 | — | 8/8 |
| baseline（deepseek-flash） | temporal-reasoning | 6 | 11.3 | 3/6 | 0/6 | 36.8 | 3/3 | 1/3 |
| baseline（deepseek-flash） | abstention | 8 | 2.8 | 1/8 | 0/8 | 6.3 | 1/1 | 7/7 |
| baseline（deepseek-flash） | implicit-memory-use | 15 | 1.2 | 0/15 | 0/15 | 15.5 | — | 6/15 |
| baseline（deepseek-flash） | control | 8 | 0.5 | 0/8 | 0/8 | 2.0 | — | 8/8 |
| temir（deepseek-flash） | information-extraction | 10 | 0.0 | 0/10 | 0/10 | 6.7 | — | 9/10 |
| temir（deepseek-flash） | multi-session-reasoning | 8 | 0.1 | 0/8 | 0/8 | 7.9 | — | 8/8 |
| temir（deepseek-flash） | knowledge-update | 8 | 0.0 | 0/8 | 0/8 | 6.7 | — | 7/8 |
| temir（deepseek-flash） | temporal-reasoning | 6 | 0.7 | 0/6 | 0/6 | 15.3 | — | 6/6 |
| temir（deepseek-flash） | abstention | 8 | 0.9 | 0/8 | 0/8 | 10.5 | — | 8/8 |
| temir（deepseek-flash） | implicit-memory-use | 15 | 0.8 | 0/15 | 0/15 | 28.3 | — | 15/15 |
| temir（deepseek-flash） | control | 8 | 0.0 | 0/8 | 0/8 | 6.9 | — | 8/8 |
| baseline（nvidia/nemotron-3.5-super-vl） | information-extraction | 10 | 0.4 | 0/10 | 0/10 | 1.8 | — | 0/10 |
| baseline（nvidia/nemotron-3.5-super-vl） | multi-session-reasoning | 8 | 1.8 | 0/8 | 0/8 | 3.0 | — | 0/8 |
| baseline（nvidia/nemotron-3.5-super-vl） | knowledge-update | 8 | 1.0 | 0/8 | 0/8 | 2.4 | — | 0/8 |
| baseline（nvidia/nemotron-3.5-super-vl） | temporal-reasoning | 6 | 4.2 | 0/6 | 0/6 | 3.2 | — | 1/6 |
| baseline（nvidia/nemotron-3.5-super-vl） | abstention | 8 | 0.6 | 0/8 | 0/8 | 2.6 | — | 8/8 |
| baseline（nvidia/nemotron-3.5-super-vl） | implicit-memory-use | 15 | 0.1 | 0/15 | 0/15 | 4.1 | — | 2/15 |
| baseline（nvidia/nemotron-3.5-super-vl） | control | 8 | 0.0 | 0/8 | 0/8 | 1.2 | — | 8/8 |
| temir（nvidia/nemotron-3.5-super-vl） | information-extraction | 10 | 0.0 | 0/10 | 0/10 | 28.3 | — | 10/10 |
| temir（nvidia/nemotron-3.5-super-vl） | multi-session-reasoning | 8 | 0.0 | 0/8 | 0/8 | 27.5 | — | 8/8 |
| temir（nvidia/nemotron-3.5-super-vl） | knowledge-update | 8 | 0.0 | 0/8 | 0/8 | 31.4 | — | 7/8 |
| temir（nvidia/nemotron-3.5-super-vl） | temporal-reasoning | 6 | 0.0 | 0/6 | 0/6 | 42.8 | — | 6/6 |
| temir（nvidia/nemotron-3.5-super-vl） | abstention | 8 | 0.0 | 0/8 | 0/8 | 32.4 | — | 8/8 |
| temir（nvidia/nemotron-3.5-super-vl） | implicit-memory-use | 15 | 0.0 | 0/15 | 0/15 | 31.2 | — | 15/15 |
| temir（nvidia/nemotron-3.5-super-vl） | control | 8 | 0.0 | 0/8 | 0/8 | 24.2 | — | 7/8 |
