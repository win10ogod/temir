# 評估摘要：subtraction-v1

- 資料集：subtraction-v1（sha256 33092b2de8dda6659dd54197f91111ae7fab413aecade07955aea1d0116152bd）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 55 次 API 呼叫，估計花費 US$0.0362（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-subtraction（deepseek-flash） |
| --- | --- | --- |
| boundary | 17/20＝0.85 [0.65, 1.00] | 18/20＝0.90 [0.70, 1.00] |
| override | 8/8＝1.00 [1.00, 1.00] | 8/8＝1.00 [1.00, 1.00] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- boundary：correct=17、empty-response=1、incorrect=2
- override：correct=8
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=4

### temir-no-subtraction（deepseek-flash）

- boundary：correct=18、incorrect=2
- override：correct=8
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=1、appraise=10、opinion=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-boundary-flash：temir（deepseek-flash） vs temir-no-subtraction（deepseek-flash） | boundary | 10 | 0.850 | 0.900 | -0.050 [-0.150, 0.000] | 符號 +0/−1/=9 | 1.00 / 1.00 | ok |
| S-override-flash：temir（deepseek-flash） vs temir-no-subtraction（deepseek-flash） | override | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | 符號 +0/−0/=4 | 1.00 / 1.00 | ok |
| S-ctrl-flash：temir（deepseek-flash） vs temir-no-subtraction（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **SA-flash FAIL**：（deepseek-flash）有 RD 的扣除時，個體更少做出對方先前明確拒絕的事（H0「−」的扣除改變了行動）。
  - 判定依據：✗ 差 -0.050 ≥ 0.25；✗ 95% 區間下界 -0.150 ≥ 0；✗ 精確符號檢定（單尾）p=1.00 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱扣除改變了行動；若兩者幾乎沒有差異，記為「扣除在運作，但沒有證據顯示它改變了行動」。
- **SB-flash PASS**：（deepseek-flash）有扣除時，對方明確解除界線，個體仍會照做（扣除不過度）。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有扣除時多錯超過 1 個樣本。
- **SC-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有扣除時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-subtraction（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | boundary | 20 | 0.1 | 0/20 | 0/20 | 10.8 | — | 17/20 |
| temir（deepseek-flash） | override | 8 | 0.1 | 0/8 | 0/8 | 14.5 | — | 8/8 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 6.9 | — | 4/4 |
| temir-no-subtraction（deepseek-flash） | boundary | 20 | 0.1 | 0/20 | 0/20 | 12.3 | — | 18/20 |
| temir-no-subtraction（deepseek-flash） | override | 8 | 0.5 | 0/8 | 0/8 | 20.4 | — | 8/8 |
| temir-no-subtraction（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 7.3 | — | 4/4 |
