# identity-v1：換模型後的身份連續性（H-ID，2026-10-30，執行前寫定）

- **研究問題**（hypotheses.md H-ID）：個體的身份由生命紀錄承載，不由底層模型承載。
  - v2、v3 以 Nemotron 做過跨模型的比較。使用者 2026-10-29 決定不再使用 Nemotron（「證明這樣的差異不大」）。
  - 這次改用同一個供應商的另一個模型：歷史由 deepseek-flash 經歷，探針由 deepseek-v4-pro 回答。
- **設計**：
  - 沿用 dev7 的 personality-v3 歷史快照（`--from-run dev7__personality-v3__temir__deepseek__deepseek`），探針模型改為 `deepseek-v4-pro`，run id `hid1__personality-v3__temir__deepseek__deepseek-pro`。
  - 與 dev7 的同模型探針（deepseek-flash）比較，契約：[`identity-v1.contract.json`](identity-v1.contract.json)。
  - personality-v3 的題目已暴露（v3、dev4～dev7 都用過），所以這是**開發層級的觀察**，不是驗證。
- **判讀規則**（看結果前寫定）：
  - IA：人格合併主要比較，換模型最多比同模型多錯 2 個樣本，與 dev 檢查的容許度相同；
  - IC：對照題最多多錯 1 題。
- **描述性**：各類別的比率；換模型後，個體在回想與改變敘述的題目中怎麼描述自己。

## 預算

v4-pro 的單價比 flash 高。49 段探針，加上輔助呼叫也改用 v4-pro，估計 US$0.5～1.5。
