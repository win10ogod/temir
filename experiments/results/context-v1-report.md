# context-v1：判斷放回主 agent 自己的脈絡（2026-10-31）

規格（執行前寫定）：[`context-v1.md`](../specs/context-v1.md)。**開發檢查，加上一個預先登記的比較；不是效果的驗證實驗。**

## 執行

| 項目 | 內容 |
|---|---|
| 受測程式碼 | commit b678823，在凍結的 worktree 執行（`dirty` false） |
| cell | memory-v3、personality-v3、rd-v4（一次歷史）× `temir`（輔助呼叫）、`temir-context`，都是 deepseek-flash，六格平行 |
| 時間 | 2026-10-31 01:45–03:12 UTC（與 procedures-v1 的三格重疊） |
| 錯誤 | `temir-context` 的 memory-v3 歷史 h05 第 2 句有 1 次回合錯誤（見下）；其餘五格都是 0 |
| 計分 | v3 與 rd-v4 的契約，加上選填的 temir-context cell（`experiments/specs/context-v1.*.contract.json`，判準不變）；judge deepseek-v4-pro；判定快取用 v3、dev8～dev10、dev13～dev15 的 |

## dev16 退化（`temir` 對 v3 的個體 cell；規則同 dev4～dev15）

| 比較 | v3 | dev15 | dev16（`temir`） | 多錯 | 規則 | 判讀 |
|---|---|---|---|---|---|---|
| 記憶主要類別（44 題） | 40/44 | 42/44 | 42/44 | −2 | ≤ 2 | 沒有退化 |
| 記憶拒答 | 8/8 | 8/8 | 8/8 | 0 | ≤ 1 | 沒有退化 |
| 記憶對照 | 6/6 | 6/6 | 6/6 | 0 | ≤ 1 | 沒有退化 |
| 人格合併（39 個樣本） | 39/39 | 39/39 | 38/39 | 1 | ≤ 2 | 沒有退化 |
| 人格對照 | 4/4 | 4/4 | 4/4 | 0 | ≤ 1 | 沒有退化 |

- 記憶錯的兩題：q10（dev14、dev15 也錯）、q22。
- 人格錯的一個樣本：q01 第 1 次，取名題的選擇換了但沒有說明（unexplained-different）。

## C1 不劣（`temir-context` 對同一次的 `temir`）

| 比較 | `temir` | `temir-context` | 多錯 | 規則 | 判讀 |
|---|---|---|---|---|---|
| 記憶主要類別（44 題） | 42/44 | 39/44 | 3 | ≤ 2 | **FAIL** |
| 記憶拒答 | 8/8 | 8/8 | 0 | ≤ 1 | PASS |
| 記憶對照 | 6/6 | 6/6 | 0 | ≤ 1 | PASS |
| 人格合併（39 個樣本） | 38/39 | 38/39 | 0 | ≤ 2 | PASS |
| 人格對照 | 4/4 | 4/4 | 0 | ≤ 1 | PASS |

- `temir-context` 記憶錯的五題：
  - q10、q22：`temir` 也錯；
  - q11、q51：都沒有提到對方對蝦蟹過敏（h01、h03），只顧到媽媽的糖尿病；
  - q20：答了大橋國小，但說那只是「你當時的打算」，judge 判為沒有明確給出答案。
- 這五題都不涉及發生回合錯誤的 h05。
- 人格錯的一個樣本：q19 第 1 次（self-recall）。

## C2 機制（`temir-context` 三格合計；[`context-v1/health-context.md`](context-v1/health-context.md)）

| 門檻 | 結果 | 判讀 |
|---|---|---|
| 沒有在回應之前思考的回合 ≤ 5% | 0/227 | PASS |
| 寫下決定之前已經對對方說了話 ≤ 5% | 3/227（1.3%） | PASS |
| 思考沒有結果 ≤ 5% | 0/227 | PASS |
| 事後比對沒有結果 ≤ 5% | 0/55 | PASS |
| 列出的經驗都逐筆判斷 | 沒有判斷的決定 0 | PASS |

**健康度工具沒有算到的一次失敗**：memory-v3 的歷史 h05 第 2 句（「一天要練多久比較好？」）。
- 主 agent 寫 deliberate 的參數時 JSON 不合法，DSH 以 `MALFORMED_RESPONSE` 結束了那一步，那一回合沒有回覆，也沒有 `rd/deliberation-failed` 的紀錄。
- 輔助呼叫的輸出不合格時只會重問；context 模式把思考的輸出放進工具參數，格式錯誤就變成整個回合的失敗。
- 看結果時修正（f70eec3，這次的執行沒有）：等待思考中的那一步遇到 `MALFORMED_RESPONSE` 時重試一次，記成 `rd/request-retry`。**未以真實模型驗證**：格式錯誤很少出現，沒有辦法刻意重現。

## 結論（照規格的寫法）

- **dev16 沒有退化**：記憶 42/44、人格 38/39。
- **C1 FAIL**：context 模式的記憶多錯 3 題，超過不劣的門檻；C2 PASS。
- **預設維持輔助呼叫**；context 模式留作條件（`temir-rd` 的 `mode: context`，`experiments/runner/patches/context.yml`）。
- 這次只有一次歷史。多錯的 3 題可能是歷史的變異，也可能是 context 模式的代價，這次分不出來。

## 描述性

- **rd-v4**（一次歷史，只作描述；rd-v4 報告中同一條件的三次歷史從 1/16 到 13/16）：
  - practical：`temir` 11/16，`temir-context` 2/16；
  - control：都是 4/4；
  - 見 [`context-v1-rd/summary.md`](context-v1-rd/summary.md)。
- **每回合的時間**（中位數）：

  | 資料集 | `temir` | `temir-context` |
  |---|---|---|
  | memory-v3 | 42.7 秒 | 32.5 秒 |
  | personality-v3 | 34.2 秒 | 31.6 秒 |
  | rd-v4 | 39.2 秒 | 34.3 秒 |

  context 模式少了另外的思考呼叫。
- **context 模式中的工具使用**（rd-v4 的歷史與探針）：deliberate 89 次（重寫與扣除的判斷也走這個工具），recall 16 次。
- **花費**：
  - 依紀錄的用量估計（[`context-v1/cost.md`](context-v1/cost.md)），只算歷史；探針的生命日誌沒有計入，所以不完整。
  - 兩個條件的歷史花費相近：memory-v3 $0.64 vs $0.60（離峰）。
  - batch 的餘額差 $4.18 包含同時執行的 procedures-v1。
- **ADR-0008 的判斷**（三格合計）：

  | 判斷 | `temir` | `temir-context` |
  |---|---|---|
  | 記下感受 | 48/56 | 46/52 |
  | 要重新檢視自己 | 2/57 | 0/55 |
  | 拒絕或不同意 | 5/57 | 4/55 |
