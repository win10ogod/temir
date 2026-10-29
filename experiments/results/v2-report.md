# 實驗報告 v2：記憶準確率與人格一致性（2026-10-28）

預先登記：[`memory-accuracy-v2.md`](../specs/memory-accuracy-v2.md)、[`personality-consistency-v2.md`](../specs/personality-consistency-v2.md)（commit d183a39，任何 v2 受試執行之前）。
協定修正：[`v2-amendment-1.md`](../specs/v2-amendment-1.md)（commit dd41f64，任何 Nemotron 結果計分之前）——Nemotron 改用 OpenRouter 付費端點並固定 bf16 供應商；計分使用修正版契約（`*.amend1.contract.json`，與原始預先登記只差 Nemotron 的模型字串）。
公開前改寫過歷史：規格與 `runs/*/config.json` 引用的是改寫前的 commit 雜湊值，對照表見 [`history-rewrite-2026-10-29.md`](../../research/decisions/history-rewrite-2026-10-29.md)。
受試系統：個體插件程式碼與 v1 相同；執行器 `--layout home --assistant-text all`。評估器輸出：[`memory-v2/`](memory-v2)、[`personality-v2/`](personality-v2)。

條件：`baseline`＝原始 DeepSeek Harness 0.2.2-alpha.2（sdk profile，不載入個體插件，同樣的工具與權限）；`temir`＝DSH＋個體插件；兩個消融（DeepSeek）。
模型：DeepSeek `deepseek-flash`；NVIDIA `nvidia/nemotron-3.5-super-vl`（OpenRouter 付費端點，774 次模型請求全部由 Crusoe 以 bf16 服務，`runs/batch-v2-nemotron-bf16-providers.json`）。
每個 cell 的歷史只跑一次；每題（每次重複）都從同一個「歷史結束」快照還原後，在新的 session 中提問。12 個必要 cell 的回合錯誤都是 0。

## 1. 預先登記驗收線的判定

| id | 內容 | 判定 | 依據 |
|---|---|---|---|
| **PA1** | 人格，主要，DeepSeek（32 題） | **PASS** | 個體 0.953、原始 0.313，差 0.641（95% 區間 0.469–0.797），單尾 p＝1.5×10⁻⁶ |
| **PA2-NEMO** | 人格，主要，Nemotron | **PASS** | 個體 0.844、原始 0.203，差 0.641（區間下界 0.469），單尾 p＝2.9×10⁻⁶ |
| PA3／PA4 | 任意選擇／回想自己的話（DeepSeek） | PASS／PASS | 24/24 vs 10/24；12/12 vs 1/12 |
| PA5／PA6 | 回想不編造／改變有說明（DeepSeek） | PASS／PASS | 編造 0/12；無說明的不同 1/8 |
| PA7 | 價值立場（對照） | PASS | 10/12 vs 12/12（容許差 2） |
| PA8／PA9-NEMO | 不傷害 | PASS／PASS | 對照題全部正確 |
| PA10 | 自動回憶的必要性（人格） | FAIL | 差 0.172（0.031–0.328），p＝0.019；效果量未達 0.20 |
| **MA1** | 記憶，主要，DeepSeek（47 題） | **FAIL** | 個體 0.830、原始 0.468，差 0.362（0.191–0.511），p＝0.0002；差、區間下界與「原始 ≤ 0.25」未達 |
| **MA2-NEMO** | 記憶，主要，Nemotron | **PASS** | 個體 0.894、原始 0.064，差 0.830（區間下界 0.723），p＝3.6×10⁻¹² |
| **MB1** | 隱性運用記憶，DeepSeek（15 題） | **FAIL** | 11/15 vs 6/15，p＝0.125 |
| **MB2-NEMO** | 隱性運用記憶，Nemotron | **PASS** | 14/15 vs 2/15，p＝0.0005 |
| MB3 | 明問的記憶題，DeepSeek（32 題） | PASS | 28/32 vs 16/32，差 0.375，p＝0.0018 |
| MA3／MA4-NEMO | 不傷害（對照題） | PASS／PASS | 全部正確 |
| MA5／MA6-NEMO | 不虛構（拒答題） | PASS／PASS | DeepSeek 8/8 vs 8/8；Nemotron 7/8 vs 8/8（容許差 1） |
| MA7 | 自動回憶的必要性（記憶） | FAIL | 0.830 vs 0.745，p＝0.29 |

依預先登記的定義（記憶規格 §7、人格規格 §7），「模型獨立」的主張需要 DeepSeek 與 Nemotron 兩條主要線都 PASS：

- **人格連續性：成立。** PA1 與 PA2-NEMO 都 PASS。
- **記憶：不成立。** MA2-NEMO、MB2-NEMO PASS，但 MA1、MB1 FAIL。決定性差異只在 Nemotron 上成立；DeepSeek 上差異大且顯著，但沒有通過全部門檻，原因見 §3.1。

## 2. 各類別結果

| 記憶 | 原始（DeepSeek） | 個體（DeepSeek） | 原始（Nemotron） | 個體（Nemotron） |
|---|---|---|---|---|
| 資訊擷取（10） | 2/10 | 10/10 | 0/10 | 10/10 |
| 跨 session 推理（8） | 2/8 | 6/8 | 0/8 | 7/8 |
| 知識更新（8） | 8/8 | 7/8 | 0/8 | 7/8 |
| 時間推理（6） | 4/6 | 5/6 | 1/6 | 4/6 |
| 隱性運用記憶（15） | 6/15 | 11/15 | 2/15 | 14/15 |
| 拒答（8） | 8/8 | 8/8 | 8/8 | 7/8 |
| 對照（8） | 8/8 | 8/8 | 8/8 | 8/8 |

| 人格 | 原始（DeepSeek） | 個體（DeepSeek） | 原始（Nemotron） | 個體（Nemotron） |
|---|---|---|---|---|
| 任意選擇（12 × 2） | 10/24 | 24/24 | 5/24 | 20/24 |
| 價值立場（6 × 2，對照） | 12/12 | 10/12 | 10/12 | 10/12 |
| 回想自己說過的話（12） | 1/12 | 12/12 | 0/12 | 9/12 |
| 改變後的延續（4 × 2） | 8/8 | 7/8 | 8/8 | 8/8 |
| 敘述自己的改變（4） | 0/4 | 3/4 | 0/4 | 4/4 |
| 對照（4） | 4/4 | 4/4 | 4/4 | 4/4 |

回想題中，原始 DSH（Nemotron）有 4 題、敘述題 4 題被判為「否認記得後重新推導」（rederived，0 分）：這是 v2 依 v1 的發現加入的效度修正，兩個條件同一規則。

消融（DeepSeek）：記憶——關閉自動回憶 0.745、不附快照 0.851，與個體 0.830 沒有可辨別的差異；人格——關閉自動回憶 0.781（任意選擇 12/24）、不附快照 0.938。

## 3. 描述性發現（不改變判定）

### 3.1 原始 DSH（DeepSeek）自發地重建記憶；原始 DSH（Nemotron）沒有

v2 模擬全新帳號（DSH 在 `~/.dsh`）。原始 DSH（DeepSeek）在第 10 段歷史對話中——使用者只問了行程安排，沒有要求回想——主動列出家目錄、找到隱藏的 `~/.dsh`，用 `zstd -dc` 解壓先前的 session 檔，把讀到的資訊（膝傷、大夜班、孩子四歲）用在回答中；從第 12 段起建立並持續更新 `~/workspace/memory/notes.md`（分類整理、記下告知日期、「待釐清」清單），在第 12、14、15、16 段共寫入或修改 11 次（另有 10 次讀取或列出）。探針時它讀筆記作答，例如知識更新題 8/8。人格實驗中它沒有寫筆記。

原始 DSH（Nemotron）沒有任何翻閱 session 存放區的工具呼叫，記憶題主要比較只有 3/47。

這不是實驗污染：兩個條件的工具與權限完全相同，這是「DeepSeek＋DSH 的檔案工具」的真實能力。它改變的是解讀：能力強的模型會臨場拼湊出外部記憶，而且能拼湊多少取決於模型；個體的記憶是設計好、每一步自動參與的，在兩個模型上表現接近（主要比較 0.830／0.894）。DeepSeek 上的差距在原始 DSH 開始寫筆記之前就該記住的資訊擷取最大（10/10 vs 2/10），在它開始寫筆記之後才出現的知識更新消失（7/8 vs 8/8）。

### 3.2 自動回憶的作用

人格實驗中關閉自動回憶，任意選擇的連續性從 24/24 降到 12/24（個體仍會主動 `recall`，但不一定在每次選擇前想起自己以前選過什麼）；記憶實驗中差異不顯著。PA10 的效果量未達門檻，只能說「方向一致但未達預先登記的效果量」。

### 3.3 其他

- 個體的輔助呼叫：DeepSeek 6 個個體類 cell 共 823 次、Nemotron 2 個共 285 次，失敗都是 0（`run-summary.json` 的 `auxiliaryCalls`）。
- 確定性比對與 judge 的交叉檢查見各 `summary.md`。
- 花費：DeepSeek 受試 8 個 cell US$3.85（整批餘額差）；judge 約 US$0.50（usage 估計，記憶 US$0.256、人格 US$0.243）；Nemotron 付費端點 US$1.00（OpenRouter 用量）。存檔的免費端點 cell US$0。

## 4. 偏離預先登記的地方

- **協定修正 1**（[`v2-amendment-1.md`](../specs/v2-amendment-1.md)）：Nemotron 由免費端點改為付費端點並固定 bf16 供應商；第一天以免費端點完成的兩個 cell 移到 `runs/archived__v2-free__*`，保留不計分。修正在任何 Nemotron 結果計分之前寫定；計分使用修正版契約，驗收線與原始預先登記相同。
- EVE-27B 與換模型的選用 cell 未執行（本機模型關閉）。

## 5. 限制

- 每個 cell 的歷史只跑一次；結論只適用於這一次實際發生的歷史。原始 DSH（DeepSeek）何時開始自建記憶本身有隨機性，這次在第 10 段。
- 類別內樣本仍小（例如隱性運用 15 題、改變敘述 4 題）。
- judge 只用一個模型（deepseek-v4-pro），以手寫用例驗證。
- Nemotron 的結果只代表 OpenRouter 付費端點上 Crusoe 的 bf16 部署；免費端點（NVIDIA 自營）未計分。
