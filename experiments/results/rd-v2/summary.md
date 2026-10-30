# 評估摘要：rd-v2

- 資料集：rd-v2（sha256 962194a520c728f61d127122e6bda469477eb21cd37fe729cf9cd83f4c3e10cc）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 33 次 API 呼叫，估計花費 US$0.0170（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-rd（deepseek-flash） |
| --- | --- | --- |
| practical | 4/16＝0.25 [0.06, 0.50] | 4/16＝0.25 [0.00, 0.63] |
| control | 3/4＝0.75 [0.19, 0.99] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- practical：correct=4、incorrect=12
- control：correct=3、incorrect=1
- 工具呼叫（歷史＋探針，描述性）：appraise=7

### temir-no-rd（deepseek-flash）

- practical：incorrect=12、correct=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=5、self_revise=1、appraise=17

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R2-practical-flash：temir（deepseek-flash） vs temir-no-rd（deepseek-flash） | practical | 8 | 0.250 | 0.250 | 0.000 [-0.313, 0.250] | 符號 +2/−1/=5 | 1.00 / 0.500 | ok |
| R2-ctrl-flash：temir（deepseek-flash） vs temir-no-rd（deepseek-flash） | control | 4 | 0.750 | 1.000 | -0.250 [-0.750, 0.000] | McNemar b=0 c=1 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **R2A-flash FAIL**：（deepseek-flash）有 RD 時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法（E-RD）。
  - 判定依據：✗ 差 0.000 ≥ 0.25；✗ 95% 區間下界 -0.313 ≥ 0；✗ 精確符號檢定（單尾）p=0.500 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 RD 讓個體從結果中學到了做法。
- **R2B-flash PASS**：（deepseek-flash）修正後的 RD 不再壓低個體依對方反應的調整：有 RD 時，practical 最多比沒有 RD 多錯 2 個樣本（共 16）。
  - 判定依據：A 失敗 12、B 失敗 12，容許 A 比 B 多 2
  - 否定條件：有 RD 時 practical 多錯超過 2 個樣本：修正後的 RD 仍然壓低調整（rd-v1 的情形）。
- **R2C-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 1、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有 RD 時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-rd（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | practical | 16 | 0.2 | 0/16 | 0/16 | 15.3 | — | 4/16 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 8.6 | — | 3/4 |
| temir-no-rd（deepseek-flash） | practical | 16 | 0.4 | 0/16 | 0/16 | 8.5 | — | 4/16 |
| temir-no-rd（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 3.5 | — | 4/4 |
