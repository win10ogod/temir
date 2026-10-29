# 預先登記：記憶準確率實驗 v3（memory-accuracy-v3）

- 撰寫：主代理，2026-10-29。**任何 v3 受試執行之前**完成並 commit。v1、v2、dev1–dev3 的結果與判定不改。
- 使用者要求（2026-10-29）：「按需披露還能優化」「優化題目，改進並實驗」。
- 機器可讀契約：[`memory-accuracy-v3.contract.json`](memory-accuracy-v3.contract.json)。類別、計分、cell、比較與驗收線都以它為準。
- 資料集：[`../datasets/memory-v3.json`](../datasets/memory-v3.json)，由 [`../datasets/build.ts`](../datasets/build.ts) 從 [`memory-v3.source.ts`](../datasets/memory-v3.source.ts) 產生，重跑逐位元組相同。撰寫完成時的 sha256：`164d1c3cdde6b22a9b64f26c8803abf0ac8abc3a471b64a095cd5cf01010674b`。
- 評估器：沿用 v2（`reportVersion: 2`）。v3 只做兩項改變：
  - 契約可用的條件加入 `temir-full` 等執行器已有的條件；
  - 新增 v3 的資料集測試。
  v1、v2 的輸出不變。
- 凍結規則：同 v2。第一次 v3 受試執行之前，本規格、契約、資料集、評估器與受試程式碼一起 commit；正式執行在該 commit 的乾淨 worktree 中進行。之後任何修改開 v4，已有的結果照實保留。

## 1. 從 v2 與開發檢查學到什麼、v3 改了什麼

| 發現 | v3 的改變 | 理由 |
|---|---|---|
| v2 的題目已暴露（dev1–dev3 都在上面診斷、改程式），個體的分數接近上限（dev2：DeepSeek 0.957、Nemotron 0.979） | 全新人物、事實與題目；`datasets-v3.test.ts` 檢查與 v1、v2 不重疊 | 暴露的題目不能再當證據；接近上限的題目無法分辨改動的好壞 |
| 歷史在幾分鐘內跑完：知識更新的新舊說法只隔幾分鐘，個體反問而被判錯（dev1 q28、dev2 q29）；時間推理只能用明寫的日期 | **模擬時間**：每段歷史有 `meta.at`（2026-05-04 到 07-26，分散在 12 週），探針在 `meta.probeAt`（2026-07-31 星期五 20:30，台北時間）。執行器在每段歷史啟動時把時鐘撥到那個時間（`experiments/runner/clock.ts`；`sim-bin/date` 讓 bash 的 `date` 一致） | 對應 LongMemEval 每段 session 的時間戳與提問日期（papers/2410.10813 §3）。兩個條件用同一個時鐘 |
| 時間推理只測明寫日期的加減 | 改成需要 session 日期的題目：「從今天開始」「後天」「下週二」要依說話那天換算；相對說法都選在沒有歧義的日子（`datasets-v3.test.ts` 核對） | 記憶有時間，才能談經歷的先後與間隔 |
| 標準答案有歧義（v2 q21「考前一週請假」）、類別邊界模糊（v2 q16「醫生交代」是否含獸醫） | 黃金答案只用一種讀法；需要多項的題目在 note 寫明「都要答到」，不設會誤判的 aliases | judge 的變異應來自回答，不是題目 |
| 隱性運用記憶多半只依賴一個舊事實 | 加入需要「更新後的事實」（星期六早上十點的課與出遊時間衝突、已經買車）與「兩段以上歷史的限制」（自己蝦蟹過敏＋媽媽糖尿病）的題目 | 更接近「記憶參與決策」 |
| 拒答只有「從沒提過」 | 加入錯誤前提（說過的是蝦蟹過敏，題目說芒果）與相近的混淆（烏克麗麗老師 vs 鋼琴老師） | LongMemEval-V2 的拒答 judge：順著錯誤前提作答＝0（已在評估器中） |
| dev2：按需披露在暴露的題目上不輸全文 | 這次在全新題目上正式比較（E-D1），而且比較的是 2026-10-29 再優化之後的按需披露（ADR-0002 D1 第二次更新） | dev2 只是診斷 |

v3 執行時的受試程式碼還包含 2026-10-29 的其他改變（ADR-0002 D10、hypotheses.md H-E）：
- 能量（懸著的事、drive、released／left）；
- 快照中的「現在」。
這些改變兩個個體條件（`temir`、`temir-full`）都有，所以不影響 E-D1。和 baseline 的比較中，它們是個體的一部分，**本實驗不分離它們各自的效果**。

## 2. 研究問題

1. **主要**：在全新、模擬時間的記憶題上，個體（`temir`，預設的按需披露）與原始 DSH（`baseline`）是否有決定性差異。DeepSeek 見 MA1，Nemotron 見 MA2-NEMO；門檻與類別定義與 v1、v2 相同。
2. **主要**：不明問記憶時，個體是否會運用記得的事。DeepSeek 見 MB1，Nemotron 見 MB2-NEMO。
3. **E-D1**：按需披露（`temir`）是否不比全文（`temir-full`）差。D1-flash、D1-NEMO；決策規則見 §7.3。
4. **不傷害**：一般任務不退化（MC-flash、MC-NEMO）；不更常編造（MD-flash、MD-NEMO）。
5. **描述性**：
   - 注入字數、工具呼叫、翻閱 session 存放區的比例、延遲；
   - 能量紀錄（H-E）：drive 的有無、left／released 的比例；
   - 受試者執行 `date` 的次數。

## 3. 任務契約

### 3.1 條件

| 條件 | 內容 |
|---|---|
| `baseline` | 原始 DSH 0.2.2-alpha.2 的 `sdk` profile，不載入任何個體插件 |
| `temir` | DSH＋`individual/cordis.patch.yml`（預設：按需披露、RD、JitRL、整合期、能量） |
| `temir-full` | 同 `temir`，只把回憶改成全文披露（`experiments/runner/patches/full-disclosure.yml`） |

### 3.2 模型與 cell（全部必要）

| | DeepSeek `deepseek-flash` | Nemotron `nvidia/nemotron-3.5-super-vl`（OpenRouter 付費端點，經 `openrouter-pin.ts` 固定 bf16 供應商） |
|---|---|---|
| baseline | 必要 | 必要 |
| temir | 必要 | 必要 |
| temir-full | 必要 | 必要 |

- 每個 cell 的歷史只跑一次。
- 每題從「歷史結束」快照還原，在新的執行期與新的 session 中提問（同 v2）。

### 3.3 目錄配置與執行協定

- 同 v2：`--layout home --assistant-text all`。
- 工具審核一律允許一次，受試者提問一律回覆同一句話。
- **模擬時間（v3 新增）**：
  - 每段歷史各自啟動一個 DSH 執行期，時鐘撥到該段的 `meta.at`；
  - 沉澱在最後一段之後 10 分鐘；
  - 探針全部在 `meta.probeAt`。
  - 時鐘只換掉 JavaScript 的 Date；DSH 啟動的 node 子行程與 `date` 指令看到同一個時間。
  - 已知的不一致：受試者用 Python 取時間、或看檔案時間時，看到的是真實時間。報告中照實記錄是否發生。
- 自動整合：個體的閒置整合需要真實時間 30 分鐘沒有新事件，執行器的每個執行期都比這短，所以預期不會發生；有發生就照實記錄。

## 4. 資料集

20 段歷史（其中 3 段是干擾或收尾、沒有會被問到的事實）、58 題探針：

| 類別 | 題數 | 計分 |
|---|---|---|
| 資訊擷取 | 8 | det-then-judge（mem-default） |
| 跨 session 推理 | 8 | det-then-judge（mem-default） |
| 知識更新 | 8 | det-then-judge（mem-knowledge-update） |
| 時間推理 | 8 | det-then-judge（mem-temporal；天數差一不扣分） |
| 拒答 | 8 | judge（mem-abstention） |
| 隱性運用記憶 | 12 | judge-criteria（mem-criteria-v2，全部準則符合才算對） |
| 對照 | 6 | det-then-judge（mem-default） |

**主要類別**是資訊擷取、跨 session 推理、知識更新、時間推理、隱性運用記憶，共 44 題。

構造與洩漏檢查（`build.ts`、`coverage.ts`、`datasets-v3.test.ts`）：
- 證據逐字出現在指定歷史；
- 拒答題的詞不出現在任何歷史；
- 知識更新的舊答案早於新答案，新答案不提早出現；
- 題目不含答案；
- 日期由 session 時間換算後與黃金答案一致；
- 注入缺陷時檢查會失敗。

## 5. 計分

- 同 v2（`reportVersion: 2`）：judge 為 `deepseek-v4-pro`，溫度 0，不開推理，每個 run 上限 US$3。
- bootstrap 10,000 次，種子 20261029。
- 分母：每個 cell 的全部探針；回合錯誤記為失敗，不排除。基礎設施錯誤（429、5xx）依契約的 `infraErrorPattern` 另行標示，同 v2。

## 6. 描述性指標（不作驗收）

- 同 v2 §6.4：工具呼叫數、翻閱 session 存放區、延遲。
- 每題探針注入的回憶字數，比較 `temir` 與 `temir-full`。
- 能量紀錄：
  - 探針的 `rd/decision` 中有 drive 的比例；
  - 歷史中 `rd/outcome` 有 left、released 的比例；
  - 快照中「懸著的事」的條數。
- 受試者執行 `date`（或其他取時間的指令）的次數；有沒有用 Python 取時間。

## 7. 預先登記的驗收線

### 7.1 驗收線（契約 `acceptance`）

| id | 比較 | 規則 |
|---|---|---|
| MA1／MA2-NEMO | temir vs baseline，主要類別 | 差 ≥ 0.40、95% 區間下界 ≥ 0.25、雙尾 p ≤ 0.01、個體 ≥ 0.50、原始 DSH ≤ 0.25（與 v1、v2 相同） |
| MB1／MB2-NEMO | temir vs baseline，隱性運用記憶 | 差 ≥ 0.40、下界 ≥ 0.20、p ≤ 0.01、個體 ≥ 0.60、原始 DSH ≤ 0.30（與 v2 相同） |
| MC-flash／MC-NEMO | 對照題 | 個體最多比原始 DSH 多錯 1 題 |
| MD-flash／MD-NEMO | 拒答題 | 個體最多比原始 DSH 多錯 1 題 |
| D1-flash／D1-NEMO | temir vs temir-full，主要類別 | 按需披露最多比全文多錯 2 題（44 題中約 0.05） |

### 7.2 結論的寫法（事先寫定）

- **模型獨立的記憶主張**：DeepSeek 與 Nemotron 兩條主要線（MA1 與 MA2-NEMO）都 PASS 才成立；只有一條 PASS 時照實寫「只在該模型上成立」。
- v2 的 MA1 失敗，是因為原始 DSH（DeepSeek）自己翻日誌、寫筆記（v2-report §3.1）。v3 不阻擋這個能力，同樣照實描述。

### 7.3 E-D1 的決策規則

- 兩個模型的 D1 都 PASS：維持按需披露為預設。
- 任一模型 FAIL：
  - 把預設改回全文（`disclosure: full`），並在 ADR-0002 D1 記錄；
  - 同時檢查失敗的題目，是不是因為索引或短 id 少了必要的細節；
  - 依失敗的原因修正，之後在 v4 的新題目上重測。不在 v3 的題目上反覆調整。

## 8. 預算

- **DeepSeek**（受試＋judge）：
  - v2 的 DeepSeek 記憶 cell 約 US$0.5–0.7；dev3f 的個體 cell（6 題＋全部歷史）約 US$0.25。
  - 估計三個 cell 約 US$2，judge 約 US$0.5。上限 US$5。
- **Nemotron**（OpenRouter）：
  - 2026-10-29 的實測：約 3,000 次請求花了 US$4.6，平均每次約 US$0.0015；
  - 個體 cell 估計約 500–600 次（US$0.8–0.9），原始 DSH 約 150–300 次（US$0.2–0.5）；
  - 三個 cell 合計約 US$2–2.5。上限 US$3.5。
- 餘額不記錄在 repo 中，只記錄花費。

## 9. 停止條件

- 任一 cell 連續 3 題探針失敗：執行器中止（`--max-consecutive-failures 3`），先修基礎設施再重跑該 cell；中止的紀錄保留為 `aborted__*`。
- Nemotron 花費超過 US$3.5：停止，回報使用者。
- 模擬時鐘失效：例如生命日誌的時間不是 `meta.at`。停止，修正後整批重跑；失效的紀錄保留，不計分。

## 10. 已知的未覆蓋範圍與威脅

- 單一使用者人物、單一語言，每個 cell 的歷史只跑一次。
- 模擬時間只換掉 JavaScript 的時鐘（§3.3）。
- E-D1 比較的是兩組完整設定：按需披露同時把自動回憶的上限由 8 筆提高到 16 筆，和 dev2 相同。
- 能量與「現在」沒有分開消融。本實驗對它們的效果不下結論，只描述它們的紀錄。

## 11. 指令

```sh
source scripts/env.sh
node experiments/datasets/build.ts --check
node experiments/runner/openrouter-pin.ts --port 8787 --log ~/.cache/temir/experiments/batch-logs/openrouter-pin-v3.jsonl &
# 在凍結的 worktree 中：
RUN_PREFIX=v3 RUN_ARGS="--layout home --assistant-text all" bash experiments/runner/batch.sh v3-memory 3 \
  memory-v3:baseline:deepseek:deepseek memory-v3:temir:deepseek:deepseek memory-v3:temir-full:deepseek:deepseek \
  memory-v3:baseline:nemotron-bf16:nemotron-bf16 memory-v3:temir:nemotron-bf16:nemotron-bf16 memory-v3:temir-full:nemotron-bf16:nemotron-bf16
node experiments/eval/score.ts --dataset experiments/datasets/memory-v3.json --contract experiments/specs/memory-accuracy-v3.contract.json \
  --runs experiments/runs/v3__memory-v3__* --out experiments/results/memory-v3 --judge deepseek
```
