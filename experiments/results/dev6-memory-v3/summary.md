# 評估摘要：memory-accuracy-v3

- 資料集：memory-v3（sha256 164d1c3cdde6b22a9b64f26c8803abf0ac8abc3a471b64a095cd5cf01010674b）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 69 次 API 呼叫，估計花費 US$0.0607（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash） | temir（deepseek-flash） | temir-full（deepseek-flash）（未執行） | baseline（nvidia/nemotron-3.5-super-vl）（未執行） | temir（nvidia/nemotron-3.5-super-vl）（未執行） | temir-full（nvidia/nemotron-3.5-super-vl）（未執行） |
| --- | --- | --- | --- | --- | --- | --- |
| information-extraction | 5/8＝0.63 [0.24, 0.91] | 8/8＝1.00 [0.63, 1.00] | — | — | — | — |
| multi-session-reasoning | 3/8＝0.38 [0.09, 0.76] | 6/8＝0.75 [0.35, 0.97] | — | — | — | — |
| knowledge-update | 8/8＝1.00 [0.63, 1.00] | 8/8＝1.00 [0.63, 1.00] | — | — | — | — |
| temporal-reasoning | 7/8＝0.88 [0.47, 1.00] | 8/8＝1.00 [0.63, 1.00] | — | — | — | — |
| abstention | 7/8＝0.88 [0.47, 1.00] | 8/8＝1.00 [0.63, 1.00] | — | — | — | — |
| implicit-memory-use | 9/12＝0.75 [0.43, 0.95] | 11/12＝0.92 [0.62, 1.00] | — | — | — | — |
| control | 6/6＝1.00 [0.54, 1.00] | 6/6＝1.00 [0.54, 1.00] | — | — | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### baseline（deepseek-flash）

- information-extraction：incorrect=3、correct=5
- multi-session-reasoning：correct=3、incorrect=5
- knowledge-update：correct=8
- temporal-reasoning：incorrect=1、correct=7
- abstention：correct=7、incorrect=1
- implicit-memory-use：incorrect=3、correct=9
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：bash=94、web_search=18、web_fetch=11、glob=6、write=10、edit=45、read=29、present=6、grep=26、ask_user_question=5

### temir（deepseek-flash）

- information-extraction：correct=8
- multi-session-reasoning：correct=6、incorrect=2
- knowledge-update：correct=8
- temporal-reasoning：correct=8
- abstention：correct=8
- implicit-memory-use：correct=11、incorrect=1
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：appraise=10、integrate=1、recall=19、grep=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M3-main-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 44 | 0.932 | 0.727 | 0.205 [0.091, 0.341] | McNemar b=9 c=0 | 0.00391 / 0.00195 | ok |
| M3-implicit-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | implicit-memory-use | 12 | 0.917 | 0.750 | 0.167 [0.000, 0.417] | McNemar b=2 c=0 | 0.500 / 0.250 | ok |
| M3-explicit-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning | 32 | 0.938 | 0.719 | 0.219 [0.094, 0.375] | McNemar b=7 c=0 | 0.0156 / 0.00781 | ok |
| M3-information-extraction-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction | 8 | 1.000 | 0.625 | 0.375 [0.125, 0.750] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| M3-multi-session-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | multi-session-reasoning | 8 | 0.750 | 0.375 | 0.375 [0.125, 0.750] | McNemar b=3 c=0 | 0.250 / 0.125 | ok |
| M3-knowledge-update-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | knowledge-update | 8 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M3-temporal-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | temporal-reasoning | 8 | 1.000 | 0.875 | 0.125 [0.000, 0.375] | McNemar b=1 c=0 | 1.00 / 0.500 | ok |
| M3-implicit-memory-use-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | implicit-memory-use | 12 | 0.917 | 0.750 | 0.167 [0.000, 0.417] | McNemar b=2 c=0 | 0.500 / 0.250 | ok |
| M3-abs-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | abstention | 8 | 1.000 | 0.875 | 0.125 [0.000, 0.375] | McNemar b=1 c=0 | 1.00 / 0.500 | ok |
| M3-ctrl-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 6 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| M3-d1-flash：temir（deepseek-flash） vs temir-full（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-d1-implicit-flash：temir（deepseek-flash） vs temir-full（deepseek-flash） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-d1-abs-flash：temir（deepseek-flash） vs temir-full（deepseek-flash） | abstention | 0 | — | — | — | — | — | not-run |
| M3-main-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-implicit-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-explicit-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning | 0 | — | — | — | — | — | not-run |
| M3-information-extraction-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | information-extraction | 0 | — | — | — | — | — | not-run |
| M3-multi-session-reasoning-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | multi-session-reasoning | 0 | — | — | — | — | — | not-run |
| M3-knowledge-update-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | knowledge-update | 0 | — | — | — | — | — | not-run |
| M3-temporal-reasoning-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | temporal-reasoning | 0 | — | — | — | — | — | not-run |
| M3-implicit-memory-use-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-abs-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | abstention | 0 | — | — | — | — | — | not-run |
| M3-ctrl-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs baseline（nvidia/nemotron-3.5-super-vl） | control | 0 | — | — | — | — | — | not-run |
| M3-d1-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs temir-full（nvidia/nemotron-3.5-super-vl） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-d1-implicit-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs temir-full（nvidia/nemotron-3.5-super-vl） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-d1-abs-NEMO：temir（nvidia/nemotron-3.5-super-vl） vs temir-full（nvidia/nemotron-3.5-super-vl） | abstention | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **MA1 FAIL**：（主要，與 v1、v2 相同的門檻與類別定義，deepseek-flash）個體插件在跨 session 記憶題上與原始 DSH 有決定性差異。
  - 判定依據：✗ 差 0.205 ≥ 0.4；✗ 95% 區間下界 0.091 ≥ 0.25；✓ 精確 McNemar（雙尾）p=0.00391 ≤ 0.01；✓ A 比率 0.932 ≥ 0.5；✗ B 比率 0.727 ≤ 0.25
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.25、雙尾 p > 0.01、個體 < 0.50、原始 DSH > 0.25）就不能宣稱決定性差異。
- **MB1 FAIL**：（主要，與 v2 相同的門檻，deepseek-flash）不明問記憶時，個體會運用記得的事，原始 DSH 不會。
  - 判定依據：✗ 差 0.167 ≥ 0.4；✗ 95% 區間下界 0.000 ≥ 0.2；✗ 精確 McNemar（雙尾）p=0.500 ≤ 0.01；✓ A 比率 0.917 ≥ 0.6；✗ B 比率 0.750 ≤ 0.3
  - 否定條件：任一條件不成立就不能宣稱。
- **MA2-NEMO INCOMPLETE**：（主要，與 v1、v2 相同的門檻與類別定義，nvidia/nemotron-3.5-super-vl）個體插件在跨 session 記憶題上與原始 DSH 有決定性差異。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.25、雙尾 p > 0.01、個體 < 0.50、原始 DSH > 0.25）就不能宣稱決定性差異。
- **MB2-NEMO INCOMPLETE**：（主要，與 v2 相同的門檻，nvidia/nemotron-3.5-super-vl）不明問記憶時，個體會運用記得的事，原始 DSH 不會。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：任一條件不成立就不能宣稱。
- **MC-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：個體在對照題比原始 DSH 多錯超過 1 題。
- **MD-flash PASS**：（deepseek-flash）不更常編造：拒答題。
  - 判定依據：A 失敗 0、B 失敗 1，容許 A 比 B 多 1
  - 否定條件：個體在拒答題比原始 DSH 多錯超過 1 題。
- **D1-flash INCOMPLETE**：（E-D1，deepseek-flash）按需披露（預設）在主要類別上不比全文差：最多多錯 2 題（44 題中約 0.05）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：按需披露比全文多錯超過 2 題：依規格 §7.3 把預設改回全文。
- **MC-NEMO INCOMPLETE**：（nvidia/nemotron-3.5-super-vl）一般任務不退化。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體在對照題比原始 DSH 多錯超過 1 題。
- **MD-NEMO INCOMPLETE**：（nvidia/nemotron-3.5-super-vl）不更常編造：拒答題。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體在拒答題比原始 DSH 多錯超過 1 題。
- **D1-NEMO INCOMPLETE**：（E-D1，nvidia/nemotron-3.5-super-vl）按需披露（預設）在主要類別上不比全文差：最多多錯 2 題（44 題中約 0.05）。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：按需披露比全文多錯超過 2 題：依規格 §7.3 把預設改回全文。

## 執行協定檢查（v2）

- baseline（deepseek-flash）：layout＝home
- temir（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline（deepseek-flash） | information-extraction | 8 | 1.1 | 0/8 | 0/8 | 2.7 | — | 5/8 |
| baseline（deepseek-flash） | multi-session-reasoning | 8 | 1.1 | 0/8 | 0/8 | 8.9 | — | 3/8 |
| baseline（deepseek-flash） | knowledge-update | 8 | 1.6 | 0/8 | 0/8 | 9.5 | — | 8/8 |
| baseline（deepseek-flash） | temporal-reasoning | 8 | 1.1 | 0/8 | 0/8 | 7.4 | — | 7/8 |
| baseline（deepseek-flash） | abstention | 8 | 1.9 | 0/8 | 0/8 | 8.1 | — | 7/8 |
| baseline（deepseek-flash） | implicit-memory-use | 12 | 3.7 | 0/12 | 0/12 | 38.0 | — | 9/12 |
| baseline（deepseek-flash） | control | 6 | 1.7 | 0/6 | 0/6 | 3.8 | — | 6/6 |
| temir（deepseek-flash） | information-extraction | 8 | 0.0 | 0/8 | 0/8 | 7.0 | — | 8/8 |
| temir（deepseek-flash） | multi-session-reasoning | 8 | 0.8 | 0/8 | 0/8 | 8.9 | — | 6/8 |
| temir（deepseek-flash） | knowledge-update | 8 | 0.3 | 0/8 | 0/8 | 11.5 | — | 8/8 |
| temir（deepseek-flash） | temporal-reasoning | 8 | 0.3 | 0/8 | 0/8 | 10.8 | — | 8/8 |
| temir（deepseek-flash） | abstention | 8 | 1.4 | 0/8 | 0/8 | 10.8 | — | 8/8 |
| temir（deepseek-flash） | implicit-memory-use | 12 | 0.3 | 0/12 | 0/12 | 22.0 | — | 11/12 |
| temir（deepseek-flash） | control | 6 | 0.0 | 0/6 | 0/6 | 11.3 | — | 6/6 |
