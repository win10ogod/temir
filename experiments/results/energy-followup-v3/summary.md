# 評估摘要：energy-followup-v3

- 資料集：followup-v3（sha256 ea53accc55033caccf1de931ddd2839acc8acf7b2a9bc51335106983bb713ec3）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 48 次 API 呼叫，估計花費 US$0.0295（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-energy（deepseek-flash） |
| --- | --- | --- |
| follow-through | 12/16＝0.75 [0.56, 0.94] | 9/16＝0.56 [0.31, 0.81] |
| restraint | 7/8＝0.88 [0.63, 1.00] | 6/8＝0.75 [0.25, 1.00] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- follow-through：correct=12、incorrect=4
- restraint：correct=7、incorrect=1
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=18、schedule_create=8、web_search=1、web_fetch=2、schedule_list=5、appraise=1、self_revise=1、narrate=1

### temir-no-energy（deepseek-flash）

- follow-through：correct=9、incorrect=7
- restraint：correct=6、incorrect=2
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：schedule_create=6、schedule_list=4、recall=8、appraise=4

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-follow-flash：temir（deepseek-flash） vs temir-no-energy（deepseek-flash） | follow-through | 8 | 0.750 | 0.563 | 0.188 [-0.063, 0.438] | 符號 +4/−1/=3 | 0.375 / 0.188 | ok |
| E-restraint-flash：temir（deepseek-flash） vs temir-no-energy（deepseek-flash） | restraint | 4 | 0.875 | 0.750 | 0.125 [0.000, 0.375] | 符號 +1/−0/=3 | 1.00 / 0.500 | ok |
| E-ctrl-flash：temir（deepseek-flash） vs temir-no-energy（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **EA-flash FAIL**：（deepseek-flash）有能量（第三版之一）時，個體在中性開場白下更常主動追蹤還沒結束的事（H-E 的推翻條件不成立）。
  - 判定依據：✗ 差 0.188 ≥ 0.25；✗ 95% 區間下界 -0.063 ≥ 0；✗ 精確符號檢定（單尾）p=0.188 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱能量參與了追蹤承諾的行為；若兩者幾乎沒有差異，依 H-E 的推翻條件記為「沒有證據支持」。
- **EB-flash PASS**：（deepseek-flash）有能量（第三版之一）時，不會更常把已經結束的事當成還沒結束。
  - 判定依據：A 失敗 1、B 失敗 2，容許 A 比 B 多 1
  - 否定條件：有能量時多錯超過 1 個樣本。
- **EC-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有能量時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-energy（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | follow-through | 16 | 0.9 | 0/16 | 0/16 | 16.7 | — | 12/16 |
| temir（deepseek-flash） | restraint | 8 | 0.9 | 0/8 | 0/8 | 11.0 | — | 7/8 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 9.7 | — | 4/4 |
| temir-no-energy（deepseek-flash） | follow-through | 16 | 0.4 | 0/16 | 0/16 | 13.8 | — | 9/16 |
| temir-no-energy（deepseek-flash） | restraint | 8 | 0.3 | 0/8 | 0/8 | 7.9 | — | 6/8 |
| temir-no-energy（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 6.1 | — | 4/4 |
