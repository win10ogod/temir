# 評估摘要：energy-followup-v2

- 資料集：followup-v2（sha256 905d88399090849ac3a07092b80678c45c91e6d66bddf2de4df4dd0b01db31bc）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 48 次 API 呼叫，估計花費 US$0.0271（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-energy（deepseek-flash） |
| --- | --- | --- |
| follow-through | 7/16＝0.44 [0.19, 0.69] | 7/16＝0.44 [0.13, 0.75] |
| restraint | 7/8＝0.88 [0.63, 1.00] | 4/8＝0.50 [0.00, 1.00] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- follow-through：correct=7、incorrect=9
- restraint：correct=7、incorrect=1
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：schedule_list=3、schedule_create=7、web_search=2、web_fetch=1、appraise=4、recall=4

### temir-no-energy（deepseek-flash）

- follow-through：correct=7、incorrect=9
- restraint：incorrect=4、correct=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=14、schedule_create=10、schedule_update=1、schedule_list=10、web_search=1、web_fetch=1、appraise=3、bash=1、glob=1、write=1、read=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-follow-flash：temir（deepseek-flash） vs temir-no-energy（deepseek-flash） | follow-through | 8 | 0.438 | 0.438 | 0.000 [-0.313, 0.375] | 符號 +2/−3/=3 | 1.00 / 0.813 | ok |
| E-restraint-flash：temir（deepseek-flash） vs temir-no-energy（deepseek-flash） | restraint | 4 | 0.875 | 0.500 | 0.375 [0.000, 0.750] | 符號 +2/−0/=2 | 0.500 / 0.250 | ok |
| E-ctrl-flash：temir（deepseek-flash） vs temir-no-energy（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **EA-flash FAIL**：（deepseek-flash）有能量（第三版）時，個體在中性開場白下更常主動追蹤還沒結束的事（H-E 的推翻條件不成立）。
  - 判定依據：✗ 差 0.000 ≥ 0.25；✗ 95% 區間下界 -0.313 ≥ 0；✗ 精確符號檢定（單尾）p=0.813 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱能量參與了追蹤承諾的行為；若兩者幾乎沒有差異，依 H-E 的推翻條件記為「沒有證據支持」。
- **EB-flash PASS**：（deepseek-flash）有能量（第三版）時，不會更常把已經結束的事當成還沒結束。
  - 判定依據：A 失敗 1、B 失敗 4，容許 A 比 B 多 1
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
| temir（deepseek-flash） | follow-through | 16 | 0.2 | 0/16 | 0/16 | 13.6 | — | 7/16 |
| temir（deepseek-flash） | restraint | 8 | 0.3 | 0/8 | 0/8 | 15.1 | — | 7/8 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 7.0 | — | 4/4 |
| temir-no-energy（deepseek-flash） | follow-through | 16 | 0.8 | 0/16 | 0/16 | 13.0 | — | 7/16 |
| temir-no-energy（deepseek-flash） | restraint | 8 | 1.6 | 0/8 | 0/8 | 16.4 | — | 4/8 |
| temir-no-energy（deepseek-flash） | control | 4 | 1.0 | 0/4 | 0/4 | 6.7 | — | 4/4 |
