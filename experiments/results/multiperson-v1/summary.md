# 評估摘要：multiperson-v1

- 資料集：multiperson-v1（sha256 152f85b2345b435d70d2b31dff6645299ff88b2f49d1185dae3874a2d4b9e190）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 52 次 API 呼叫，估計花費 US$0.0534（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-perperson（deepseek-flash） |
| --- | --- | --- |
| multi-person | 14/18＝0.78 [0.56, 0.94] | 11/18＝0.61 [0.28, 0.89] |
| single-person | 8/8＝1.00 [1.00, 1.00] | 8/8＝1.00 [1.00, 1.00] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- multi-person：correct=14、incorrect=4
- single-person：correct=8
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=4、appraise=2

### temir-no-perperson（deepseek-flash）

- multi-person：correct=11、incorrect=7
- single-person：correct=8
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=1、recall=8、web_search=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-multi-flash：temir（deepseek-flash） vs temir-no-perperson（deepseek-flash） | multi-person | 6 | 0.778 | 0.611 | 0.167 [0.056, 0.278] | 符號 +3/−0/=3 | 0.250 / 0.125 | ok |
| P-single-flash：temir（deepseek-flash） vs temir-no-perperson（deepseek-flash） | single-person | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | 符號 +0/−0/=4 | 1.00 / 1.00 | ok |
| P-ctrl-flash：temir（deepseek-flash） vs temir-no-perperson（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **PA-flash FAIL**：（deepseek-flash）有逐人檢查時，題目涉及多個人時，個體更常顧到每個相關的人的限制。
  - 判定依據：✗ 差 0.167 ≥ 0.25；✓ 95% 區間下界 0.056 ≥ 0；✗ 精確符號檢定（單尾）p=0.125 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱逐人檢查改善了多人的回憶。
- **PB-flash PASS**：（deepseek-flash）只涉及一個人的題目不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有逐人檢查時多錯超過 1 個樣本。
- **PC-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有逐人檢查時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-perperson（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | multi-person | 18 | 0.1 | 0/18 | 0/18 | 25.2 | — | 14/18 |
| temir（deepseek-flash） | single-person | 8 | 0.1 | 0/8 | 0/8 | 19.0 | — | 8/8 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 8.2 | — | 4/4 |
| temir-no-perperson（deepseek-flash） | multi-person | 18 | 0.3 | 0/18 | 0/18 | 25.7 | — | 11/18 |
| temir-no-perperson（deepseek-flash） | single-person | 8 | 0.1 | 0/8 | 0/8 | 19.7 | — | 8/8 |
| temir-no-perperson（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 6.3 | — | 4/4 |
