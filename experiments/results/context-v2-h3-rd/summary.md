# 評估摘要：rd-v4+context-v1

- 資料集：rd-v4（sha256 20f15a427f2a1f5b09d918f187ea096d3ae200ea534256cf90cdf88ceedd531b）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 32 次 API 呼叫，估計花費 US$0.0119（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-revision（deepseek-flash）（未執行） | temir-context（deepseek-flash） |
| --- | --- | --- | --- |
| practical | 5/16＝0.31 [0.06, 0.56] | — | 6/16＝0.38 [0.19, 0.63] |
| control | 4/4＝1.00 [0.40, 1.00] | — | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- practical：incorrect=11、correct=5
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=2、appraise=4

### temir-context（deepseek-flash）

- practical：correct=6、incorrect=10
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=15、deliberate=87

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R4-practical-flash：temir（deepseek-flash） vs temir-no-revision（deepseek-flash） | practical | 0 | — | — | — | — | — | not-run |
| R4-ctrl-flash：temir（deepseek-flash） vs temir-no-revision（deepseek-flash） | control | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **R4A-flash INCOMPLETE**：（deepseek-flash）扣除本身會被經驗改變時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 D20 讓個體從結果中改變做法。
- **R4C-flash INCOMPLETE**：（deepseek-flash）一般任務不退化。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：D20 開時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-context（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | practical | 16 | 0.1 | 0/16 | 0/16 | 40.2 | — | 5/16 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 18.1 | — | 4/4 |
| temir-context（deepseek-flash） | practical | 16 | 2.4 | 0/16 | 0/16 | 32.2 | — | 6/16 |
| temir-context（deepseek-flash） | control | 4 | 1.5 | 0/4 | 0/4 | 15.4 | — | 4/4 |
