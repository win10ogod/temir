# attribution-v1 AT2 摘要（18 段新的生活）

- judge：deepseek-v4-pro（thinking disabled、temperature 0）；618 次 API 呼叫，估計 US$0.3062

## 預先登記的判定

- **AT2-L**（教訓讀對對方）：FAIL——處理減控制 -0.042，單尾置換檢定 p＝0.7504（48620 種分組）。
- **AT2-R**（對方正面的反應）：FAIL——處理減控制 0.095，單尾置換檢定 p＝0.2497（48620 種分組）。
- 處理組事後比對沒有結果的比例：0.0%（規則 ≤ 5%；全部的比對）。只算要求解讀的比對（不是暫時的、模擬使用者那幾段對話）：0.0%（描述性）。
- **決定**：AT1 FAIL、AT2-L 的差 -0.042、AT2-R 的差 0.095、沒有結果 0.0% → 維持關閉

| 對象 | 教訓的平均（控制／處理） | 正面反應的比例（控制／處理） |
|---|---|---|
| A | 0.76／0.72 | 0.31／0.66 |
| B | 0.89／0.81 | 0.96／0.92 |
| C | 0.94／0.94 | 0.94／0.92 |

## 每個個體（描述性）

| 個體 | 條件 | 比對 | 教訓 consistent／inconsistent／none／空／錯誤 | 平均 | 反應 positive／negative／neutral | 比例 | 沒有結果 | 列了解讀（教訓空著） | 閘門探測：脈絡中重跑／近似／輔助呼叫 |
|---|---|---|---|---|---|---|---|---|---|
| attr1__procedures-v1-a__temir__deepseek__deepseek | temir | 17 | 15／0／2／0／0 | 0.88 | 5／12／1 | 0.29 | 0／19 | 0（0） | 27／0／0 |
| attr1__procedures-v1-a__temir-attr__deepseek__deepseek | temir-attr | 16 | 13／1／1／1／0 | 0.75 | 12／5／1 | 0.71 | 0／17 | 10（0） | 29／0／0 |
| attr1__procedures-v1-b__temir__deepseek__deepseek | temir | 17 | 15／0／1／1／0 | 0.88 | 16／1／1 | 0.94 | 0／19 | 0（0） | 17／0／0 |
| attr1__procedures-v1-b__temir-attr__deepseek__deepseek | temir-attr | 16 | 13／0／1／2／0 | 0.81 | 14／3／1 | 0.82 | 0／17 | 9（0） | 12／0／0 |
| attr1__procedures-v1-c__temir__deepseek__deepseek | temir | 18 | 18／0／0／0／0 | 1.00 | 17／1／0 | 0.94 | 0／20 | 0（0） | 19／那一步沒有存下主 agent 的請求 2／0 |
| attr1__procedures-v1-c__temir-attr__deepseek__deepseek | temir-attr | 16 | 14／0／2／0／0 | 0.88 | 15／2／1 | 0.88 | 0／18 | 16（0） | 29／那一步沒有存下主 agent 的請求 1／0 |
| attr2__procedures-v1-a__temir__deepseek__deepseek | temir | 17 | 10／0／5／2／0 | 0.59 | 0／12／6 | 0.00 | 0／19 | 0（0） | 11／0／0 |
| attr2__procedures-v1-a__temir-attr__deepseek__deepseek | temir-attr | 15 | 10／1／3／1／0 | 0.60 | 13／5／0 | 0.72 | 0／17 | 10（0） | 65／0／0 |
| attr2__procedures-v1-b__temir__deepseek__deepseek | temir | 18 | 18／0／0／0／0 | 1.00 | 16／1／1 | 0.94 | 0／19 | 0（0） | 16／0／6 |
| attr2__procedures-v1-b__temir-attr__deepseek__deepseek | temir-attr | 18 | 14／2／2／0／0 | 0.67 | 15／1／2 | 0.94 | 0／19 | 13（0） | 21／0／0 |
| attr2__procedures-v1-c__temir__deepseek__deepseek | temir | 17 | 15／0／2／0／0 | 0.88 | 17／1／0 | 0.94 | 0／20 | 0（0） | 19／0／0 |
| attr2__procedures-v1-c__temir-attr__deepseek__deepseek | temir-attr | 14 | 14／0／0／0／0 | 1.00 | 17／1／0 | 0.94 | 0／16 | 11（0） | 21／0／2 |
| attr3__procedures-v1-a__temir__deepseek__deepseek | temir | 17 | 14／0／3／0／0 | 0.82 | 11／6／1 | 0.65 | 0／20 | 0（0） | 18／0／3 |
| attr3__procedures-v1-a__temir-attr__deepseek__deepseek | temir-attr | 17 | 14／0／2／1／0 | 0.82 | 10／8／0 | 0.56 | 0／20 | 13（0） | 14／0／0 |
| attr3__procedures-v1-b__temir__deepseek__deepseek | temir | 18 | 14／0／4／0／0 | 0.78 | 18／0／0 | 1.00 | 0／21 | 0（0） | 34／0／0 |
| attr3__procedures-v1-b__temir-attr__deepseek__deepseek | temir-attr | 16 | 15／0／1／0／0 | 0.94 | 18／0／0 | 1.00 | 0／17 | 8（0） | 5／0／0 |
| attr3__procedures-v1-c__temir__deepseek__deepseek | temir | 18 | 17／0／1／0／0 | 0.94 | 17／1／0 | 0.94 | 0／21 | 0（0） | 18／0／0 |
| attr3__procedures-v1-c__temir-attr__deepseek__deepseek | temir-attr | 17 | 16／0／1／0／0 | 0.94 | 16／1／1 | 0.94 | 0／19 | 9（0） | 24／0／0 |
