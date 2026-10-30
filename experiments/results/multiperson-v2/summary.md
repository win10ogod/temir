# 評估摘要：multiperson-v2

- 資料集：multiperson-v2（sha256 6f4a3b578f79b945d6c2c5002e15f8745cbe4029def431213cf7d4793fda1857）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 52 次 API 呼叫，估計花費 US$0.0538（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-perperson（deepseek-flash） |
| --- | --- | --- |
| multi-person | 18/18＝1.00 [1.00, 1.00] | 17/18＝0.94 [0.83, 1.00] |
| single-person | 8/8＝1.00 [1.00, 1.00] | 8/8＝1.00 [1.00, 1.00] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- multi-person：correct=18
- single-person：correct=8
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=6、web_search=1、web_fetch=2、recall=2

### temir-no-perperson（deepseek-flash）

- multi-person：incorrect=1、correct=17
- single-person：correct=8
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=7、self_revise=1、web_search=3、web_fetch=3

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P2-multi-flash：temir（deepseek-flash） vs temir-no-perperson（deepseek-flash） | multi-person | 6 | 1.000 | 0.944 | 0.056 [0.000, 0.167] | 符號 +1/−0/=5 | 1.00 / 0.500 | ok |
| P2-single-flash：temir（deepseek-flash） vs temir-no-perperson（deepseek-flash） | single-person | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | 符號 +0/−0/=4 | 1.00 / 1.00 | ok |
| P2-ctrl-flash：temir（deepseek-flash） vs temir-no-perperson（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **P2A-flash FAIL**：（deepseek-flash）有逐人檢查（第二版）時，題目涉及多個人時，個體更常顧到每個相關的人的限制。
  - 判定依據：✗ 差 0.056 ≥ 0.25；✓ 95% 區間下界 0.000 ≥ 0；✗ 精確符號檢定（單尾）p=0.500 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱逐人檢查改善了多人的回憶。
- **P2B-flash PASS**：（deepseek-flash）只涉及一個人的題目不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有逐人檢查時多錯超過 1 個樣本。
- **P2C-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有逐人檢查時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-perperson（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | multi-person | 18 | 0.2 | 0/18 | 0/18 | 25.0 | — | 18/18 |
| temir（deepseek-flash） | single-person | 8 | 0.0 | 0/8 | 0/8 | 20.7 | — | 8/8 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 9.3 | — | 4/4 |
| temir-no-perperson（deepseek-flash） | multi-person | 18 | 0.3 | 0/18 | 0/18 | 25.6 | — | 17/18 |
| temir-no-perperson（deepseek-flash） | single-person | 8 | 0.1 | 0/8 | 0/8 | 25.0 | — | 8/8 |
| temir-no-perperson（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 9.9 | — | 4/4 |
