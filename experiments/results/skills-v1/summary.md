# 評估摘要：skills-v1

- 資料集：skills-v1（sha256 bb48d2ef43278254bc8bdaa6dfbdbf3effa06e25982b8565225bbdf9cd4a691b）
- judge：deepseek-v4-pro（thinking disabled、temperature 0）；判定紀錄共 24 次 API 呼叫，估計花費 US$0.0177（依契約的尖峰價格）
- 區間：單次樣本用 Clopper–Pearson 精確 95% 區間；有重複樣本的類別用以題為群集的 bootstrap（10,000 次、固定種子）。

## 各條件 × 類別（得分樣本／總樣本、比率、95% 區間）

| 類別 | temir（deepseek-flash） | temir-no-skill（deepseek-flash） |
| --- | --- | --- |
| explain | 11/12＝0.92 [0.75, 1.00] | 12/12＝1.00 [1.00, 1.00] |
| control | 4/4＝1.00 [0.40, 1.00] | 4/4＝1.00 [0.40, 1.00] |

## 結果類型（每個 cell 的樣本結果計數）

### temir（deepseek-flash）

- explain：correct=11、incorrect=1
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：skill_propose=2、skill=19、web_search=1、recall=1、appraise=1

### temir-no-skill（deepseek-flash）

- explain：correct=12
- control：correct=4
- 工具呼叫（歷史＋探針，描述性）：skill=11、bash=1、glob=1

## 成對比較（同一題在兩個條件下）

| 比較 | 類別 | 題數 | A 比率 | B 比率 | A−B（95% bootstrap 區間） | 檢定 | p（雙尾／單尾） | 狀態 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K-explain-flash：temir（deepseek-flash） vs temir-no-skill（deepseek-flash） | explain | 6 | 0.917 | 1.000 | -0.083 [-0.250, 0.000] | 符號 +0/−1/=5 | 1.00 / 1.00 | ok |
| K-ctrl-flash：temir（deepseek-flash） vs temir-no-skill（deepseek-flash） | control | 4 | 1.000 | 1.000 | 0.000 [0.000, 0.000] | McNemar b=0 c=0 | 1.00 / 1.00 | ok |

## 預先登記的驗收線

- **KA-flash FAIL**：（deepseek-flash）個體採用的技能改變了之後同類處境中的行動：解釋新觀念時更常用對方喜歡的方式（H-S 的推翻條件不成立）。
  - 判定依據：✗ 差 -0.083 ≥ 0.25；✗ 95% 區間下界 -0.250 ≥ 0；✗ 精確符號檢定（單尾）p=1.00 ≤ 0.05
  - 否定條件：差 < 0.25、區間下界 < 0 或單尾 p > 0.05：不能宣稱技能改變了行動；若兩者幾乎相同，依 H-S 記為「技能沒有帶來超過回憶的差異」。
- **KB-flash PASS**：（deepseek-flash）一般任務不退化。
  - 判定依據：A 失敗 0、B 失敗 0，容許 A 比 B 多 1
  - 否定條件：有技能時對照題多錯超過 1 題。

## 執行協定檢查（v2）

- temir（deepseek-flash）：layout＝home
- temir-no-skill（deepseek-flash）：layout＝home

## 描述性指標（v2，事先寫定的規則，不作驗收）

| cell | 類別 | 有紀錄的樣本 | 每樣本工具呼叫（平均） | 翻閱 session 存放區 | 翻閱生命日誌 | 延遲中位數（秒） | 有翻閱時得分 | 沒翻閱時得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temir（deepseek-flash） | explain | 12 | 1.2 | 0/12 | 0/12 | 17.0 | — | 11/12 |
| temir（deepseek-flash） | control | 4 | 0.5 | 0/4 | 0/4 | 11.2 | — | 4/4 |
| temir-no-skill（deepseek-flash） | explain | 12 | 1.1 | 1/12 | 0/12 | 18.1 | 1/1 | 11/11 |
| temir-no-skill（deepseek-flash） | control | 4 | 0.0 | 0/4 | 0/4 | 9.6 | — | 4/4 |

## 紀錄與協定問題（全部已按契約計入分母）

- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h01：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h02：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h03：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h04：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h05：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h06：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h07：missing-record（沒有對應的紀錄）——之後所有探針都受影響
- temir-no-skill|deepseek-flash|deepseek-flash 的歷史 h08：missing-record（沒有對應的紀錄）——之後所有探針都受影響
