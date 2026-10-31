# context-v2：判斷放回主 agent 的脈絡，多次歷史的再比較（2026-10-31）

規格（執行前寫定）：[`context-v2.md`](../specs/context-v2.md)。**開發檢查，加上一個預先登記的比較；不是效果的驗證實驗。**

## 執行

| 項目 | 內容 |
|---|---|
| 受測程式碼 | commit 89f1478，凍結的 worktree；追蹤的程式碼與 commit 相同（12 格的 `diffSha256` 都是空的差異） |
| `dirty` | ctx2h2 的六格 false；ctx2h3 的六格 true，原因同 procedures-v2：同一個 worktree 中先開始的 ctx2h2 已經建立了未追蹤的輸出目錄（執行器已改成不計，見 s12 log） |
| cell | memory-v3、personality-v3、rd-v4 × `temir`（輔助呼叫）、`temir-context` × 兩段新的歷史（`ctx2h2`、`ctx2h3`），12 格，deepseek-flash |
| 第一段歷史 | context-v1 的六格（`ctx1`，commit b678823） |
| 時間 | 2026-10-31 04:53–06:13 UTC（與 procedures-v2 的 9 格重疊） |
| 錯誤 | 12 格的回合錯誤都是 0；所有回合都有回覆 |
| 計分 | context-v1 的契約副本，每段歷史一個結果目錄（`context-v2-h2-*`、`context-v2-h3-*`）；judge deepseek-v4-pro |

## C1 不劣（主要；三段歷史合併：`experiments/eval/pool-ctx.ts`，[`context-v2-pooled.md`](context-v2-pooled.md)）

| 比較 | `temir` | `temir-context` | 多錯 | 規則 | 判讀 |
|---|---|---|---|---|---|
| 記憶主要類別（132 題） | 123/132 | 122/132 | 1 | ≤ 6 | PASS |
| 記憶拒答（24） | 24/24 | 23/24 | 1 | ≤ 3 | PASS |
| 記憶對照（18） | 18/18 | 18/18 | 0 | ≤ 3 | PASS |
| 人格合併（117） | 116/117 | 116/117 | 0 | ≤ 6 | PASS |
| 人格對照（12） | 12/12 | 12/12 | 0 | ≤ 3 | PASS |

每段歷史（描述性）：

| 歷史 | 記憶主要類別 | 記憶拒答 | 人格合併 | rd-v4 practical |
|---|---|---|---|---|
| ctx1（context-v1） | 42 vs 39 | 8 vs 8 | 38 vs 38 | 11 vs 2 |
| ctx2h2 | 40 vs 43 | 8 vs 8 | 39 vs 39 | 3 vs 8 |
| ctx2h3 | 41 vs 40 | 8 vs 7 | 39 vs 39 | 5 vs 6 |

（`temir` vs `temir-context`）context-v1 的差距在另外兩段歷史中沒有重現，方向也不一致：多半是歷史之間的變異。

## C2 機制（`temir-context` 的六個新格合計，`experiments/eval/rd-health.ts`）

| 門檻 | 結果 | 判讀 |
|---|---|---|
| 沒有在回應之前思考 ≤ 5% | 0/456 | PASS |
| 寫下決定之前已經對對方說了話 ≤ 5% | 4/456（0.9%） | PASS |
| 思考沒有結果 ≤ 5% | 0/456 | PASS |
| 事後比對沒有結果 ≤ 5% | 0/118 | PASS |
| 列出的經驗都逐筆判斷 | 沒有判斷的決定 0 | PASS |

- 整個回合沒有回覆的回合：0（12 格都是）。`rd/request-retry`：0。
- **MALFORMED_RESPONSE 的重試仍然沒有被真實模型觸發過**：這次的 456 個決定中沒有發生格式錯誤（context-v1 是 227 個中 1 次）。重試的路徑只有單元測試。

## R 依結果調整行為（護欄；三段歷史合併）

| 比較 | `temir` | `temir-context` | 多錯 | 規則 | 判讀 |
|---|---|---|---|---|---|
| rd-v4 practical（48） | 19/48 | 16/48 | 3 | ≤ 12 | PASS |
| rd-v4 對照（12） | 12/12 | 12/12 | 0 | ≤ 3 | PASS |

## dev17 退化（兩段新歷史的 `temir` 格，各自對 v3 的個體 cell）

| 比較 | v3 | ctx2h2 | ctx2h3 | 規則 | 判讀 |
|---|---|---|---|---|---|
| 記憶主要類別（44） | 40/44 | 40/44 | 41/44 | 多錯 ≤ 2 | 沒有退化 |
| 記憶拒答／對照 | 8/8、6/6 | 8/8、6/6 | 8/8、6/6 | 多錯 ≤ 1 | 沒有退化 |
| 人格合併（39） | 39/39 | 39/39 | 39/39 | 多錯 ≤ 2 | 沒有退化 |
| 人格對照 | 4/4 | 4/4 | 4/4 | 多錯 ≤ 1 | 沒有退化 |

## 結論（照規格的寫法）

- **C1、C2、R 都 PASS：context 模式改為預設**（`temir-rd` 的 `mode` 預設改為 context；`experiments/runner/patches/aux.yml` 是原本的輔助呼叫，條件名 `temir-aux`）。
  理由是規格寫的：理論與參考插件的方向（判斷在個體自己的脈絡中做），而且三段歷史中沒有看到代價。**這不是「context 模式比較好」的證據。**
- 改預設之後的冒煙測試（e2e-44，DeepSeek，不加 patch 的 headless）：寫下的決定是 `mode: context`，`repliedBefore` false。
- dev17 沒有退化。

## 描述性

- **每回合的時間**（中位數，兩段新歷史）：

  | 資料集 | `temir` | `temir-context` |
  |---|---|---|
  | memory-v3 | 31.2 秒 | 35.1 秒 |
  | personality-v3 | 34.9 秒 | 27.6 秒 |
  | rd-v4 | 35.1 秒 | 28.2 秒 |

- **context 模式中的工具使用**（兩段新歷史合計）：deliberate 805 次（重寫與扣除的判斷也走這個工具），recall 183 次；`temir` 是 recall 56 次。
- **記憶答錯的題**（context 模式）：ctx2h2 跨 session 推理 1 題；ctx2h3 跨 session 推理 2、知識更新 1、拒答 1、隱性運用 1。
  `temir` 在兩段歷史中也各錯了 4 題與 3 題（跨 session 推理與隱性運用）。
- **ADR-0008 的判斷**（`temir-context` 六格）：記下感受 90/117、要重新檢視自己 1/118、拒絕或不同意 9/118。
- **花費**：這次工作階段的 21 格（與 procedures-v2 重疊）、judge 與 e2e-44 合計，DeepSeek 餘額 $37.54 → $28.95（$8.59，尖峰時段）。

## 限制

- 三段歷史仍然不多（rd-v4 報告：同一條件的三次歷史從 1/16 到 13/16）；題目都已經暴露。
- **context 模式中，做法的閘門仍以輔助呼叫重跑思考**（近似）：探測的處境是照輔助呼叫格式記下的輸入，真實的思考是在主 agent 的脈絡中做的。
  context 模式的紀錄沒有記系統提示的雜湊，所以不會被當成現行做法的雜訊樣本（兩個輸出都是閘門重跑的），不會混用兩種模式的輸出。
  現在 context 是預設，這個近似適用於預設的個體（ADR-0009）。
