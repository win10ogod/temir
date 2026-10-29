# 公開前的歷史改寫（2026-10-29）

第一次推送到公開 repo 之前，依使用者的決定改寫了全部 17 個 commit：

1. 早期兩份研究文件（`research/decisions/plan-v1-2026-10-28.md`、`research/log/2026-10-28-s01.md`）各有個人細節（API 帳戶餘額、本機模型的檔名），共三行，改成不含這些細節的敘述。
2. 移除只在本機保存的 `references/LOCK.md`、`papers/INDEX.md`。commit 71b2b71 起，`.gitignore` 已排除這兩個目錄。
3. 作者與提交者改為 GitHub 的 noreply 位址。

commit 訊息、作者時間與提交時間不變。最後一個 commit 的檔案樹與改寫前完全相同（`b0a11618`）。改寫在另一份 clone 中進行，以下各項逐一驗證過：

- 每個 commit 與改寫前的差異只有上述檔案；
- 新歷史中沒有上述個人細節；
- 沒有 `references/`、`papers/` 路徑；
- 沒有任何 API 金鑰值。

已提交的實驗紀錄（`experiments/runs/*/config.json` 的 `commit` 欄位）、預先登記的規格和協定修正文件都不修改，裡面引用的是改寫前的雜湊值，請用下表對照。報告、WORKLIST 與 session log 中的引用已改為新的雜湊值。

| # | 改寫前 | 改寫後 | 檔案樹與改寫前的差異 |
|---|---|---|---|
| 1 | 6cbf674 | 245eaa2 | 個人細節三行；移除 LOCK.md、INDEX.md |
| 2 | 4a4f747 | 6f70c7c | 同上 |
| 3 | 8202c4a | 415184a | 同上 |
| 4 | a696f41 | 4b1c7c9 | 同上 |
| 5 | 2140bf9 | 25db718 | 同上 |
| 6 | 284702d | 2599b0c | 移除 LOCK.md、INDEX.md |
| 7 | 74a036e | 087fb8d | 同上（v1 凍結的個體程式碼） |
| 8 | 49befa2 | 341f267 | 同上（v1 預先登記） |
| 9 | 0467b53 | bb1065e | 同上（v1 執行時的工作樹） |
| 10 | 290414e | e7cf136 | 同上 |
| 11 | 79417dc | 7f50512 | 同上 |
| 12 | 3c6d638 | 71b2b71 | 無 |
| 13 | 9512de4 | d183a39 | 無（v2 預先登記） |
| 14 | 6afed29 | 81722fc | 無 |
| 15 | 7f4cbaf | b1a5bf9 | 無 |
| 16 | d096e57 | dd41f64 | 無（v2 協定修正 1；Nemotron 付費端點 cell 執行時的工作樹） |
| 17 | 4f0ecf9 | cae93d7 | 無 |

所有改寫都不涉及程式碼、資料集、評估器或實驗紀錄。各 cell 的 `config.json` 都記錄了 `commit`、`dirty`（`git status --porcelain` 非空）與 `diffSha256`（`git diff HEAD` 的 SHA-256），對照結果如下：

- 計分的 cell：
  - 記錄 `dirty: false` 的 20 個 cell，`git diff HEAD` 為空（`e3b0c442…`＝空字串的雜湊）。
  - v1 的三個本機模型 cell 記錄 `dirty: true`，但 `git diff HEAD` 同樣為空，差別只在未追蹤的檔案。當時是哪些檔案沒有記錄，最可能是同批次其他 cell 剛建立的紀錄目錄；各 cell 載入的 patch 路徑記在 `patches` 欄位。

  所以這些 cell 執行時追蹤中的程式碼與表中對應的新 commit 相同：v1 是 bb1065e，v2 DeepSeek 是 d183a39，v2 Nemotron 付費端點是 dd41f64。
- 中止的 v1 cell（`aborted__v1__…`）：情形與 v1 本機模型 cell 相同（`dirty: true`、diff 為空）。
- 存檔不計分的兩個 v2 免費端點 cell（`archived__v2-free__…`）：執行時有未提交的追蹤檔案變更（`diffSha256` `c2fe76f8…`），變更內容沒有保存。
