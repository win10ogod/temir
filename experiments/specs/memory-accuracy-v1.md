# 預先登記：記憶準確率實驗 v1（memory-accuracy-v1）

- 撰寫：評估子代理，2026-10-28。**任何受試執行之前**完成；寫作時 `experiments/runs/` 沒有任何本實驗的紀錄。
- 機器可讀契約：[`memory-accuracy-v1.contract.json`](memory-accuracy-v1.contract.json)（必要類別、計分方式、cell、比較、驗收線、judge 設定都以它為準；本文件是它的說明）。
- 資料集：[`../datasets/memory-v1.json`](../datasets/memory-v1.json)，由 [`../datasets/build.ts`](../datasets/build.ts) 從 [`memory-v1.source.ts`](../datasets/memory-v1.source.ts) 產生，可重跑得到逐位元組相同的檔案（`node experiments/datasets/build.ts --check`）。撰寫完成時的 sha256：`fddcdc311207fa586c6d6c296112602731badf326f4b4963de036841f9bb8beb`。
- 評估器：[`../eval/`](../eval/)（`score.ts`、`coverage.ts`、`lib/`、`test/`）。
- **凍結規則**：主代理在第一次受試執行前 commit 本規格、契約、資料集與評估器；執行器的 `config.json` 會記下 `code.commit`。之後若要改任何一項（包括修錯字），一律開 v2，不覆寫 v1，v1 已有的結果照實保留。資料集 sha256 由評估器在計分時重新計算，並與每筆紀錄的 `datasetSha256` 比對，不符的紀錄記為失敗（§4）。

## 1. 研究問題

使用者原話：「要先做完人格一致性與記憶準確率……實驗（確認我們的插件是否與原始 dsh 有著絕對性的不同）」。

本實驗回答：

1. **主要**：在跨 session 的記憶題上，掛了個體插件的 DSH（`temir`）是否與原始 DSH（`baseline`）有**決定性**差異（驗收線 MA1／MA2，§7）。
2. **不傷害**：個體插件是否讓單一 session 內的一般任務退化（MA3／MA4），是否讓個體更常順著錯誤前提編造記憶（MA5／MA6）。
3. **次要（消融）**：差異有多少來自每步自動回憶（MA7）；自我狀態快照對記憶題是否有影響（描述性，不設驗收線，預期沒有）。
4. **描述性**：換模型（歷史用模型 A、探針用模型 B）時記憶是否還在。

不回答：記憶是否「參與了人格或決策」（那是人格實驗與後續消融的範圍，見 `personality-consistency-v1.md`）；長期（數百 session）規模下的表現（§10）。

## 2. 任務契約

### 2.1 受試對象與條件

受試對象是 DSH 0.2.2-alpha.2 的 `sdk` profile，由主代理的執行器 `experiments/runner/run.ts` 驅動（DSH SDK JSON-RPC）。四個條件：

| 條件 | 定義（以撰寫時的 commit 74a036e 為準） |
|---|---|
| `baseline` | 原始 DSH：`sdk` profile，**不載入任何個體插件**，保留 DSH 預設的 coding agent 角色。DSH 本身沒有跨 session 記憶（`research/dsh/feature-matrix.md`），但它有檔案與 shell 工具，理論上可能自己去讀工作目錄或 DSH 的 session 檔；若發生，算原始 DSH 的能力，照樣計分，並在報告中列出工具呼叫（§6.4）。 |
| `temir` | DSH＋`individual/cordis.patch.yml`：處境描述（取消 coding agent 角色）、只增生命日誌、每步自我狀態快照、每步自動回憶（混合檢索、每則訊息一次輔助模型呼叫擷取事實與線索詞、新 session 第一句帶入最近一次對話）、自己回覆的立場與承諾擷取、`recall`／`self_revise`／`goal`／`appraise` 工具。 |
| `temir-no-autorecall` | `temir`＋`experiments/runner/patches/no-autorecall.yml`（`temir-recall.automatic: false`）：不自動注入回憶，也不帶入最近一次對話；事實擷取與主動 `recall` 工具仍在。 |
| `temir-no-snapshot` | `temir`＋`experiments/runner/patches/no-snapshot.yml`（`temir-self.snapshot: false`）：不附自我狀態快照。 |

若執行時的插件 commit 與上表不同，報告必須寫出實際 commit，並說明差異；條件的定義以執行時 `config.json` 的 patch 清單與 commit 為準。

### 2.2 受試模型與 cell

一個 **cell**＝（條件, 歷史模型, 探針模型）。模型：DeepSeek `deepseek-flash`（付費）、本機 `EVE-27B`（`http://localhost:8000/v1`，免費但慢）。

- **必要 cell**（CLAUDE.md 規則 2：DeepSeek 與本機模型各跑一次）：四個條件 × `deepseek-flash`；`baseline`、`temir` × `EVE-27B`。
- **選用 cell**：兩個消融 × `EVE-27B`；換模型：`baseline`、`temir` × （歷史 `EVE-27B` → 探針 `deepseek-flash`）與（歷史 `deepseek-flash` → 探針 `EVE-27B`）。換模型 cell 重用同一個條件、同一個歷史模型已跑完的歷史快照，只重跑探針。

每個 cell 的歷史只實際跑**一次**（一個個體、一段人生）。這表示所有推論都是「在這一次實際發生的歷史下」的條件推論（§6.3）。

### 2.3 執行協定（主代理的執行器必須遵守）

1. 每個 cell 用全新的狀態目錄：生命日誌（`TEMIR_HOME`）、DSH home（`DSH_HOME`）、工作目錄各自獨立。**工作目錄必須是空的**，不能含 `AGENTS.md` 或 `CLAUDE.md`：DSH 的 `agent-instructions` 會把工作目錄的這些檔案載入系統提示（`research/dsh/inventory.md` packages/context/agent-instructions），本專案根目錄的 `CLAUDE.md` 會污染受試者。
2. 歷史依 `histories` 陣列順序執行；每段歷史是一個新 session，`turns` 依序在同一 session 中送出。
3. 歷史全部結束後，把整個狀態（生命日誌、DSH home、工作目錄）存成「歷史結束」快照。
4. **每一題探針**（以及每一次重複；本實驗沒有重複，人格實驗見其 §3.2）之前都把狀態還原成這個快照，再開一個新 session 送出該題的 `turns`。題與題之間因此不會互相污染。
5. 四個條件使用相同的工具、權限與核准設定（`config.json` 要記錄）；執行器不得對任一條件額外提示「請回想」「請用 recall」。
6. 每一輪的逾時、錯誤一律寫進紀錄的 `error`，不重跑後丟棄舊結果；若因基礎設施故障要重跑整個 cell，舊紀錄移到另一個 runId，報告中說明。

### 2.4 不傷害對照的設計

類別 `control`（6 題）是與歷史無關的單一 session 一般任務：算周長、session 內記住一組代碼再問、字串倒寫、日期推星期、單位換算，以及一題**干擾檢查**（q33：session 內剛說朋友的貓叫「豆花」，個體自己的貓「麻糬」可能被自動回憶帶進來，不應取代剛給的資訊）。它們全部有確定性的黃金答案。這組題目只能偵測**明顯**的退化（例如自動回憶的片段讓個體答非所問），6 題的檢定力很低（§6.3）。

## 3. 資料集

### 3.1 能力類別（必要類別寫在契約中，不從資料反推）

| 類別 id | 論文出處 | 本資料集的操作化 | 題數 | 計分 |
|---|---|---|---|---|
| `information-extraction` | LongMemEval §3.2（`text/3_benchmark.tex`）IE，題型 single-session-user | 使用者在某一段歷史中順帶提到的事實（名字、貓名、老師名、過敏、住處名、日期、場地） | 7 | 確定性優先，judge `mem-default` |
| `multi-session-reasoning` | LongMemEval §3.2 MR | 跨兩到三段歷史彙總或比較（讀完幾本書、兩筆花費加總、兩個通勤時間相減、體重差） | 4 | 確定性優先，judge `mem-default` |
| `knowledge-update` | LongMemEval §3.2 KU；Memora §4.2〈Forgetting-Aware Memory Accuracy〉（`tex/experiments.tex`） | 先說 A、後來改成 B，問目前的值（工作地點、上課日、旅行目的地、預算、貓體重） | 5 | 確定性優先；命中新值但也出現舊值時交給 judge `mem-knowledge-update` |
| `temporal-reasoning` | LongMemEval §3.2 TR | 只用**明寫**的日期：兩個日期的天數差、「前一天」推日期、依 session 先後判斷「最早」 | 4 | 確定性優先，judge `mem-temporal`（差一不扣分） |
| `abstention` | LongMemEval §3.2 ABS（錯誤前提題）；LongMemEval-V2 §3.1 Premise Awareness | 問從沒提過的東西（狗、妹妹、鋼琴老師、沖繩機票），問題本身帶著錯誤前提 | 4 | judge `mem-abstention` |
| `preference-application` | LongMemEval §3.2 single-session-preference；MemoryArena §3.2（`sec/3_method.tex`：後續行動在沒有前面資訊時是不足指定的） | 不直接問事實，而是請它做事，做得對必須用到記憶（只有電鍋＋花生過敏的晚餐、二月釧路的行李、媽媽六十歲的禮物） | 3 | judge `mem-preference`（附評分準則） |
| `control` | 本專案設計（§2.4） | 單一 session 一般任務 | 6 | 確定性優先，judge `mem-default` |

主要比較（MA1／MA2）合併前五個「需要跨 session 記憶」的類別：IE＋MR＋KU＋TR＋PA，共 **23 題**。拒答與對照題分開報告，不併入主要分數：原始 DSH 沒有記憶，在拒答題上本來就容易「答對」（說不知道），併入會稀釋差異也會誤導；LongMemEval 原文把拒答併入總分，我們的做法不同，在此註明。

另外還有 LongMemEval 的 single-session-assistant（回想助理自己說過的話）：因為助理的話是受試者當場生成的、沒有固定黃金答案，這一類放在人格實驗的 (c) self-recall，不在本實驗。

### 3.2 構造原則

- 11 段歷史、24 輪使用者發言、33 題探針（35 輪）。歷史 h01–h10 植入事實；h06 是無關的干擾 session（LongMemEval §3.2〈History Compilation〉的無關 session）；**h11 是收尾的干擾 session**：`temir` 在新 session 的第一句會帶入「最近一次對話」（`individual/src/recall/index.ts` 的 `lastConversation`），若最後一段歷史就是某題的證據，那題不需要檢索就會被帶入，因此在最後放一段無關對話。
- 事實以「順帶一提」的方式嵌在求助對話中（LongMemEval §3.2〈Evidence Session Construction〉：使用者間接透露資訊）。
- 所有專名與數字都是虛構或任意的（溫予寧、麻糬、蕭以禾、晴光苑、青川植物園、海岬水族館、松濤音樂廳……），沒有記憶不可能猜中（LongMemEval-V2 §3.2：題目必須無法只靠參數知識回答）。
- 時間只用明寫的月日（11 月、12 月、明年二月）。LongMemEval 有一部分時間題依 session 時間戳記推理；本實驗所有 session 在同一次執行中連續跑完，時間戳記沒有意義，所以不涵蓋（§10）。
- 黃金答案由構造決定。每題在 `meta.evidence` 寫出證據原文與所在歷史；同義寫法列在 `gold.aliases`（數字的阿拉伯／中文寫法、日期的不同格式、TR 天數題依 LongMemEval 的差一規則也列入 ±1 天）。`aliases` 只收**完整等價**的寫法：只說名不說姓、場館名只說前兩個字這類部分寫法不列入（確定性命中會直接判對，太寬的寫法會灌水），交給 judge 判定。這條規則是在評估器端到端檢查時訂下的（§5.4 合成紀錄的檢查），當時移除了「予寧、以禾、松濤、海岬」四個簡寫。

### 3.3 `meta` 欄位（主代理的執行器不需要讀；評估器使用）

| 欄位 | 意義 |
|---|---|
| `evidence` | `[{history, text}]`：證據原文，必須逐字出現在該歷史中 |
| `conflicts` | 確定性比對時若出現，就把「命中」改成「不確定」交給 judge 的字串（舊答案、相鄰的其他日期或候選） |
| `stale` | 知識更新題的舊答案（必須出現在比新答案更早的歷史） |
| `absentTerms` | 拒答題問到、在所有歷史中都不得出現的詞 |
| `explanation` | 拒答題給 judge 的說明 |
| `rubric` | 個人化應用題給 judge 的評分準則 |
| `repeats` | 本資料集一律省略（＝1） |
| `note` | 註記 |

### 3.4 洩漏與構造檢查（自動，`coverage.ts`／`build.ts` 每次都跑）

1. 黃金答案與同義寫法不得出現在探針的提問中（對照題只檢查最後一輪，因為前幾輪是 session 內的資訊）。
2. `evidence` 原文必須逐字出現在指定的歷史，且該歷史列在 `refersTo`。
3. 拒答題的 `absentTerms` 不得出現在任何歷史。
4. 知識更新題：舊答案必須出現在某段歷史、且早於第一段含新答案證據的歷史；新答案不得在更新之前出現。
5. 非拒答、非對照題必須有 `evidence`。
6. 每個必要類別的題數不得低於契約的最低值；資料集不得出現契約沒定義的類別。

題與題之間的污染由執行協定（每題前還原快照）排除；同一份歷史內的洩漏由上面 1–4 檢查。`test/coverage.test.ts` 對每一條規則注入一個已知缺陷，確認稽核會失敗。

## 4. 紀錄契約與分母

評估器讀 `experiments/runs/<runId>/records.jsonl`，每行一筆（格式見主代理任務說明；多出的欄位如 `model`、`ms`、`usage` 會被忽略）。可選欄位 `repeat`（0 起算）用來排序同一題的多次重複；沒有時依 `startedAt` 排序。

每個 cell、每題一律產生 `repeats` 個樣本，**全部進分母**：

| 狀況 | 樣本狀態 | 分數 |
|---|---|---|
| 沒有紀錄 | `missing-record` | 0 |
| JSON 壞掉、無法辨認是哪一題 | 列入 protocol issues；該題因缺紀錄記 `missing-record` | 0 |
| 能辨認題目但欄位缺漏或型別錯 | `malformed-record` | 0 |
| `datasetSha256` 與實際資料集不符 | `dataset-mismatch` | 0 |
| 回合數與資料集不符 | `turn-count-mismatch` | 0 |
| 任一輪 `error` 非 null（含逾時） | `turn-error` | 0 |
| 最後一輪沒有可見文字 | `empty-response` | 0 |
| judge 輸出無法解析（重試 3 次後）、API 錯誤、超出 judge 預算 | `judge-error` | 0 |
| judge 被刻意關閉（`--judge none`）或重放時找不到 | `needs-judge` | 不給分；該類別標示「未完成」，驗收線記 INCOMPLETE |

多出的紀錄不計分，但列入 protocol issues。記憶題雖然不直接用歷史紀錄計分，評估器仍逐段檢查每個 cell 的歷史是否存在、回合數相符、沒有錯誤回合；有問題的歷史列入報告（之後所有探針都受影響），但不重新計分。整個 cell 沒有任何紀錄時，該 cell 標示「未執行」，相關驗收線為 INCOMPLETE（不會被當成 FAIL 或 PASS）。

## 5. 計分

### 5.1 確定性優先（`det-then-judge`）

用於 IE、MR、KU、TR、control。比較對象是最後一輪的可見回覆。

1. 正規化：NFKC（全形→半形）、轉小寫、去空白、去掉數字的千分位逗號、「臺→台」。
2. 子字串比對（MemoryAgentBench 的 SubEM，`appendix.tex`〈Document Question Answering〉；LongMemEval-V2 §3.3 對結構化答案也用正規化字串比對），本專案加上**數字邊界**：答案以數字開頭／結尾時，命中位置前後不能緊接著同類數字（避免「14天」被「4天」命中、「5.1」被「15.1」命中）。
3. 命中任一正確寫法、且沒有出現任何 `conflicts` → **對**（不呼叫 judge）。
4. 其他情況（沒命中，或命中但也出現衝突值）→ 交給 judge 判定。沒命中也送 judge，是為了不讓同義寫法的遺漏冤枉有記憶的條件；這個設計使確定性比對只會判「對」，不會判「錯」。

可選的 `--cross-check`：對確定性命中的樣本也呼叫 judge，只用來量測兩者一致率，不影響分數。建議在主要 cell（`deepseek-flash` 的 `temir` 與 `baseline`）上開啟。

### 5.2 Judge

- 模型：DeepSeek `deepseek-v4-pro`，`https://api.deepseek.com/chat/completions`；`thinking: disabled`、`temperature: 0`、`response_format: json_object`、`max_tokens: 400`；最多 3 次嘗試。金鑰只從環境變數 `DEEPSEEK_API_KEY` 讀取，不印出、不寫入任何檔案（快取與 log 只存提示詞與輸出）。
- 輸出：只接受一個 JSON 物件，`label` 必須是 `yes` 或 `no`（大小寫不同、多個物件、缺欄位都算解析失敗）；每一次嘗試的原始輸出都寫進 `judge-raw.jsonl`。
- 提示詞（`eval/lib/prompts.ts`，繁體中文）：

| id | 出處 | 本專案補充 |
|---|---|---|
| `mem-default` | LongMemEval 附錄 A.4〈Evaluation Metric Building〉圖 prompt_for_evaluation 的 Other question types | 明確否定正確答案、或與互相矛盾的答案並列而不選定 → no |
| `mem-temporal` | 同上，temp-reasoning（天數差一不扣分） | 同上；並在差一規則後加本資料集的例子（§5.4 dev 第 1 輪後的措辭調整） |
| `mem-knowledge-update` | 同上，knowledge-update | 把舊資訊當成目前答案、或沒說清楚哪個是目前 → no（參考 Memora 的 forgetting-absence 準則） |
| `mem-abstention` | LongMemEval 論文沒有印出拒答提示詞；採用 Hindsight 附錄重印的 LongMemEval 拒答 judge（`sections/appendix.tex`〈Judge Prompt: Abstention Questions〉） | LongMemEval-V2 拒答 judge（`tables/reader_and_llm_judge_prompts.tex`）：順著錯誤前提給出具體答案 → no；既說不知道又給出順著前提的答案 → no |
| `mem-preference` | LongMemEval 附錄 A.4，single-session-preference（附評分準則；不必涵蓋準則每一點） | 無 |

輸出格式改用 LongMemEval-V2 的「只輸出 JSON＋二元標籤＋一句理由」；LongMemEval 原文是直接輸出 yes/no。

### 5.3 拒答題的判定語意

LongMemEval 的拒答是「回答不知道」（§3.2：answer "I don't know"）；LongMemEval-V2 要求指出前提錯在哪裡（§3.1 Premise Awareness），通用的「不知道」記 0。本實驗採 **LongMemEval 的語意**（說資訊不存在、沒有順著前提編造＝對），所以原始 DSH 說「我無法存取過去的對話」也算對。因此拒答題**不是**用來證明個體比較好，而是檢查記憶有沒有讓個體更常編造（MA5／MA6）。LongMemEval-V2 的較嚴格語意（指出前提錯在哪）沒有另外計分，列入未覆蓋（§10）。

### 5.4 Judge 的驗證（已實際執行，2026-10-28）

`eval/judge-validation/cases.json`：56 個**手寫**用例（不取自任何受試執行），預期標籤依各提示詞規則人工決定；分 dev（可用於修改提示詞）、test（提示詞定稿後評一次）、test2（第二次修改後新寫、修改前沒看過）。以 `node experiments/eval/validate-judge.ts` 對真實 `deepseek-v4-pro` 執行：

| 輪次 | 範圍 | 結果 | 說明 |
|---|---|---|---|
| dev-r1 | dev 全部 21 例 | 20/21 | jv-09（時間題差一天）judge 沒套用差一規則 |
| dev-r2 | dev 全部 21 例 | 21/21 | 把差一規則移到補充規則之前並加例子（規則本身不變） |
| test-r1 | test 全部 25 例 | 24/25 | 記憶類 5 種提示詞 15/15 全對；人格類 jv-42 錯（只回想出立場、缺理由，被判 correct） |
| dev-r3 | dev 的 pc-recall／pc-narrate 4 例 | 4/4 | 人格類改成分項判定（見人格規格 §5.4） |
| test2-r1 | 新寫的 test2 10 例 | 10/10 | 改版後才寫的保留用例 |
| test-r2 | test 的 pc-recall／pc-narrate 5 例 | 5/5 | 含已看過的 jv-42，只作參考 |

另外以**合成紀錄**（不是受試執行：`temir` 的回覆照黃金答案寫、`baseline` 一律說不知道，存在暫存目錄、不放進 `experiments/runs/`）跑了一次完整的 `score.ts --judge deepseek --cross-check`，檢查資料集欄位到 judge 的串接：新呼叫 60 次、估計 US$0.0174；確定性命中 32 筆中 judge 也判 yes 的 31 筆，唯一的不一致是合成回覆「答案是海岬。」（judge：只說「海岬」不等於「海岬水族館」）。同一次檢查中 judge 接受了「予寧」「以禾」「松濤」三個簡寫，但為了保守，四個簡寫一併移除，改訂同義寫法的規則（§3.2）並重建資料集。

記憶類提示詞在保留測試組上 15/15 一致，但每種提示詞只有 2–4 例，信賴區間很寬（15/15 的 Clopper–Pearson 95% 下界約 0.78）；這不等同於 LongMemEval 對 30 題×7 類的人工後設評估（附錄 A.4 表 meta_evaluation，GPT-4o judge 與人類 97% 以上一致）。正式評估時應開 `--cross-check`，並在報告中列出確定性命中與 judge 的不一致例。

驗證的實際花費：以 API 回傳的 usage 依尖峰價格計算，六輪驗證共約 US$0.038（86 次呼叫），加上合成紀錄的端到端檢查 US$0.017（60 次），合計約 **US$0.055**（以 API 回傳的 usage 計算；帳戶餘額只顯示兩位小數，且期間主代理也在使用同一帳戶，不用餘額差估計）。原始輸出在 `eval/judge-validation/raw-*.jsonl`，結果在 `results-*.json`。

### 5.5 評估器自己的測試

`node --test "experiments/eval/test/**/*.test.ts"`（node:test，不連網、不花錢；judge 一律用標示為測試替身的 `ScriptedJudge` 或假的 fetch）。用例都是手寫、預期標籤由人工決定，不依賴資料集產生器。重點：

| 檔案 | 內容 |
|---|---|
| `text.test.ts` | 正規化、數字邊界、格式行擷取、選項對應、數字解析 |
| `stats.test.ts` | Clopper–Pearson 與 2610.09193 公布的四組區間逐一相符；McNemar 與符號檢定的手算值；bootstrap 固定種子可重現 |
| `records.test.ts` | 壞掉的 JSON、缺欄位、型別錯誤、錯誤回合、空回覆、回合數不符、sha256 不符、重複不足或過多——全部記為失敗而不是被過濾 |
| `coverage.test.ts` | 注入缺陷：刪掉一個必要類別（含 CLI 結束碼 1）、題數低於下限、未定義類別、答案寫進提問、拒答題的詞出現在歷史、知識更新的新答案提早出現、證據原文不存在、`comparesWith` 越界；規格 Markdown 與契約的類別、驗收線一致 |
| `scoring.test.ts` | 小型手寫資料集：確定性命中不呼叫 judge、衝突時改用 KU 提示詞、**翻轉黃金答案後分數改變**、**judge 回傳無法解析或標籤不合法記為錯誤**、judge 關閉時標示未完成；人格的相同／有說明的改變／無說明的不同／兩次都不選／形成紀錄缺漏 |
| `judge.test.ts` | 請求參數、解析失敗重試後記為 unparseable 且每次原始輸出都保存、API 錯誤重試、快取與重放、預算上限、**金鑰不出現在錯誤訊息與快取檔** |
| `prompts.test.ts` | 分項判定的推導規則、解析器的嚴格程度、提示詞保留出處規則 |
| `datasets.test.ts` | `build.ts --check` 逐位元組可重現、日期計算人工核對、人格資料集沒有預設答案、驗證用例格式 |
| `report.test.ts` | 驗收線的 PASS／FAIL／INCOMPLETE 判定；`score.ts` 端到端（壞行、壞紀錄、缺歷史都列入報告） |

撰寫時的結果：65 個測試全部通過；`tsc -p experiments/tsconfig.json` 無錯誤。

## 6. 指標與統計

### 6.1 指標

- 每個 cell × 類別：得分樣本數／總樣本數、比率、Clopper–Pearson 精確 95% 區間（與 2610.09193 §2 相同做法；`test/stats.test.ts` 用該文公布的 642/800→77.3–83.0 等四組數字驗證實作）。
- 主要分數：IE＋MR＋KU＋TR＋PA 合併的正確率（23 題）。
- 結果類型計數（正確、錯誤、各種失敗狀態），讓失敗原因可以逐例追查（`items.jsonl` 有每個樣本的回覆全文、判定方法、judge 理由）。

### 6.2 成對比較

同一題在兩個條件下是成對樣本：

- 精確 McNemar 檢定（不一致對數的二項式檢定；雙尾與單尾都報告）；
- 成對 bootstrap（以題為單位重抽 10,000 次、固定種子 20261028）的正確率差與 95% 百分位區間。

契約中的比較：主要（`temir` vs `baseline`，兩個模型各一）、五個類別各自的描述性比較、拒答、對照、兩個消融、換模型（選用 cell）。

### 6.3 小樣本與推論範圍（必讀）

- 主要比較只有 23 題；分類別比較 3–7 題，**只作描述，不設驗收線**（例如 4 題的 McNemar 最小雙尾 p＝0.125，不可能顯著）。
- 每個 cell 的歷史只跑一次。受試者在歷史中的回答（以及 `temir` 寫進生命日誌的內容）是一次抽樣；所有 p 值與區間都只反映「同一份歷史下、各題的探針結果」的不確定性，**不包含**「換一次歷史會怎樣」的變異。題目共用同一份歷史，彼此不獨立（2610.09193 §2 指出這種群集結構下，題層級的區間偏窄）。
- 因此結論只能寫成「在這次執行的歷史下，觀察到……」；要推廣到「插件一般而言……」需要多個獨立歷史（v2）。

### 6.4 描述性輸出

- 每個 cell 的工具呼叫次數（歷史＋探針，依工具名稱）：用來檢查 `baseline` 是否用檔案或 shell 工具自己找資料、`temir-no-autorecall` 是否主動呼叫 `recall`。
- 確定性命中 vs judge 的一致率（開 `--cross-check` 時）。

## 7. 預先登記的驗收線與否定條件

全部寫在契約的 `acceptance`，由評估器自動判定 PASS／FAIL／INCOMPLETE。

| id | 比較 | 驗收線（全部成立才 PASS） | 否定條件與解讀 |
|---|---|---|---|
| **MA1**（主要，DeepSeek） | `temir` vs `baseline`，`deepseek-flash`，23 題 | 正確率差 ≥ 0.40；成對 bootstrap 95% 下界 ≥ 0.25；精確 McNemar 雙尾 p ≤ 0.01；`temir` ≥ 0.50；`baseline` ≤ 0.25 | 任一不成立 → 不能宣稱「與原始 DSH 有決定性差異」。只有差但不到門檻時，只能報告觀察到的差與區間。 |
| **MA2**（主要，EVE-27B） | 同上，`EVE-27B` | 同 MA1 | 同 MA1；兩個模型分開報告，不合併成單一結論。 |
| MA3（不傷害，DeepSeek） | 對照 6 題 | `temir` 的失敗數 ≤ `baseline` 的失敗數＋1 | 多 2 題以上 → 判定可能有害，逐例檢查原始回覆（例如回憶片段是否讓它答非所問）。 |
| MA4（不傷害，EVE-27B） | 同上 | 同 MA3 | 同 MA3。 |
| MA5（虛構記憶，DeepSeek） | 拒答 4 題 | `temir` 的失敗數 ≤ `baseline` 的失敗數＋1 | 多 2 題以上 → 判定記憶造成虛構（順著錯誤前提編造）。 |
| MA6（虛構記憶，EVE-27B） | 同上 | 同 MA5 | 同 MA5。 |
| MA7（次要） | `temir` vs `temir-no-autorecall`，`deepseek-flash`，23 題 | 差 ≥ 0.20；下界 ≥ 0.05；McNemar 雙尾 p ≤ 0.05 | 不成立時只能說「沒有證據顯示自動回憶是必要的」，不能反過來宣稱它沒有作用（個體可能主動呼叫 `recall` 補上）。 |

門檻的理由：使用者要的是「絕對性的不同」，所以主要線要求**大的效果量＋區間下界遠離 0＋原始 DSH 接近猜測水準**，而不只是統計顯著。原始 DSH 沒有跨 session 記憶，預期接近 0；`temir` 若連一半都答不出，即使顯著也不算決定性。這些數字在看到任何結果之前寫定，之後不改；若事後覺得門檻不合理，只能在 v2 改，並在報告中同時列出 v1 判定。

快照消融（`M-snapshot-flash`）與換模型比較只作描述，沒有驗收線。

## 8. 預算

### 8.1 回合數

| 項目 | 記憶（每個 cell） | 人格（每個 cell，見人格規格 §8） |
|---|---|---|
| 歷史／形成 | 11 段、24 輪 | 7 段、17 輪 |
| 探針 | 33 個 session、35 輪 | 31 個 session（含重複）、32 輪 |
| 合計 | 59 輪 | 49 輪 |

每個條件的回合數（兩個實驗合計）：

| 條件 | `deepseek-flash`（付費） | `EVE-27B`（免費） | 換模型（選用） |
|---|---|---|---|
| `baseline` | 108 | 108 | 歷史 EVE→探針 DeepSeek：67（付費）；歷史 DeepSeek→探針 EVE：67（免費） |
| `temir` | 108 | 108 | 同上 |
| `temir-no-autorecall` | 108 | 108（選用） | — |
| `temir-no-snapshot` | 108 | 108（選用） | — |

`temir` 類條件每輪另有兩次輔助模型呼叫（不算在回合數內，但算在花費內，§8.2）。

記憶實驗的 DeepSeek 付費部分：四個條件 × `deepseek-flash` 共 236 輪；選用的「歷史 EVE → 探針 DeepSeek」兩個條件只重跑探針，共 70 輪。本機 EVE-27B 的 cell 免費，但每輪可能數十秒（四個條件全跑約 236 輪）。

### 8.2 花費估計（DeepSeek）

- 價格（`https://api-docs.deepseek.com/quick_start/pricing`，2026-10-28 查詢；以較貴的尖峰價格估）：`deepseek-flash` 快取命中 $0.006／快取未命中 $0.3／輸出 $1.2，`deepseek-v4-pro` $0.044／$1.32／$3.96（每百萬 token）。
- 依據：本機 DSH session 檔（`~/.cache/temir/dsh-home/sessions`，先前的 e2e 測試）中 `deepseek-flash` 的 usage，每輪約 1–3 次模型呼叫、未快取輸入約 1–6k、快取讀取 6–30k、輸出 0.2–2k token，換算每輪約 US$0.001–0.003。那些 session 早於目前插件的輔助模型呼叫；`temir` 每則訊息還有「聽到」與「自己說的」兩次輔助呼叫，估計每輪再加 US$0.001–0.002。
- 保守估計：`baseline` 每輪 US$0.006、`temir` 類每輪 US$0.012（約為實測的 2–4 倍）。記憶實驗付費部分：baseline 59＋35 輪、temir 類 177＋35 輪 → 約 0.56＋2.54＝**US$3.1**（典型約 US$1.3）。
- Judge：每個 cell 最多約 40 次（未命中與不確定才呼叫；拒答與個人化應用題全部呼叫；主要 cell 開 cross-check 再加 23 次）。驗證時實測每次約 US$0.0004；受試回覆較長，估每次 US$0.001–0.003 → 12 個 cell 約 **US$0.5–1.5**。契約把每次評估器執行的 judge 花費上限設為 US$3。
- 兩個實驗（加上人格實驗，見該規格 §8）合計保守估計約 US$9，低於使用者給的 US$12 上限（帳戶餘額約 US$23）。

## 9. 停止條件

1. DeepSeek 累計花費（執行器記錄的實際花費＋judge 花費）達 US$12 → 停止所有付費執行，已有結果照實報告。
2. 第一個付費 cell 跑完後，若實測每輪花費推算全部付費執行會超過 US$12 → 先停，改跑本機模型或縮減選用 cell，並在 log 記錄。
3. 某個 cell 有超過 20% 的回合 `error`（例如 API 故障）→ 停止該 cell，修好後整個 cell 重跑（舊紀錄移到另一個 runId），不挑選樣本。
4. Judge 單次評估器執行達契約上限 US$3 → 評估器停止呼叫，其後的判定記為錯誤並以結束碼 3 結束；需要時以 `--judge replay` 加上新的上限續跑。
5. 覆蓋稽核失敗 → 評估器拒絕計分（結束碼 2）。
6. 看到結果之後不得修改資料集、契約、提示詞或驗收線；要改就開 v2。

## 10. 已知的未覆蓋範圍與威脅

- **規模**：只有 11 段歷史、約數千字，遠小於 LongMemEval_S（約 115k token／題）或 LongMemEval-V2（數千萬 token）。本實驗檢驗的是「有沒有跨 session 記憶」，不是「在大量干擾下記得多好」。
- **時間戳記推理**：所有 session 連續執行，LongMemEval TR 中依 session 時間推理的部分無法測。
- **單一歷史**：每個 cell 一段人生，沒有歷史層級的重複（§6.3）。
- **拒答的嚴格語意**：沒有實作 LongMemEval-V2「必須指出前提錯在哪」的計分。
- **檢索中間指標**：LongMemEval 的 Recall@k／NDCG@k 需要知道答案在哪一段；評估器目前只看最終回答，沒有讀生命日誌中的 `memory/recall` 命中紀錄。
- **輔助呼叫的消融**：插件的 `expansion`（事實擷取與線索詞）可以單獨關閉，但不在使用者指定的四個條件內，沒有測。
- **使用者行為**：歷史是腳本，使用者不會根據受試者的回答改變說法（LongMemEval 也是預先生成的歷史）。MemoryArena 那種「行動—環境回饋」迴圈只在個人化應用題中部分涵蓋。
- **個人化寫入**：PerMemBench（`2605.25535` §6 Memory Retention Rate）量測記憶庫是否在需要的期間內保留資訊；本專案的生命日誌只增不刪，保留率在儲存層面恆為 100%，有意義的是檢索與使用，因此沒有採用該指標。
- **judge 偏差**：judge 只有一個模型（DeepSeek），沒有 Memora 那種三家模型多數決（`tex/appendix/LLM_judge_rel.tex`）；手寫驗證用例每種提示詞只有 2–4 例。
- **確定性比對的盲點**：命中且沒有衝突值就判對，若回覆以反問語氣提到正確答案（「是麻糬嗎？」）也會判對；cross-check 用來量測這種情形的頻率。

## 11. 執行與評估指令

```sh
source scripts/env.sh
node experiments/datasets/build.ts --check                       # 資料集未被改動
node experiments/eval/coverage.ts experiments/datasets/memory-v1.json experiments/specs/memory-accuracy-v1.contract.json
node --test "experiments/eval/test/**/*.test.ts"                 # 評估器自我測試
# 受試執行（主代理的執行器；每個 cell 一個 runId）
# 計分（可以一次給多個 runId；換模型 cell 的歷史紀錄在另一個 runId 時，一起列入）
node experiments/eval/score.ts \
  --dataset experiments/datasets/memory-v1.json \
  --contract experiments/specs/memory-accuracy-v1.contract.json \
  --runs experiments/runs/<runA> --runs experiments/runs/<runB> ... \
  --out experiments/results/memory-v1 --judge deepseek --cross-check
# 不再花錢地重現同一份分數：
node experiments/eval/score.ts ... --out experiments/results/memory-v1 --judge replay
```

## 12. 讀過的文獻（本規格的依據）

全文 TeX 在 `papers/<id>/raw/src/`。

- LongMemEval（2410.10813）：§3（3.1 問題形式化、3.2 五種能力與七種題型、問題與證據 session 的構造、歷史編纂、3.3 評估指標、3.4 挑戰性）、§4（統一架構與四個控制點）、§5（實驗）、附錄 A（資料集構造、歷史構造、統計、A.4 評估提示詞與後設評估表）、附錄 B（商用系統的人工評估）、附錄 D（Key Expansion、時間感知查詢擴充、閱讀提示詞）、附錄 E（錯誤分析）。
- LongMemEval-V2（2605.12493）：§3（3.1 五種能力含 Premise Awareness、3.2 標註、3.3 context gathering 形式化與「結構化答案用正規化字串比對、自由回答用 judge」、3.4 pilot）、§5（主結果）、附錄 A（標註流程、haystack、A.5 評估：UNKNOWN 一律算錯、確定性評估器種類、judge 用法）、judge 提示詞表。
- MemoryAgentBench（2507.05257）：§1（四種能力）、§3（資料集、記憶代理類型、逐塊輸入的協定與記憶指令）、§4（整體結果、chunk size／top-k／backbone 消融、FactConsolidation 驗證）、附錄 A（各資料集的 SubEM 與 GPT-4o judge）。
- MAB 衝突分數批評（2610.09193）：全文（摘要、§1–§4、附錄 A 標註規則與可達性檢查、附錄 B 例子）。採用的教訓：先用不具備該能力的「平凡基準」（這裡是原始 DSH）界定分數能讀出什麼；逐題而不是只看總分；黃金答案必須能由宣稱的規則得到（KU 題的舊值必須早於新值，§3.4-4）；Clopper–Pearson 精確區間；事先凍結規格。
- MemoryArena（2602.16313）：§1、§3（四個環境、3.2 Memory-Agent-Environment 迴圈）、§4 的指標定義（PS、sPS、SR）。採用：「後續行動在缺少先前資訊時是不足指定的」→ 個人化應用題。
- Memora（2604.20006）：§3（種子資料、session 模擬、對話生成、問題與評估準則：memory presence 與 forgetting absence）、§4（4.1 評估設定、4.2 FAMA 公式）、§6 錯誤分析、附錄 judge 可靠度（三家 judge 多數決、解析失敗的處理、人工驗證）。採用：KU 判定中「把舊資訊當成目前答案＝錯」；人格實驗的分項判定。
- PerMemBench（2605.25535）：§1、§6（Memory Retention Rate 與 checkpoint 抽樣）。未採用，理由見 §10。
- Hindsight（2512.12818）：§5（CARA 的 disposition 參數與 opinion network，本專案不採用固定數值）、§7（實驗、評估指標）、附錄〈LongMemEval Judge Prompts〉（拒答提示詞的來源）。
