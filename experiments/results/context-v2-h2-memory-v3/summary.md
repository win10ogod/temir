# 評估摘要：memory-accuracy-v3+context-v1

- 資料集：memory-v3（sha256 164d1c3cdde6b22a9b64f26c8803abf0ac8abc3a471b64a095cd5cf01010674b）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 68 次 API 呼叫，估計花費 US$0.0551（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | baseline（deepseek-flash）（未執行） | temir（deepseek-flash） | temir-full（deepseek-flash）（未執行） | baseline（nvidia/nemotron-3.5-super-vl）（未執行） | temir（nvidia/nemotron-3.5-super-vl）（未執行） | temir-full（nvidia/nemotron-3.5-super-vl）（未執行） | temir-context（deepseek-flash） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| information-extraction | — | 8/8＝1.00 [0.63, 1.00] | — | — | — | — | 8/8＝1.00 [0.63, 1.00] |
| multi-session-reasoning | — | 6/8＝0.75 [0.35, 0.97] | — | — | — | — | 7/8＝0.88 [0.47, 1.00] |
| knowledge-update | — | 8/8＝1.00 [0.63, 1.00] | — | — | — | — | 8/8＝1.00 [0.63, 1.00] |
| temporal-reasoning | — | 8/8＝1.00 [0.63, 1.00] | — | — | — | — | 8/8＝1.00 [0.63, 1.00] |
| abstention | — | 8/8＝1.00 [0.63, 1.00] | — | — | — | — | 8/8＝1.00 [0.63, 1.00] |
| implicit-memory-use | — | 10/12＝0.83 [0.52, 0.98] | — | — | — | — | 12/12＝1.00 [0.74, 1.00] |
| control | — | 6/6＝1.00 [0.54, 1.00] | — | — | — | — | 6/6＝1.00 [0.54, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- information-extraction：correct=8
- multi-session-reasoning：correct=6、incorrect=2
- knowledge-update：correct=8
- temporal-reasoning：correct=8
- abstention：correct=8
- implicit-memory-use：correct=10、incorrect=2
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：web_search=4、web_fetch=1、appraise=3、recall=21、bash=2

### temir-context（deepseek-flash）

- information-extraction：correct=8
- multi-session-reasoning：correct=7、incorrect=1
- knowledge-update：correct=8
- temporal-reasoning：correct=8
- abstention：correct=8
- implicit-memory-use：correct=12
- control：correct=6
- 工具呼叫（歷史＋探針，描述性）：deliberate=183、web_search=11、web_fetch=5、recall=61、appraise=1、bash=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M3-main-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning、implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-implicit-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-explicit-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction、multi-session-reasoning、knowledge-update、temporal-reasoning | 0 | — | — | — | — | — | not-run |
| M3-information-extraction-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | information-extraction | 0 | — | — | — | — | — | not-run |
| M3-multi-session-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | multi-session-reasoning | 0 | — | — | — | — | — | not-run |
| M3-knowledge-update-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | knowledge-update | 0 | — | — | — | — | — | not-run |
| M3-temporal-reasoning-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | temporal-reasoning | 0 | — | — | — | — | — | not-run |
| M3-implicit-memory-use-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | implicit-memory-use | 0 | — | — | — | — | — | not-run |
| M3-abs-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | abstention | 0 | — | — | — | — | — | not-run |
| M3-ctrl-flash：temir（deepseek-flash） vs baseline（deepseek-flash） | control | 0 | — | — | — | — | — | not-run |
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

- **MA1 INCOMPLETE**：（主要，與 v1、v2 相同的門檻與類別定義，deepseek-flash）個體插件在跨 session 記憶題上與原始 DSH 有決定性差異。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.25、雙尾 p > 0.01、個體 < 0.50、原始 DSH > 0.25）就不能宣稱決定性差異。
- **MB1 INCOMPLETE**：（主要，與 v2 相同的門檻，deepseek-flash）不明問記憶時，個體會運用記得的事，原始 DSH 不會。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：任一條件不成立就不能宣稱。
- **MA2-NEMO INCOMPLETE**：（主要，與 v1、v2 相同的門檻與類別定義，nvidia/nemotron-3.5-super-vl）個體插件在跨 session 記憶題上與原始 DSH 有決定性差異。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：任一條件不成立（差 < 0.40、區間下界 < 0.25、雙尾 p > 0.01、個體 < 0.50、原始 DSH > 0.25）就不能宣稱決定性差異。
- **MB2-NEMO INCOMPLETE**：（主要，與 v2 相同的門檻，nvidia/nemotron-3.5-super-vl）不明問記憶時，個體會運用記得的事，原始 DSH 不會。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：任一條件不成立就不能宣稱。
- **MC-flash INCOMPLETE**：（deepseek-flash）一般任務不退化。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：個體在對照題比原始 DSH 多錯超過 1 題。
- **MD-flash INCOMPLETE**：（deepseek-flash）不更常編造：拒答題。
  - 判定依據：至少一個 cell 沒有執行紀錄
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

- temir（deepseek-flash）：layout＝home
- temir-context（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | information-extraction | 8 | 0.0 | 0/8 | 0/8 | 10.9 | — | 8/8 |
| temir（deepseek-flash） | multi-session-reasoning | 8 | 0.4 | 0/8 | 0/8 | 20.7 | — | 6/8 |
| temir（deepseek-flash） | knowledge-update | 8 | 0.0 | 0/8 | 0/8 | 24.9 | — | 8/8 |
| temir（deepseek-flash） | temporal-reasoning | 8 | 1.0 | 0/8 | 0/8 | 22.1 | — | 8/8 |
| temir（deepseek-flash） | abstention | 8 | 1.8 | 0/8 | 0/8 | 20.6 | — | 8/8 |
| temir（deepseek-flash） | implicit-memory-use | 12 | 0.0 | 0/12 | 0/12 | 43.0 | — | 10/12 |
| temir（deepseek-flash） | control | 6 | 0.0 | 0/6 | 0/6 | 26.8 | — | 6/6 |
| temir-context（deepseek-flash） | information-extraction | 8 | 1.3 | 0/8 | 0/8 | 12.8 | — | 8/8 |
| temir-context（deepseek-flash） | multi-session-reasoning | 8 | 3.4 | 0/8 | 0/8 | 28.6 | — | 7/8 |
| temir-context（deepseek-flash） | knowledge-update | 8 | 2.1 | 0/8 | 0/8 | 20.0 | — | 8/8 |
| temir-context（deepseek-flash） | temporal-reasoning | 8 | 2.8 | 0/8 | 0/8 | 25.1 | — | 8/8 |
| temir-context（deepseek-flash） | abstention | 8 | 3.4 | 0/8 | 0/8 | 21.3 | — | 8/8 |
| temir-context（deepseek-flash） | implicit-memory-use | 12 | 3.5 | 0/12 | 0/12 | 62.4 | — | 12/12 |
| temir-context（deepseek-flash） | control | 6 | 3.7 | 0/6 | 0/6 | 33.3 | — | 6/6 |
