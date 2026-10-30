# ADR-0007：記憶分區——短期記憶與長期記憶

- 日期：2026-10-30
- 狀態：已實作；單元測試；e2e-36（DeepSeek）驗證；dev8 沒有退化（記憶 43/44、人格 39/39）。
- 觸發：使用者 2026-10-30：「長短期記憶有分區嗎？我原本沒提是因為這是最基本的記憶管理方法」。

## 依據

- **MemGPT**（papers/2310.08560，`tex/sections/method_rewrite.tex`）：
  - **main context**：模型的上下文，包括 system instructions、working context 與 FIFO queue。
    - working context 是固定大小的區塊，放關於使用者與自己的重要事實。
    - FIFO queue 是滾動的訊息歷史，第一則是被擠出訊息的遞迴摘要。
  - **external context**：上下文之外的資料，要明確搬進上下文才看得到。
    - recall storage 保存全部訊息；
    - archival storage 是可讀寫的資料庫。
  - 〈Queue Manager〉：上下文溢出時，擠出一部分訊息並更新遞迴摘要。被擠出的訊息「are no longer in-context …, however they are stored indefinitely in recall storage and readable」。
- **MemoryOS**（papers/2506.06326，`tex/latex/acl_latex.tex`）：
  - 三層：STM（即時的對話頁）、MTM（同一主題的分段）、LPM（使用者與自己的長期人格記憶）。
  - 〈Memory Storage Module〉：STM 的單位是 dialogue page = {Q, R, T}。
  - 〈Memory Update Module〉：STM 是固定長度的佇列，先進先出移到 MTM；MTM 以 heat 決定移到 LPM 或淘汰。
  - 〈Memory Retrieval Module〉：STM 的對話頁全部帶入。
  - 〈Experimental Settings〉：STM 長度 7；User KB 與 Agent Traits 上限各 100 條。

## 決定前的狀態

| 層 | 本專案原本的對應 | 缺口 |
|---|---|---|
| main context：FIFO queue | DSH 的這段對話；`dsh-compaction-basic` 在用到上下文的 80% 時，把前段換成摘要，保留最後 16% 的原文 | 被壓掉的部分回不來：自動回憶排除整段目前的 session |
| main context：working context | 每一步的自我快照（自我模型、敘事、目標、懸念、技能、現在）；新 session 開頭的「關於對方的長期事實」 | 開頭帶入的長期事實也會被壓縮成摘要 |
| STM（跨 session） | 新 session 開頭的「最近一次對話」：只有第一句與最後的回覆 | 上一段對話的中間沒有詞彙線索時，帶不進來 |
| recall storage／MTM | 生命日誌全部的經歷（只增不改），以詞彙＋線索詞檢索 | 沒有主題分段（需要嵌入向量，兩個 API 都沒有） |
| archival／LPM | 長期事實（擷取時標「長期」）、教訓、自我模型、人生敘事、價值與看法、目標、技能；整合期整理、標記過時 | 沒有 heat 式的升級或淘汰 |
| RD 的工作記憶 | 只有對方剛說的那一句 | 已由 ADR-0002 D18 修正 |

## 決定

1. **短期記憶：最近的對話頁**（`recall/retrieve.ts` 的 `recentPages`，`STM_PAGES = 7`，依 MemoryOS 的設定）。
   - 新 session 的第一句，帶入這段對話之前最近的 7 個回合，取代「最近一次對話」。
   - 每個回合是對方的一句話，加上我那一回合最後說出口的回覆；依時間先後排列，跨越 session 的邊界，換了一段對話就標明。
   - 相關片段不再重複列出這些回合。
   - session 之內，這段對話本身就在 DSH 的上下文中，不另外帶入。
2. **溢出時的交接**（MemGPT 的 recall storage）：
   - DSH 壓縮留下的 `compaction/summary` 事件中，`shadowedSeqs` 是被摘要取代的事件（`shadowedIds`）。
   - 這些事件雖然屬於目前的 session，照常可以被自動回憶檢索。
   - 還在上下文中的部分仍然排除，避免重複。
3. **工作記憶在壓縮之後重新帶入**（MemGPT 的 working context 不受 FIFO 擠出）：
   - 關於對方的長期事實在新 session 開頭帶入；
   - 這個 session 被壓縮之後，下一句再帶入一次（`workingSetDue`）。
   - 自我快照本來就每一步帶入，不受影響。
4. **不變的**：
   - 生命日誌只增不改，所有經歷一發生就寫入，與 MemGPT 的 queue manager 相同；長期記憶的整理仍由擷取與整合期負責。
5. **沒有做的**：
   - **遺忘與衰退**：MemoryOS 的 heat 淘汰、Generative Agents 的 recency 衰減。生命日誌不刪除（CLAUDE.md 規則 6）；在檢索層衰減會影響舊事實的回憶，要先有預先登記的實驗。
   - **MTM 的主題分段**：MemoryOS 的分段以嵌入向量的餘弦相似度加關鍵詞 Jaccard 計算，目前沒有嵌入向量的端點。

## 驗證

- **單元測試**（`individual/test/recall.test.ts`、`store.test.ts`）：
  - 最近的對話頁：順序、上限、跨 session、只取說出口的回覆、略過 DSH 注入的內容；
  - 被壓掉的部分可以檢索，還在上下文中的不行；不與短期記憶重複；
  - 工作記憶在第一句與每次壓縮之後各帶入一次。
- **e2e-36**（DeepSeek；壓縮的門檻只在這次測試中調為上下文的 2%，保留 3,000 token）：
  - **A／B 短期記憶**：上一段對話有 4 個回合。新的一段問「剛剛最後那段對話裡，我提到的第二件事是什麼？」，沒有可檢索的詞彙線索。
    - 回憶帶入了 4 個回合；
    - 個體答出「先說早上烤壞了一爐吐司…接著說下午有客人訂了二十個生日蛋糕」。
  - **C 壓縮**：第一句說「我姪女叫小葵，她的生日是三月十四日」，之後貼了 6 份長筆記。
    - 壓縮 5 次；之後每一句都重新帶入關於對方的長期事實；
    - 最後問「我姪女的生日是哪一天？」時，回憶檢索到已被壓掉的第一句，個體答「三月十四日」。

## 限制

- 7 個回合的長度沿用 MemoryOS 在 LoCoMo／GVD 上的設定，沒有在本專案調過。
- 壓縮在實際使用中要到上下文的 80% 才發生（DeepSeek flash 約 80 萬 token）。e2e-36 調低了門檻，只驗證機制。
