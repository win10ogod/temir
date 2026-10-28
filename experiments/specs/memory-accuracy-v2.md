# 預先登記：記憶準確率實驗 v2（memory-accuracy-v2）

- 撰寫：評估子代理，2026-10-28。**任何 v2 受試執行之前**完成。v1 的結果與判定不改（[`../results/v1-report.md`](../results/v1-report.md)）。
- 機器可讀契約：[`memory-accuracy-v2.contract.json`](memory-accuracy-v2.contract.json)（類別、計分、cell、比較、驗收線、執行協定、描述性指標的規則都以它為準）。
- 資料集：[`../datasets/memory-v2.json`](../datasets/memory-v2.json)，由 [`../datasets/build.ts`](../datasets/build.ts) 從 [`memory-v2.source.ts`](../datasets/memory-v2.source.ts) 產生，重跑逐位元組相同。撰寫完成時的 sha256：`4cd7b19a79c2ee95c32661a366d0ed50b5112413a65c6681d6c345affde42ba0`。
- 評估器：[`../eval/`](../eval/)。v2 的新功能只在契約有 `reportVersion: 2` 時啟用；v1 的輸出完全不變（§6.5）。
- 凍結規則：同 v1——主代理在第一次 v2 受試執行前 commit 本規格、契約、資料集與評估器；之後任何修改開 v3，v2 已有的結果照實保留。

## 1. 從 v1 學到什麼、v2 改了什麼

v1 的判定（`v1-report.md`）：MA2（EVE-27B）PASS，個體 22/23、原始 DSH 2/23；MA1（DeepSeek）FAIL，因為原始 DSH 0.478 > 0.25——它答對的 11 題中有 10 題，是用 bash 在相鄰目錄找到 DSH 自己的 session 存放檔、寫 Node 腳本解壓後讀出舊對話（平均每題 10.2 次工具呼叫；個體 1.0 次）。「記憶用於行動」個體 3/3、原始 DSH 0/3：原始 DSH 只在被明問記憶時才去翻日誌。關閉自動回憶沒有差異，因為個體會主動呼叫 `recall`。

| v1 的發現 | v2 的改變 | 理由 |
|---|---|---|
| 執行器把 DSH home 放在工作目錄旁邊，`ls ..` 就看得到 | 改用接近真實安裝的目錄配置（§3.3），兩個條件完全相同 | 一般安裝時 session 也存在 `~/.dsh`，翻自己的日誌是原始 DSH 的真實能力，**不人為阻擋**；但目錄配置應該像真實環境，而不是實驗安排造成的捷徑 |
| 主要比較只有 23 題，其中「記憶用於行動」只有 3 題 | 題數 33→63：資訊擷取 10、跨 session 推理 8、知識更新 8、時間推理 6、拒答 8、隱性運用記憶 15、對照 8 | 提高檢定力（例如隱性運用 15 題時，McNemar 雙尾 p≤0.01 需要至少 8 個不一致對全部偏向同一邊） |
| 「記憶用於行動」3/3 vs 0/3 是「記憶參與決策」最直接的證據 | 改名為「隱性運用記憶」，15 題，列為主要類別，新增主要驗收線 MB1 | 不明問記憶的題目，原始 DSH 沒有理由去翻日誌；這最接近使用者的願景（記憶參與經驗與決策），在看到 v2 結果前寫定 |
| v1 的評分準則是一段文字（LongMemEval 式 rubric） | 每題寫成 1–2 條可各自判定的準則，全部符合才算對（§5.2） | 判定更透明、可逐條追查（Memora 的原子準則做法） |
| 原始 DSH 的答對主要來自翻日誌，但沒有系統化記錄 | 事先寫定「是否翻閱 session 存放區」的判定規則與工具呼叫數、延遲等描述性指標（§6.4） | 讓「設計好的記憶」與「事後挖原始日誌」可以分開描述；只作描述，不作驗收 |
| 只有 DeepSeek 與本機 EVE-27B；EVE-27B 已關閉 | 第二模型改為 OpenRouter `nvidia/nemotron-3.5-super-vl:free`，列為必要 cell；EVE-27B 改為選用 | 「模型獨立」的主張需要第二個模型家族；使用者已加值，`:free` 路由每天 1000 次、每分鐘 20 次請求，必要 cell 排成兩天（§8.3） |
| — | 評估器能以 `--judge replay` 逐位元組重現 v1 的摘要；v1 的 judge 提示詞凍結 | v1 結果不可變（§6.5） |

**可比較的驗收線不放寬**：v1 的 MA1–MA7 以完全相同的門檻、相同的類別定義保留為 v2 的對應線（§7）。題目內容全部換新、題數變多，所以 v2 與 v1 的數字不能直接相加或比較高低；能比較的是「同一條預先寫定的標準在新的、較大的題目集上是否成立」。

## 2. 研究問題

1. **主要（與 v1 相同）**：在跨 session 的記憶題上，個體（`temir`）與原始 DSH（`baseline`）是否有決定性差異（MA1：DeepSeek；MA2-NEMO：Nemotron）。
2. **主要（v2 新增）**：不明問記憶時，個體是否會運用記得的事，而原始 DSH 不會（MB1：DeepSeek；MB2-NEMO：Nemotron）。
3. **模型獨立性**：上述主張在 DeepSeek 與 Nemotron 兩個模型家族上是否都成立（§7.2）。
4. **次要**：明問記憶時，設計好的記憶是否仍優於原始 DSH 自己翻日誌（MB3）；自動回憶是否必要（MA7）。
5. **不傷害**：一般任務不退化（MA3、MA4-NEMO）；不更常編造（MA5、MA6-NEMO）。
6. **描述性**：工具呼叫數、翻閱 session 存放區的比例、延遲；快照消融；換模型回答同一份歷史（選用 cell）。

## 3. 任務契約

### 3.1 條件

與 v1 相同（`memory-accuracy-v1.md` §2.1）：`baseline`（原始 DSH 0.2.2-alpha.2 的 `sdk` profile，不載入任何個體插件）、`temir`（DSH＋`individual/cordis.patch.yml`）、`temir-no-autorecall`、`temir-no-snapshot`（`experiments/runner/patches/`）。v1 的個體插件凍結於 commit 74a036e；v2 執行時的插件 commit 必須寫在報告中（`config.json` 的 `code.commit`），若與 v1 不同要說明差異。

### 3.2 模型與 cell

模型字串（紀錄中的 `historyModel`／`probeModel`）：`deepseek-flash`、`nvidia/nemotron-3.5-super-vl:free`（執行器的 `MODELS.nemotron`，provider `or-nemotron`）、`EVE-27B`。

| cell | 狀態 |
|---|---|
| 四個條件 × `deepseek-flash` | 必要 |
| `baseline`、`temir` × `nvidia/nemotron-3.5-super-vl:free`（歷史與探針都用它） | **必要**，承擔「模型獨立性」的主張 |
| `baseline`、`temir` × `EVE-27B` | 選用（本機模型何時再開不確定）；有跑才判定 |
| `temir`：歷史 `deepseek-flash` → 探針 `EVE-27B` 或 Nemotron | 選用，描述性（H-ID：同一份生命紀錄換一個思考的模型） |

每個 cell 的歷史只跑一次。

### 3.3 目錄配置（`--layout home`，兩個條件完全相同）

每個 cell 有一個全新的狀態目錄 `<state>`：

| 變數 | 路徑 |
|---|---|
| `HOME` | `<state>/home` |
| `DSH_HOME` | `<state>/home/.dsh` |
| `TEMIR_HOME` | `<state>/home/.local/share/temir` |
| `DSH_AGENTS_HOME` | `<state>/home/.agents`（空） |
| 工作目錄（cwd） | `<state>/home/workspace`（空） |

原始 DSH 一樣可以自己去翻 `~/.dsh`；這是真實能力，不阻擋、不提示。執行器的 `config.json` 記錄 `layout: "home"`；評估器讀每個紀錄檔旁邊的 `config.json`，**目錄配置不是 `home` 的 cell 照常計分與顯示，但涉及它的驗收線記為 INCOMPLETE**（契約 `protocol.layout`）。

### 3.4 執行協定

同 v1 §2.3（歷史依序、每段一個 session、歷史結束拍快照、每題前還原快照開新 session、四個條件相同的工具與核准設定、不額外提示回想）。v2 補充：

1. Nemotron 的 cell 循序執行，不平行（每分鐘 20 次請求的限制）；每天的排程與停止點見 §8.3。
2. **基礎設施錯誤（限流、配額、供應端故障）**：回合錯誤訊息符合契約 `protocol.infraErrorPattern`（`\b(?:429|502|503|504)\b`、`rate limit`、`too many requests`、`free-models-per`、`quota`、`overloaded`、`provider returned error`，不分大小寫）時，是基礎設施故障，不是受試者的行為：
   - **探針**：該題可以從同一份「歷史結束」快照重跑（`run.ts --from-run <原 runId> --probes <題號>`，另一個 runId；原紀錄不刪不改）。評估器依 repeat 對位：同一位置有其他紀錄時不採用基礎設施錯誤的紀錄，並在摘要的紀錄問題中列出；沒有重跑時仍以錯誤計 0 分、留在分母。重跑會把該題的每一次重複都再跑一次，評估器仍採用每個位置最早的有效紀錄，多出的列為「多出的紀錄（未計分）」。
   - **歷史**：歷史是一段連續的人生，不能只重跑一段；整個 cell 改用新的 runId 從頭重跑，評估時只列入完整的那一份，放棄的 run 目錄保留並在報告中列出。
   - 逾時、模型錯誤等其他錯誤照 v1 規則計 0 分、留在分母；重跑不能取代它們（評估器採用最早的一筆，重跑只會變成多出的紀錄）。
   - 個體的輔助呼叫（每則訊息的擷取與立場擷取）若遇到限流，不一定會變成回合錯誤，而可能讓回憶靜默失效；執行後由主代理從生命日誌統計輔助呼叫的失敗次數，寫入報告。
3. **（建議，需要主代理決定）`assistant` 欄位的內容**：v1 人格 q14（個體，DeepSeek）的最後一則訊息只有附註（「上面就是我的回答……」），真正的回答在同一輪較早的訊息裡，評估器只看到附註。建議 v2 執行器把每輪所有可見文字依序以空行連接後寫入 `assistant`（格式不變，只是內容定義變更），並在 `config.json` 記錄採用哪一種。若不採用，v2 仍以「最後一則可見文字」計分，並把這個限制列入報告。這件事必須在第一次 v2 受試執行前決定，之後不改。

## 4. 資料集

### 4.1 類別（必要類別寫在契約中，不從資料反推）

| 類別 id | 出處 | 操作化 | 題數 | 計分 |
|---|---|---|---|---|
| `information-extraction` | LongMemEval §3.2 IE（single-session-user） | 使用者順帶提到的事實（名字、醫院、女兒、太太、狗、課本、作業系統、圍棋老師、受傷的膝蓋、書店） | 10 | 確定性優先，judge `mem-default` |
| `multi-session-reasoning` | LongMemEval §3.2 MR | 跨兩到三段歷史的加總、比較、彙整（花費、年紀、醫囑、兩位老師、課費、飲食限制、硬碟容量、家人的嗜好） | 8 | 確定性優先，judge `mem-default` |
| `knowledge-update` | LongMemEval §3.2 KU；Memora〈Forgetting-Aware Memory Accuracy〉 | 幼兒園、陶藝課的日子、外接硬碟、圍棋段位、韓文冊數、住處、出發日、最喜歡的繪本 | 8 | 確定性優先；新值與舊值同時出現時 judge `mem-knowledge-update` |
| `temporal-reasoning` | LongMemEval §3.2 TR（限明寫的日期） | 天數差（差一不扣分）、「前一週」推日期、最早的一天、日期推星期 | 6 | 確定性優先，judge `mem-temporal` |
| `abstention` | LongMemEval §3.2 ABS；LongMemEval-V2 §3.1 Premise Awareness | 錯誤前提：兒子、貓、吉他老師、汽車、台北的公寓、太太的銀行工作、馬拉松、父親的手術 | 8 | judge `mem-abstention`（語意同 v1 §5.3） |
| `implicit-memory-use` | LongMemEval §3.2 single-session-preference；MemoryArena §3.2；判定拆成原子準則：Memora | 不明問記憶，但正確做法取決於記得的事（§4.2） | 15 | judge `mem-criteria-v2`，每條準則都符合才算對 |
| `control` | 本專案設計 | 單一 session 一般任務（算式、session 內記住代碼再問、倒寫、面積、單位換算、干擾檢查、奇數和、session 內更正） | 8 | 確定性優先，judge `mem-default` |

主要比較（MA1、MA2）合併 IE＋MR＋KU＋TR＋隱性運用＝**47 題**（與 v1 MA1 相同的類別定義；隱性運用在 v2 佔 15/47，v1 是 3/23）。MB1 只看隱性運用 15 題；MB3 只看明問的 32 題（IE＋MR＋KU＋TR）。拒答與對照分開報告。

### 4.2 隱性運用記憶：每題的判定準則

準則在任何受試回答出現之前寫定（完整文字在資料集的 `meta.criteria`；`meta.background` 是給 judge 的背景，不給受試者看）。每一條都寫成「符合＝yes」的肯定句；**全部 yes 才算對**。

| 題 | 請求 | 依賴的記憶 | 準則（摘要） |
|---|---|---|---|
| q41 | 推薦三道今晚可以在家煮的菜 | 蛋奶素 | c1 三道都是蛋奶素可吃（不含肉、海鮮、肉或海鮮做的湯底與調味） |
| q42 | 大夜班凌晨三點的提神方法 | 因心悸醫生要他停咖啡 | c1 不建議咖啡或其他含咖啡因飲品（提到也是說明要避開） |
| q43 | 週末帶女兒出去走走的地方 | 住花蓮；女兒四歲 | c1 地點在花蓮；c2 適合四歲幼兒 |
| q44 | 這週末可以走的步道 | 左膝韌帶傷（不爬樓梯、走路不超過半小時）；住花蓮 | c1 平緩短程無階梯，或明確配合膝傷；c2 在花蓮 |
| q45 | 邊看邊練聽力的影集 | 學韓文、初級 | c1 韓語影集或節目；c2 考量初級程度 |
| q46 | 剪女兒影片的軟體 | 筆電是 Fedora Linux | c1 明確考量 Linux，且推薦的軟體能在 Linux 上用 |
| q47 | 帶家人去鄰近鄉鎮一日遊的交通 | 沒有駕照、搭火車公車；住花蓮 | c1 大眾運輸，不建議開車騎車租車；c2 以花蓮為出發地或範圍 |
| q48 | 全家可去、刺激一點的活動 | 懼高；女兒四歲 | c1 不推薦待在高處的活動；c2 適合四歲小孩 |
| q49 | 做事時聽的專輯 | 喜歡後搖 | c1 主要推薦後搖 |
| q50 | 結婚紀念日的三個點子 | 太太迷上拉坯 | c1 至少一個與陶藝或拉坯有關 |
| q51 | 獎勵狗狗的零食 | 阿福腎臟要低磷 | c1 適合低磷飲食，或明確提醒選低磷 |
| q52 | 一週的運動時間表 | 大夜班 23:00–07:00；膝傷 | c1 避開上班時間並配合白天補眠；c2 不安排加重左膝負擔的運動 |
| q53 | 現在程度可挑戰的圍棋書 | 剛升業餘二段 | c1 適合業餘段位，不是入門書 |
| q54 | 下班後補眠的臥室佈置 | 大夜班，白天補眠 | c1 明確針對白天睡覺 |
| q55 | 給女兒的生日卡 | 女兒叫小滿、四歲 | c1 用「小滿」稱呼；c2 適合四歲小孩 |

設計原則：通用的好答案很容易違反準則（例如不知道使用者在花蓮、吃素、用 Linux、怕高），所以原始 DSH 靠運氣通過的機率低；但原始 DSH 若真的通過，就照實計分——它的通過率就是這一類的「不靠記憶的下限」。

### 4.3 構造與洩漏檢查

- 17 段歷史、34 輪使用者發言、63 題（67 輪）。h06、h13 是無關的干擾 session；h17 是收尾的無關 session（個體在新 session 的第一句會帶入最近一次對話，見 v1 §3.2；放一段無關對話在最後，避免最後一段歷史的題目不經檢索就被帶入）。h14–h16 集中放知識更新。
- 人物、專名、日期、數字都是虛構或任意的；日期是明寫的 12 月、1 月，不跨二月（避免閏年）。「今年 12 月 3 日」＝2026-12-03（星期四）；日期與天數由 `test/datasets-v2.test.ts` 以日曆核對。
- 自動檢查（`coverage.ts`／`build.ts`，與 v1 相同的規則再加上）：隱性運用的每題必須有 `criteria`（c1 起連續編號）、`background` 與 `evidence`。
- **與 v1 不重疊**（使用者要求）：`test/datasets-v2.test.ts` 檢查 v1 的人物與專名（人工列出 43 個，例如溫予寧、麻糬、蕭以禾、釧路）、v1 的證據原文、v1 的每一句題目與歷史原句都沒有出現在 v2。v2 沿用 v1 的提問框架與題型（例如「中間隔了幾天」），但內容全部換新；撰寫過程中這項檢查抓到幾句與 v1 字面相同的題目，已改寫（撰寫完成時的相似度實測見 §11）。

## 5. 紀錄契約與計分

### 5.1 分母

同 v1 §4：缺紀錄、壞紀錄、sha256 不符、回合數不符、錯誤回合、空回覆、judge 解析失敗或 API 錯誤，全部記 0 分並留在分母；judge 被刻意關閉時標示未完成。另外每個 cell 的歷史缺漏或錯誤會列入報告。

### 5.2 計分方式

- IE、MR、KU、TR、control：與 v1 相同的確定性優先比對（NFKC、數字邊界、衝突值），命中且無衝突→對；其餘交給 judge。`gold.aliases` 只收完整等價的寫法。
- 拒答：與 v1 相同的 `mem-abstention`（LongMemEval 語意：沒有順著錯誤前提編造＝對）。
- 隱性運用：`mem-criteria-v2`。judge 收到背景、請求、逐條準則與回覆，對每一條回答 yes／no，程式要求全部 yes。依據：LongMemEval 附錄 A.4 的 single-session-preference 判定（依使用者先前透露的資訊給出個人化回應）；把判定拆成可各自回答的原子準則參考 Memora（`tex/experiments.tex`〈Forgetting-Aware Memory Accuracy〉、`tex/appendix/LLM_judge_rel.tex`）。與 LongMemEval 不同：LongMemEval 說不必反映準則的每一點；本實驗每一條都要符合（準則已事先寫定，條數 1–2 條）。
- judge 設定與 v1 相同：`deepseek-v4-pro`、thinking disabled、temperature 0、JSON 輸出、最多 3 次嘗試；金鑰只從 `DEEPSEEK_API_KEY` 讀取，不寫入任何檔案。

### 5.3 Judge 驗證（已實際執行）

- v1 提示詞（`mem-default`、`mem-temporal`、`mem-knowledge-update`、`mem-abstention`）沿用，一個字都沒改（`test/prompts-v2.test.ts` 以指紋檢查；改了會讓 v1 的 judge 紀錄無法重放）。它們在 v1 的手寫驗證中保留測試組 15/15（`memory-accuracy-v1.md` §5.4）。
- v2 新提示詞與 v2 新題材：`eval/judge-validation/cases-v2.json`，37 個手寫用例（不取自任何受試執行），分 v2-dev 與 v2-test：

| 輪次 | 範圍 | 結果 |
|---|---|---|
| v2-dev-r1 | 15 例（`mem-criteria-v2` 6、`pc-recall-v2` 6、`pc-narrate-v2` 3） | 15/15 |
| v2-test-r1 | 22 例（`mem-criteria-v2` 7、`pc-recall-v2` 6、`pc-narrate-v2` 3，以及 v1 提示詞在 v2 題材上 6 例） | 22/22 |

提示詞沒有因為 dev 結果修改過，test 組只評一次。花費（依 API 回傳的 usage）：v2-dev US$0.0099、v2-test US$0.0112，共約 **US$0.021**。每種提示詞只有 3–7 例，這是「規則有被照做」的檢查，不是人工後設評估；正式評估時所有 judge 理由都保存在 `items.jsonl` 與 `judge-raw.jsonl`。

## 6. 指標與統計

### 6.1–6.3 同 v1

各 cell × 類別的得分數／總數與 Clopper–Pearson 精確 95% 區間；成對比較用精確 McNemar（雙尾與單尾都報告）與以題為單位的成對 bootstrap（10,000 次、種子 20261028）。每個 cell 的歷史只跑一次，所有推論都是「在這一次實際發生的歷史下」；題目共用同一份歷史，區間偏窄（v1 §6.3）。

### 6.4 描述性指標（v2 新增，不作驗收）

規則寫在契約的 `descriptive`，對每個樣本的全部工具呼叫參數原文比對（不分大小寫）：

| 指標 | 規則 |
|---|---|
| 翻閱 session 存放區 | 任一工具參數符合 `\.dsh\b\|dsh[-_]home\|session\.v4\|\.jsonl\.zstd\|session_projcache`（`dsh[-_]home` 同時涵蓋 v1 的目錄名與 `$DSH_HOME` 變數） |
| 翻閱生命日誌 | 任一工具參數符合 `life\.db\|\.local[\\/]share[\\/]temir` |
| 工具呼叫數 | 各輪 `toolCalls` 的總數（另依工具名稱分計） |
| 延遲 | 各輪 `ms`（執行器的額外欄位）的總和；任一輪沒有就記為無 |

摘要中每個 cell × 類別列出：有紀錄的樣本數、每樣本工具呼叫平均、翻閱 session 存放區與生命日誌的樣本數、延遲中位數，以及「有翻閱」與「沒翻閱」時各自的得分數。這些是描述，不改變任何判定；尤其「有翻閱時得分」只是相關，不是因果。

規則的校準（撰寫時以 v1 紀錄實測，不呼叫 API）：v1 原始 DSH（DeepSeek）記憶探針中有工具呼叫的 25 題，有 16 題符合「翻閱 session 存放區」；它在主要類別答對的 11 題中，有 10 題符合，與 v1 報告 §3.1 人工檢查的結果（11 題中 10 題）一致；個體（DeepSeek）0 題符合。未符合的例子是只下 `ls`、`find .` 之類沒有指名存放區的指令。

### 6.5 v1 結果不可變

- `node experiments/eval/score.ts ... --judge replay --judge-cache experiments/results/memory-v1/judge-raw.jsonl --cross-check` 以 v1 的六個 run 重放，輸出的 `summary.md`、`summary.json`、`items.jsonl` 與 `experiments/results/memory-v1/` **逐位元組相同**（人格 v1 同樣成立）；`test/v1-replay.test.ts` 每次測試都檢查。
- 做法：重放時摘要中的 judge 呼叫數與花費，由 judge 紀錄檔重建（`budget-exhausted` 那一行不算呼叫，有 usage 的行依檔案順序累加花費）；v2 的新欄位只在 `reportVersion: 2` 時輸出。
- v2 自己的摘要也能重放：即時評估與重放時，摘要都描述「這份摘要所依據的 judge 紀錄」（輸出目錄的 `judge-raw.jsonl`），措辭與數字不隨模式改變。限制：即時評估時若另外用了 `--judge-cache` 讀其他目錄的快取，重放時的統計會不同；正式評估不要這樣做。

## 7. 預先登記的驗收線與否定條件

### 7.1 驗收線

| id | 比較 | 驗收線（全部成立才 PASS） | 與 v1 的關係 |
|---|---|---|---|
| **MA1** | `temir` vs `baseline`，DeepSeek，47 題 | 差 ≥ 0.40；成對 bootstrap 95% 下界 ≥ 0.25；精確 McNemar 雙尾 p ≤ 0.01；個體 ≥ 0.50；原始 DSH ≤ 0.25 | 與 v1 MA1 相同（門檻、類別定義） |
| **MA2-NEMO** | 同上，Nemotron（必要） | 同 MA1 | 與 v1 MA2 相同 |
| MA2-EVE | 同上，EVE-27B（選用） | 同 MA1 | 與 v1 MA2 相同；有跑才判定 |
| **MB1**（v2 新） | `temir` vs `baseline`，DeepSeek，隱性運用 15 題 | 差 ≥ 0.40；下界 ≥ 0.20；McNemar 雙尾 p ≤ 0.01；個體 ≥ 0.60；原始 DSH ≤ 0.30 | 新增 |
| **MB2-NEMO**（v2 新） | 同上，Nemotron（必要） | 同 MB1 | 新增 |
| MB2-EVE | 同上，EVE-27B（選用） | 同 MB1 | 新增 |
| MB3（v2 新，次要） | `temir` vs `baseline`，DeepSeek，明問 32 題 | 差 ≥ 0.20；下界 ≥ 0.05；McNemar 雙尾 p ≤ 0.05 | 新增 |
| MA3 | 對照 8 題，DeepSeek | 個體失敗數 ≤ 原始 DSH 失敗數＋1 | 與 v1 相同 |
| MA4-NEMO／MA4-EVE | 同上，第二模型 | 同 MA3 | 與 v1 相同 |
| MA5 | 拒答 8 題，DeepSeek | 個體失敗數 ≤ 原始 DSH＋1 | 與 v1 相同（v2 有 8 題，相對更嚴） |
| MA6-NEMO／MA6-EVE | 同上，第二模型 | 同 MA5 | 與 v1 相同 |
| MA7（次要） | `temir` vs `temir-no-autorecall`，DeepSeek，47 題 | 差 ≥ 0.20；下界 ≥ 0.05；McNemar 雙尾 p ≤ 0.05 | 與 v1 相同 |

新增線的理由：

- **MB1／MB2**：v1 的「記憶用於行動」是最直接的「記憶參與決策」證據（3/3 vs 0/3），但只有 3 題。原始 DSH 在不被明問記憶時沒有理由去翻日誌，所以這一類測的是「記憶有沒有在需要時自動進入決策」，而不是「能不能找回資料」。門檻與 MA1 同等嚴格（差 ≥ 0.40、p ≤ 0.01），原始 DSH 上限放到 0.30，是因為有些準則（例如「適合四歲小孩」）通用答案也可能偶然符合；個體下限提高到 0.60，因為這是插件設計要做到的事。
- **MB3**：v1 顯示強模型能逆向讀自己的原始日誌。MB3 只回答「明問時，設計好的記憶是否仍比翻日誌好」，門檻較低、列為次要，不影響 MA1 的判定。

### 7.2 結論的寫法（事先寫定）

- 「與原始 DSH 有決定性差異（記憶）」：MA1 PASS。
- 「**模型獨立**的決定性差異（記憶）」：MA1 **與** MA2-NEMO 都 PASS。EVE-27B 的線（選用）只作補充，不能取代 Nemotron。
- 「記憶參與決策（不明問也會用）」：MB1 PASS；模型獨立需要 MB1 與 MB2-NEMO 都 PASS。
- MA1 若因原始 DSH > 0.25 而 FAIL（如 v1），報告要同時寫出描述性指標中原始 DSH 翻閱 session 存放區的比例與得分，不得改寫判定。
- 不傷害線（MA3–MA6）任一 FAIL：判定可能有害，逐例檢查原始回覆，不能用其他線的 PASS 抵銷。
- 不得在看到結果後修改門檻、類別或準則；要改就開 v3，並同時列出 v2 的判定。

## 8. 預算

### 8.1 回合數（每個 cell）

| 實驗 | 歷史 | 探針 | 合計 |
|---|---|---|---|
| 記憶 v2 | 17 段、34 輪 | 63 個 session、67 輪 | 101 輪 |
| 人格 v2（見人格規格 §8） | 12 段、34 輪 | 64 個 session、65 輪 | 99 輪 |

### 8.2 DeepSeek 花費（受試＋judge，上限 US$10）

依 v1 實測：8 個 DeepSeek cell 共 US$2.09（整批餘額差，含個體的輔助呼叫）；以紀錄中的 usage 依尖峰價格算，主迴圈每輪花費為——記憶：原始 DSH 歷史 US$0.0044、探針 US$0.0077（翻日誌使探針較貴）；個體歷史 US$0.0055、探針 US$0.0026；關閉自動回憶 US$0.0073／0.0029；不附快照 US$0.0060／0.0026。人格：原始 DSH 每輪約 US$0.0012；個體約 US$0.0028／0.0023。總額與主迴圈的差（US$0.525／324 輪）推得個體類條件的輔助呼叫每輪約 US$0.0016。

| cell（記憶 v2） | 估計 | cell（人格 v2） | 估計 |
|---|---|---|---|
| baseline | US$0.67 | baseline | US$0.12 |
| temir | US$0.52 | temir | US$0.40 |
| temir-no-autorecall | US$0.60 | temir-no-autorecall | US$0.48 |
| temir-no-snapshot | US$0.54 | temir-no-snapshot | US$0.41 |
| 小計 | US$2.33 | 小計 | US$1.41 |

- 受試合計約 **US$3.7**，乘 1.5 倍安全係數約 US$5.6。
- judge：v1 實測記憶 US$0.099（197 次，約每個樣本 1 次，含交叉檢查）、人格 US$0.097（76 次，約每個樣本 0.5 次）。v2 每個 cell 記憶 63 個樣本、人格 64 個樣本，必要 cell 6 個、全部 cell 最多 10 個：估計記憶約 380–630 次（US$0.2–0.5）、人格約 190–320 次（US$0.3–0.8；回想與敘述的提示詞較長）。
- 已花：v2 judge 驗證 US$0.021。
- 合計保守約 **US$7**，低於上限 US$10。Nemotron 與 EVE-27B 的 cell 沒有 DeepSeek 花費（judge 仍用 DeepSeek，已含在上面的估計）。

### 8.3 Nemotron 的請求數與排程（每天 1000 次、每分鐘 20 次；不得改用付費版）

依據（兩者都是實測）：
- 主代理以冒煙資料集、`--layout home` 在 Nemotron 上實測（2026-10-28）：個體條件 7 輪（2 段歷史＋3 個探針 session）耗時 155 秒、0 錯誤、沒有 429；依生命日誌推算**每輪約 5 次請求**（主模型 1–3 次＋輔助呼叫 2 次）；原始 DSH **每輪約 1–3 次**。
- v1 的 DeepSeek 紀錄：原始 DSH 在記憶探針上翻日誌時每輪 5.0–9.4 次主模型請求（單輪最多 39 次）。DSH 的 `sdk` profile 不另外為 session 標題呼叫模型（v1 的 session 檔中沒有 `session/title-llm-request`）。

| 必要 cell（Nemotron） | 回合數 | 估計請求數 |
|---|---|---|
| 記憶 × temir | 101 | 約 505（101 × 5） |
| 記憶 × baseline | 101 | 約 100–300；若它像 v1 的 DeepSeek 一樣翻日誌，最多約 700（34 × 2＋67 × 9.4） |
| 人格 × temir | 99 | 約 495（99 × 5） |
| 人格 × baseline | 99 | 約 100–300 |
| 合計 | 400 | 約 1,200–2,000 |

**一天 1000 次跑不完，排成兩天**（必要時第三天補完，見停止點）：

| 日 | 執行順序（循序，不平行） | 估計請求數 | 停止點 |
|---|---|---|---|
| 第 1 天 | 記憶 × temir（歷史＋全部探針）→ 人格 × baseline（歷史＋全部探針） | 約 605–805 | 兩個 cell 完成即停，不開始第三個 cell |
| 第 2 天 | 人格 × temir（歷史＋全部探針）→ 記憶 × baseline（歷史＋探針，分批） | 約 595–1,195 | 記憶 × baseline 每一批開始之前估計這一批需要的請求數＝批內題數 ×（這個 cell 目前單題用過的最大請求數；第一批用 10）＋（第一批另加歷史的 70）；當天剩餘請求數少於這個估計，就停在這一批之前 |
| 第 3 天（只在需要時） | 記憶 × baseline 剩下的探針 | 視情況 | 從同一份「歷史結束」快照續跑，跑完即止 |

規則：
- 每個 cell 的歷史必須在同一天內跑完（歷史是一段連續的人生，跨日可能遇到模型版本更新）；探針可以跨日，因為每題都從同一份快照還原。跨日續跑時在報告中寫明哪些題是哪一天跑的。
- 停止點的做法（執行器現有的參數就做得到）：記憶 × baseline 的探針分批執行——第一批 `run.ts --dataset experiments/datasets/memory-v2.json --layout home --condition baseline --history-model nemotron --probes <前幾題>`（同時跑完歷史並拍快照），之後每批 `--from-run <第一批的 runId> --probes <下一批>`，沿用同一份「歷史結束」快照；每批（例如 10 題）結束後計算當天已用的請求數，再決定下一批。評估時把同一個 cell 的所有批次一起列入 `--runs`。
- 計數以執行器實際送出的請求為準（主模型的 usage 筆數＋生命日誌中的輔助呼叫），每天開始與結束時記錄 OpenRouter 的剩餘額度（若 API 提供）。「一天」以 OpenRouter 配額實際重設的時間為準，執行前確認。
- 若仍在某一題中途用完配額，該題的錯誤符合基礎設施錯誤（§3.4-2），隔天依同一規則重跑。
- 時間：個體條件約每輪 22 秒（155 秒／7 輪），四個 cell 合計約 2–3 小時（原始 DSH 翻日誌時會更久）。
- 第一個 Nemotron cell 跑完後，以實際的每輪請求數重新估計第 2 天的總量；超過 1000 的部分依上面的停止點延到第 3 天（只能延後，不能改題目、cell 或驗收線），記入報告。
- 不改用付費版：模型字串會不同（`nvidia/nemotron-3.5-super-vl` 不帶 `:free`），也會花使用者的額度；若 `:free` 路由在執行期間無法使用，Nemotron 的驗收線記為 INCOMPLETE 並照實報告，不換模型。

## 9. 停止條件

1. DeepSeek 累計花費（受試＋judge）達 US$10 → 停止所有 DeepSeek 執行。
2. 第一個 DeepSeek cell 跑完後，若實測花費推算全部會超過 US$10 → 先停，縮減選用 cell 或消融。
3. 某個 cell 有超過 20% 的回合錯誤（不含 §3.4-2 的基礎設施錯誤）→ 停止該 cell，修好後整個 cell 以新的 runId 重跑；舊的 run 目錄保留、在報告中列出，評估時不列入。
4. Nemotron 依 §8.3 的排程與停止點執行；每日配額不足以完成下一題 → 當天停止，隔天從同一份快照續跑（§3.4）。
5. judge 單次評估器執行達 US$3 → 停止呼叫，其後判定記為錯誤（結束碼 3）。
6. 覆蓋稽核失敗 → 評估器拒絕計分。
7. 看到結果之後不得修改資料集、契約、提示詞或驗收線；要改就開 v3。

## 10. 已知的未覆蓋範圍與威脅

- 規模仍小（17 段歷史），檢驗的是「有沒有跨 session 記憶、記憶是否進入決策」，不是大量干擾下的檢索品質。
- 每個 cell 的歷史只跑一次；沒有歷史層級的重複。
- 隱性運用的準則有一定的判斷空間（例如「適合四歲小孩」），由單一 judge 判定；準則已事先寫定，judge 理由逐例保存。
- 原始 DSH 可以翻 `~/.dsh`；它翻到與否由它自己決定，結果照實計分。描述性指標用工具參數的字串規則判定，可能漏判（例如用變數拼出路徑）或誤判，只作描述。
- `assistant` 欄位若仍只記最後一則可見文字，答案寫在較早訊息的情形會被漏看（§3.4-3）。
- Nemotron 是 `:free` 路由，模型版本由 OpenRouter 決定，可能在執行期間改變；執行器應記錄每次回應的實際模型（若 API 有提供）。
- Nemotron 的請求數是由冒煙測試（7 輪）與 v1 的 DeepSeek 行為推估；原始 DSH 在 Nemotron 上翻日誌的傾向未知。原始 DSH 連續呼叫工具時可能超過每分鐘 20 次而遇到限流（§3.4-2 的重跑規則處理回合錯誤，但個體輔助呼叫的靜默失敗只能事後統計）。
- 未覆蓋：LongMemEval 依 session 時間戳記的時間推理；LongMemEval-V2 較嚴格的拒答語意；檢索中間指標；輔助呼叫（`expansion`）的消融。

## 11. 指令

```sh
source scripts/env.sh
node experiments/datasets/build.ts --check
node experiments/eval/coverage.ts experiments/datasets/memory-v2.json experiments/specs/memory-accuracy-v2.contract.json
node --test "experiments/eval/test/**/*.test.ts"
# 受試執行：experiments/runner/run.ts --layout home ...（主代理）
node experiments/eval/score.ts \
  --dataset experiments/datasets/memory-v2.json \
  --contract experiments/specs/memory-accuracy-v2.contract.json \
  --runs experiments/runs/<runA> --runs experiments/runs/<runB> ... \
  --out experiments/results/memory-v2 --judge deepseek --cross-check
# 不花錢重現：
node experiments/eval/score.ts ... --out <新目錄> --judge replay --judge-cache experiments/results/memory-v2/judge-raw.jsonl --cross-check
```

與 v1 的相似度（撰寫完成時實測）：以字元二元組的 Jaccard 係數，取 v2 每一句（歷史與探針的每一輪）與 v1 所有句子相比的最大值。記憶 v2 共 101 句，最大 0.44（q19 與 v1 q17 共用「中間隔了幾天」的問法），沒有 ≥ 0.5 的句子。人格 v2 共 77 句，≥ 0.5 的有 6 句（最大 0.79），全部是沿用的提問框架（「聽完這件事，你對剛剛那個問題的看法有沒有改變？」「你一開始怎麼想？後來有沒有改變？為什麼？」「替……取一個名字，最後一行寫『選擇：＿＿』」），題材都不同（見人格規格 §3）。

## 12. 文獻

與 v1 相同（`memory-accuracy-v1.md` §12）。v2 新增使用的部分：Memora（2604.20006）的逐題評估準則（§3.5 Questions and Evaluation Criteria：每題附由記憶軌跡導出的明確準則，含 memory presence 與 forgetting absence；Recommending 題檢查個人化建議是否反映使用者目前的偏好）、§4.2 Forgetting-Aware Memory Accuracy、附錄 LLM Judge Details and Reliability，作為 `mem-criteria-v2` 的依據；MemoryArena（2602.16313）§1（後來的行動在沒有正確追蹤並重用先前資訊時是不足指定的）與 §3.2（後面的 session 取決於先前 session 取得的資訊），作為隱性運用類別的依據。
