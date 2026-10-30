# 評估摘要：rd-v3

- 資料集：rd-v3（sha256 c9b68f558d21674ef05b53e972d61efb4a96146facf1af2c1e0d521187b69f10）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 32 次 API 呼叫，估計花費 US$0.0125（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash）（未執行） | temir-no-revision（deepseek-flash）（未執行） | temir（Qwen3.8-Flash-Next） | temir-no-revision（Qwen3.8-Flash-Next） |
| --- | --- | --- | --- | --- |
| practical | — | — | 4/16＝0.25 [0.00, 0.63] | 4/16＝0.25 [0.00, 0.63] |
| control | — | — | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（Qwen3.8-Flash-Next）

- practical：incorrect=12、correct=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=15

### temir-no-revision（Qwen3.8-Flash-Next）

- practical：incorrect=12、correct=4
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：appraise=15、recall=1、schedule_create=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R3-practical-flash：temir（deepseek-flash） vs temir-no-revision（deepseek-flash） | practical | 0 | — | — | — | — | — | not-run |
| R3-ctrl-flash：temir（deepseek-flash） vs temir-no-revision（deepseek-flash） | control | 0 | — | — | — | — | — | not-run |
| R3-practical-local：temir（Qwen3.8-Flash-Next） vs temir-no-revision（Qwen3.8-Flash-Next） | practical | 8 | 0.250 | 0.250 | 0.000 [0.000, 0.000] | 符號 +0/−0/=8 | 1.00 / 1.00 | ok |
| R3-ctrl-local：temir（Qwen3.8-Flash-Next） vs temir-no-revision（Qwen3.8-Flash-Next） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **R3A-flash INCOMPLETE**：（deepseek-flash）扣除本身會被經驗改變時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 D20 讓個體從結果中改變做法。
- **R3C-flash INCOMPLETE**：（deepseek-flash）一般任務不退化。
  - 判定依據：至少一個 cell 沒有執行紀錄
  - 否定條件：D20 開時對照題多錯超過 1 題。
- **R3A-local FAIL**：（Qwen3.8-Flash-Next）扣除本身會被經驗改變時，個體更能從對方的反應中學到：這個人抒發時，要直接給具體可行的方法。
  - 判定依據：✗ 差 0.000 ≥ 0.25；✓ 95% 區間下界 0.000 ≥ 0；✗ 精確符號檢定（單尾）p=1.00 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱 D20 讓個體從結果中改變做法。
- **R3C-local PASS**：（Qwen3.8-Flash-Next）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：D20 開時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（Qwen3.8-Flash-Next）：layout＝home
- temir-no-revision（Qwen3.8-Flash-Next）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（Qwen3.8-Flash-Next） | practical | 16 | 0.9 | 0/16 | 0/16 | 100.5 | — | 4/16 |
| temir（Qwen3.8-Flash-Next） | control | 4 | 0.3 | 0/4 | 0/4 | 35.2 | — | 4/4 |
| temir-no-revision（Qwen3.8-Flash-Next） | practical | 16 | 1.0 | 0/16 | 0/16 | 81.4 | — | 4/16 |
| temir-no-revision（Qwen3.8-Flash-Next） | control | 4 | 0.3 | 0/4 | 0/4 | 54.0 | — | 4/4 |

## 紀錄與協定問題（全部已按契約計入分母）

- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h01：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h02：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h03：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h04：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h05：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h06：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h07：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h08：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h09：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h01：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h02：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h03：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h04：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h05：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h06：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h07：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h08：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-revision|Qwen3.8-Flash-Next|Qwen3.8-Flash-Next 的歷史 h09：missing-record（沒有對應的紀錄）——之後所有探針都受影響
