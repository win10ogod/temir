# 評估摘要：rd-v3

- 資料集：rd-v3（sha256 c9b68f558d21674ef05b53e972d61efb4a96146facf1af2c1e0d521187b69f10）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 32 次 API 呼叫，估計花費 US$0.0158（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-revision（deepseek-flash） | temir（Qwen3.8-Flash-Next）（未執行） | temir-no-revision（Qwen3.8-Flash-Next）（未執行） |
| --- | --- | --- | --- | --- |
| practical | 10/16＝0.63 [0.31, 0.88] | 4/16＝0.25 [0.00, 0.63] | — | — |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] | — | — |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- practical：correct=10、incorrect=6
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：recall=1

### temir-no-revision（deepseek-flash）

- practical：incorrect=12、correct=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R3-practical-flash：temir（deepseek-flash） vs temir-no-revision（deepseek-flash） | practical | 8 | 0.625 | 0.250 | 0.375 [0.125, 0.688] | 符號 +4/−0/=4 | 0.125 / 0.0625 | ok |
| R3-ctrl-flash：temir（deepseek-flash） vs temir-no-revision（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |
| R3-practical-local：temir（Qwen3.8-Flash-Next） vs temir-no-revision（Qwen3.8-Flash-Next） | practical | 0 | — | — | — | — | — | not-run |
| R3-ctrl-local：temir（Qwen3.8-Flash-Next） vs temir-no-revision（Qwen3.8-Flash-Next） | control | 0 | — | — | — | — | — | not-run |

## 預先登記的驗收線

- **R3A-flash FAIL**：（deepseek-flash）扣除本身會被經驗改變時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法。
  - 判定依據：✓ 差 0.375 ≥ 0.25；✓ 95% 區間下界 0.125 ≥ 0；✗ 精確符號檢定（單尾）p=0.0625 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 D20 讓個體從結果中改變做法。
- **R3C-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：D20 開時對照題多錯超過 1 題。
- **R3A-local INCOMPLETE**：（Qwen3.8-Flash-Next）扣除本身會被經驗改變時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 D20 讓個體從結果中改變做法。
- **R3C-local INCOMPLETE**：（Qwen3.8-Flash-Next）一般任務不退化。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：D20 開時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-revision（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | practical | 16 | 0.1 | 0/16 | 0/16 | 39.9 | — | 10/16 |
| temir（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 14.8 | — | 4/4 |
| temir-no-revision（deepseek-flash） | practical | 16 | 0.0 | 0/16 | 0/16 | 36.0 | — | 4/16 |
| temir-no-revision（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 19.2 | — | 4/4 |
