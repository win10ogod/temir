# 評估摘要：rd-v1

- 資料集：rd-v1（sha256 e0027023e9042c1e86d64ecb0148549c8e8e827f1c05b296fb341bab1972de38）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 24 次 API 呼叫，估計花費 US$0.0101（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-rd（deepseek-flash） |
| --- | --- | --- |
| practical | 6/12＝0.50 [0.17, 0.83] | 7/12＝0.58 [0.25, 0.92] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- practical：incorrect=6、correct=6
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=5

### temir-no-rd（deepseek-flash）

- practical：correct=7、incorrect=5
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=4、appraise=8、self_revise=2、narrate=1、integrate=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-practical-flash：temir（deepseek-flash） vs temir-no-rd（deepseek-flash） | practical | 6 | 0.500 | 0.583 | -0.083 [-0.333, 0.167] | 符號 +1/−2/=3 | 1.00 / 0.875 | ok |
| R-ctrl-flash：temir（deepseek-flash） vs temir-no-rd（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **RA-flash FAIL**：（deepseek-flash）有 RD 時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法（E-RD）。
  - 判定依據：✗ 差 -0.083 ≥ 0.25；✗ 95% 區間下界 -0.333 ≥ 0；✗ 精確符號檢定（單尾）p=0.875 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 RD 讓個體從結果中學到了做法。
- **RC-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有 RD 時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-rd（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | practical | 12 | 0.1 | 0/12 | 0/12 | 12.7 | — | 6/12 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 7.9 | — | 4/4 |
| temir-no-rd（deepseek-flash） | practical | 12 | 0.6 | 0/12 | 0/12 | 17.2 | — | 7/12 |
| temir-no-rd（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 3.8 | — | 4/4 |
