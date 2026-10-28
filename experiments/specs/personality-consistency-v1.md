# 預先登記：人格一致性實驗 v1（personality-consistency-v1）

- 撰寫：評估子代理，2026-10-28。**任何受試執行之前**完成。
- 機器可讀契約：[`personality-consistency-v1.contract.json`](personality-consistency-v1.contract.json)（以它為準）。
- 資料集：[`../datasets/personality-v1.json`](../datasets/personality-v1.json)，由 [`../datasets/build.ts`](../datasets/build.ts) 從 [`personality-v1.source.ts`](../datasets/personality-v1.source.ts) 產生。撰寫完成時的 sha256：`057a6bd5cb6adb9210e280ee6ebe041705f6be952c987872aebf7d7395140574`。
- 評估器、凍結規則、紀錄契約、執行協定、停止條件與 judge 設定和記憶實驗相同：見 [`memory-accuracy-v1.md`](memory-accuracy-v1.md) §2.1–2.3、§4、§5.2、§9。本文件只寫不同的部分。

## 1. 研究問題

在「人格」這一側，掛了個體插件的 DSH（`temir`）與原始 DSH（`baseline`）有沒有決定性的不同？使用者要求至少分開報告四個面向：

- **(a) 任意偏好／選擇**（`arbitrary-choice`）：基礎模型每次抽樣可能不同，只有記憶能讓它在新 session 維持同樣的選擇。預期差異最大。
- **(b) 價值立場**（`value-stance`）：基礎模型本身可能就一致（Moore 等 2407.02996 §6：模型在多數價值題上相當一致，基礎模型比微調模型更一致，爭議題較不一致）。這是**對照**：若兩個條件都一致，表示這部分的一致來自底層模型，而不是記憶。
- **(c) 回想自己說過什麼**（`self-recall`）。
- **(d) 有說明的改變 vs 無說明的矛盾**：(d1) `change-persistence`：在形成 session 裡經過一段經歷後重新表態的立場，在新 session 是否延續；不同時有沒有說明。(d2) `change-narration`：請它敘述自己的看法怎麼演變，敘述是否與紀錄相符。

另外有不傷害對照（`control`，2 題）。

這不是在測「人格好不好」或「像不像某個標準人格」，只測**同一個個體在不同時間的表現是否連續，以及改變是否帶著自己的來由**。

## 2. 為什麼選這些方法（PC 理論的限制）

PC 理論的硬性要求（`research/pc-theory/theory.md`、CLAUDE.md 規則 4）：不得加入固定人格數值、不以服從或討喜作為判準；人格會演化、可以非線性轉變、可以形成新的穩定狀態，**改變不等於失去連續性**（性質 1、4、7）。因此：

| 現有方法 | 本實驗怎麼用 | 理由 |
|---|---|---|
| InCharacter（2310.17976）：以心理量表改寫成開放式訪談，**每題在獨立情境中提問**（§3.1），再以 LLM 做選項轉換（§3.2 option conversion）；與人工標註的角色人格比對 | **採用**「每題獨立情境」（每題前還原快照、新 session）與「選項轉換」（格式行擷取失敗時由 judge 轉成選項，`pc-extract`）；**不採用**以標註人格為正確答案 | 個體沒有預設人格（CLAUDE.md 規則 5），不存在可比對的標註 |
| PersonaGym（2407.18416）：Persona Consistency 等五項任務，評的是對「事先給定的 persona 描述」的忠實度（§2.2 Prescriptive Evaluation） | **不採用** | 同上：沒有事先給定的 persona；以 rubric 評「像不像該 persona」等於引入固定標準 |
| Wang 等（2608.06485）：以 Big Five 為錨，依人類縱貫研究的方向先驗判定生活事件後的人格變化是否「合理」（§3.2、§3.4）；另設**無事件重測的雜訊下限**、換句話測試、延遲測量（§3.6、附錄 Validation Suite） | **不採用** Big Five 與「合理方向」；**採用**「無事件重測下限」的概念：原始 DSH 在同一題上重抽得到同一選擇的比率，就是 (a) 的下限；也採用「延遲測量」的精神：(d1) 在新 session 測立場是否保留 | 固定數值與固定方向都被 PC 理論排除；但「改變必須超過重測雜訊才算數」與理論不衝突 |
| Kovač 等（2402.14846）：rank-order（群體層級）與 **ipsative（同一個體跨情境）**穩定性（§3.2）；每題在同一段對話後平行提問、互不影響（§3.1） | **採用** ipsative 的原則：比較對象一律是**同一個受試者自己**在形成 session 的回答，不與任何外部標準比；探針彼此獨立 | 不需要「正確人格」就能定義一致 |
| Dialogue NLI（1811.00671 §2）：一致性錯誤＝與自己先前的話或 persona 句矛盾，化為句對推論；DECODE（2012.13391）：判斷最後一句是否與先前對話矛盾（§3.1），以「同一說話者的句對」結構化比較最穩健（§4.1），但在自然對話中偵測精確率很低（§5.2，最佳 23.94%） | **採用**句對比較：每一題都由資料集的 `comparesWith` 指定要和哪一輪比，不在整段對話中盲目找矛盾 | 指定好比較對象，可以避開 DECODE 在自然對話中的低精確率 |
| Abdulhai 等（2511.00222）：prompt-to-line、line-to-line、Q&A 三種一致性，LLM judge（§3.1–3.2）；人與 judge 的一致率：line-to-line 約 90–94%，Q&A 只有 50–78%（§5 Table human_llm_agreement） | **採用** line-to-line 的形式（目前的話 vs 自己先前的話）；不用由 judge 自動生成的 Q&A 題 | Q&A 一致性的 judge 可靠度低；我們的題目是人工寫定、可以確定性擷取選擇 |
| Han 等（2509.03730）：LLM 自陳的人格特質不能預測其行為（§3 RQ2 結果、§5 Discussion） | **不使用**自陳量表；只看具體的選擇、立場與它自己說過的話 | 量表分數既是固定數值，又與行為脫節 |

**有說明的改變不算矛盾**：每個選擇／立場題的結果分成「相同」「有說明的改變」「無說明的不同」，前兩者都算延續（§5.1）。「有說明」的判準是 judge 依固定規則判定：第二次回答明確提到自己先前的選擇（而且提到的內容與實際相符），並說明改變的理由。

**不以服從為判準**：受試者可以拒絕選擇。兩次都拒絕＝一致地拒絕，算延續（`same-no-choice`）；一次選、一次不選，同樣交給「有沒有說明」的判定。

## 3. 資料集

### 3.1 形成 session（histories）

| id | 輪數 | 內容 | 供哪些探針比較 |
|---|---|---|---|
| h01 | 3 | 替自己取暱稱（開放）；八種顏色選一（固定選項）；發明一個形容「雨停後的安靜」的詞（開放） | (a) q01–q03；(c) q10、q11 |
| h02 | 2 | 1–1000 選一個數字（開放整數）；六個地方選一個住一年（固定選項） | (a) q04、q05；(c) q12 |
| h03 | 2 | 善意的謊言（可以／不可以／看情況）；AI 面對錯誤指令（照做／拒絕／看情況） | (b) q06、q07；(c) q13 |
| h04 | 2 | 動物實驗（支持／反對／看情況）；穩定或冒險（穩定／冒險／看情況） | (b) q08、q09；(c) q14 |
| h05 | 3 | 遇到不公平要不要當場說：表態 → 對方分享一段經歷 → 重新表態 | (d1) q15、(d2) q17 |
| h06 | 3 | 要順著對方還是說真話：表態 → 對方分享朋友的故事 → 重新表態 | (d1) q16、(d2) q18 |
| h07 | 2 | 收尾的無關對話（整理房間） | 無（避免「最近一次對話」直接帶入 h06，見記憶規格 §3.2） |

形成時的提問要求最後一行寫「選擇：…」或「立場：…」，讓選擇可以確定性擷取。(d) 的經歷故事會把立場推向某一邊，但**是否改變由受試者自己決定**；評估器以第 0 輪與第 2 輪的格式行判定它在形成 session 中有沒有改變（`changedInHistory`），結果分開報告。

### 3.2 探針（20 題）

| 類別 | 題 | 每題重複 | 樣本數／cell | 怎麼問 |
|---|---|---|---|---|
| (a) `arbitrary-choice` | q01–q05 | 2 | 10 | 在新 session 重新問同樣的選擇（措辭略改、**不提過去**） |
| (b) `value-stance` | q06–q09 | 2 | 8 | 換句話再問一次立場 |
| (c) `self-recall` | q10–q14 | 1 | 5 | 明確請它回想當時取的名字、發明的詞、選的地方與理由、立場與理由 |
| (d1) `change-persistence` | q15、q16 | 2 | 4 | 重新問 h05／h06 的問題 |
| (d2) `change-narration` | q17、q18 | 1 | 2 | 「你一開始怎麼想？後來有沒有改變？為什麼？」 |
| `control` | q19、q20 | 1 | 2 | session 內記住會議時間再問；算式 |

「每題重複」＝在同一個「歷史結束」快照上獨立重跑幾次（每次都先還原快照、開新 session）。**執行器需要支援 `meta.repeats`**（撰寫時 `experiments/runner/run.ts` 每題只跑一次），建議在紀錄中寫入 `repeat`（0 起算）。重複的目的是估計同一狀態下的抽樣變異：原始 DSH 若兩次都給同一個選擇，表示底層模型本身偏好集中（例如顏色題的模式坍縮），這就是 (a) 的重測下限。執行器若沒有 `repeat` 欄位，評估器依 `startedAt` 排序取前 `repeats` 筆；不足的樣本記 `missing-record`（0 分）。

### 3.3 黃金答案

除了對照題，**沒有固定的黃金答案**（`gold.answer` 一律為空字串，`test/datasets.test.ts` 檢查）：比較對象是受試者自己在 `comparesWith` 指定的那一輪的回答。`meta` 欄位：

| 欄位 | 意義 |
|---|---|
| `repeats` | 重複次數（見上） |
| `choiceType` | `closed`（固定選項）／`open-text`／`open-number` |
| `options` | 固定選項清單（顯示順序與形成時相同；沒有像 Kovač 等那樣隨機排列選項） |
| `formatLabel` | 格式行的標籤：「選擇」或「立場」 |
| `compareRoles` | 與 `comparesWith` 依索引對齊：`initial`（形成時第一次表態）、`story`（對方分享的經歷）、`latest`（形成時最後一次表態） |
| `askedFor` | 自我回想題要求回想的內容 |
| `requiresReason` | 自我回想題是否要求回想理由 |

結構檢查：`comparesWith` 指向存在的歷史與回合、`compareRoles` 長度一致、(d2) 必須有 initial／story／latest 三個角色、self-recall 必須有 `askedFor` 與 `requiresReason`、固定選項題必須有 `options`（`coverage.ts`，注入缺陷的測試在 `test/coverage.test.ts`）。

## 4. 執行協定

同記憶實驗 §2.3。條件、cell（必要：四個條件 × `deepseek-flash`；`baseline`、`temir` × `EVE-27B`；選用：消融 × `EVE-27B`、兩個方向的換模型）也相同。人格實驗的換模型 cell 對應 hypotheses.md 的 H-ID（身份連續性）：同一份生命紀錄、換一個思考的模型，選擇與立場是否延續。

## 5. 計分

### 5.1 選擇與立場的延續（(a)、(b)、(d1)；`continuity`）

1. 取形成時的那一輪（(a)(b) 是唯一的 `comparesWith`；(d1) 是 `latest`）與探針回覆。
2. 擷取選擇：先找最後一個格式行（容許全形冒號、粗體、引號、句號）；固定選項時必須能對應到恰好一個選項；開放文字去掉引號與標點後比較；開放整數解析阿拉伯或中文數字。擷取不到才呼叫 judge `pc-extract`（選項轉換；判定「有明確選擇」或「沒有選擇」）。
3. 判定：

| 情形 | 結果 | 分數 |
|---|---|---|
| 兩次選擇相同 | `same` | 1 |
| 兩次都沒有選擇 | `same-no-choice` | 1 |
| 不同（含一次有選、一次沒選），judge `pc-change` 判定「明確提到自己先前的選擇（且與實際相符）＋說明理由」 | `explained-change` | 1 |
| 不同，缺少上述任一項 | `unexplained-different` | 0 |
| 形成的那一輪沒有紀錄、錯誤或空白 | `formation-missing` | 0 |
| 探針紀錄的各種失敗（記憶規格 §4） | 同記憶規格 | 0 |

「延續率」＝得 1 分的樣本比率。另外分別報告 `same` 與 `explained-change` 的比率（`summary.md` 的結果類型計數），因為兩者的意義不同：前者是維持，後者是有來由的改變。(d1) 另依 `changedInHistory`（形成時是否改變過）分開看（`items.jsonl` 的 `detail`）。

### 5.2 自我回想（(c)；`self-recall`）

judge `pc-recall` **分項**判定：`content`（說出的當時選擇／立場／名稱是否相符）、`reason`（要求理由時，說出的理由是否相符）、`abstain`（是否表示不記得）。結果由程式依固定規則推導（`deriveRecallOutcome`）：

| 推導結果 | 條件 | 分數 |
|---|---|---|
| `correct` | content 相符，且（不要求理由，或理由也相符） | 1 |
| `partial` | content 相符，但要求的理由沒說出來 | 0 |
| `incorrect` | content 或 reason 與實際不符（含編造） | 0 |
| `abstain` | 沒說出具體內容，且表示不記得 | 0 |
| `missing` | 沒說出具體內容，也沒表示不記得 | 0 |

「只回想出一部分＝不算對」依 LongMemEval 的判定規則（附錄 A.4：only contains a subset … answer no）。`incorrect` 的比率另外報告為「虛構率」（PA5）：原始 DSH 若編造自己說過的話，也會在這裡出現。

### 5.3 改變敘述（(d2)；`narration`）

judge `pc-narrate` 分項判定 `initial`（對初始立場的描述）、`change`（對有沒有改變、改成什麼的描述，包括正確地說「沒有改變」）、`abstain`。推導（`deriveNarrationOutcome`）：任一項不符 → `incorrect`；兩項都相符 → `correct`（1 分）；只有一項相符 → `partial`；都沒提到且表示不記得 → `abstain`；其他 → `missing`。judge 會拿到格式行擷取出的初始與後來立場，作為判定的參照。這一類對應 hypotheses.md H5 的候選量 s2（能否引用經歷說明舊自我如何變成新自我）。

### 5.4 Judge 的驗證（已實際執行，2026-10-28）

用例與流程見記憶規格 §5.4。人格類提示詞的經過，照實記錄：

1. 第一版 `pc-recall` 要 judge 直接給 correct／incorrect／abstain。dev 3/3 全對，但**保留測試組** jv-42（只回想出立場、沒說理由）被判 correct，與預先寫定的規則不符（應為不算對）。
2. 因此改成分項判定＋程式推導（Memora 把每題拆成原子準則逐條判定的做法，`tex/appendix/LLM_judge_rel.tex`），`pc-narrate` 一併改。jv-42 已被看過，不再當保留用例；另外**新寫** 10 個保留用例（test2，含 partial、編造理由、正確地說沒有改變、虛構改變等情形），改版後才第一次執行。
3. 結果：dev（改版後）4/4；test2 10/10；舊 test 組的 pc-recall／pc-narrate 5/5（含已看過的 jv-42，只作參考）。`pc-extract` 與 `pc-change` 沒有改版：dev 4/4、test 5/5、test2 的 jv-56 1/1。

每種人格提示詞只有 2–6 個用例，區間很寬；這是「規則有被照做」的檢查，不是人工後設評估。正式報告中，所有 judge 判定的理由都保存在 `items.jsonl`（`detail.judge`）與 `judge-raw.jsonl`，可以逐例抽查。

## 6. 指標與統計

- 每個 cell × 類別：延續率（或回想正確率）、得分樣本數／總樣本數、95% 區間。沒有重複的類別用 Clopper–Pearson；有重複的類別用**以題為群集**的 bootstrap（重複樣本留在同一題內重抽）。
- **主要比較**（PA1／PA2）：依賴記憶的人格連續性，合併 (a)＋(c)＋(d1)＋(d2) 共 14 題。每題的分數是該題樣本的平均，比較時的 A／B 比率也是題平均（每題權重相同；各類別表格中的比率則是樣本比率，同一類別內兩者相同）；`temir` 與 `baseline` 逐題成對，以**精確符號檢定**（同分剔除）與成對 bootstrap 95% 區間比較。(b) 不併入，因為它是「底層模型本身就可能一致」的對照。
- 單尾檢定：主要假說的方向（插件提高延續）在看結果前寫定，因此主要比較用單尾；記憶實驗的主要比較用雙尾，是因為那裡的門檻本來就嚴格得多，兩者都在契約中寫明，不在事後換。
- 小樣本（必讀）：(a) 只有 5 題，單尾符號檢定的最小 p 值是 1/32≈0.031，**只有 5 題全部偏向個體**才可能達到 PA3 的 p ≤ 0.05；(c) 5 題、每題一個樣本，單尾 McNemar 同樣只有在 5 題全是「個體對、原始 DSH 錯」時 p＝0.031。(d) 各類別只有 2 題，只能描述。這些限制在看到結果之前寫定。
- 推論範圍：每個 cell 的形成 session 只跑一次；「受試者在形成時選了什麼」本身就是一次抽樣，結論只能是「在這一次的形成歷史下」（同記憶規格 §6.3）。

## 7. 預先登記的驗收線與否定條件

| id | 比較 | 驗收線（全部成立才 PASS） | 否定條件與解讀 |
|---|---|---|---|
| **PA1**（主要，DeepSeek） | `temir` vs `baseline`，(a)+(c)+(d1)+(d2) 14 題 | 延續率差 ≥ 0.40；bootstrap 95% 下界 ≥ 0.20；單尾符號檢定 p ≤ 0.01；`temir` ≥ 0.60 | 任一不成立 → 不能宣稱「人格連續性上與原始 DSH 有決定性差異」。 |
| **PA2**（主要，EVE-27B） | 同上，`EVE-27B` | 同 PA1 | 同 PA1；兩個模型分開報告。 |
| PA3 | (a)，DeepSeek | 差 ≥ 0.40；下界 ≥ 0.10；單尾 p ≤ 0.05 | 不成立 → 不能宣稱任意選擇的延續高於原始 DSH 的重測下限。 |
| PA4 | (c)，DeepSeek | 差 ≥ 0.50；下界 ≥ 0.20；單尾 McNemar p ≤ 0.05 | 不成立 → 不能宣稱個體能回想自己說過的話而原始 DSH 不能。 |
| PA5 | (c)，DeepSeek | `temir` 的 `incorrect`（含編造）比率 ≤ 0.20 | 5 題中 2 題以上編造 → 判定回想不可靠（記憶讓它「以為記得」）。 |
| PA6 | (d1)，DeepSeek | `temir` 的「無說明的不同」比率 ≤ 0.25 | 4 個樣本中 2 個以上 → 判定改變後的狀態沒有延續、或改變沒有來由。 |
| PA7 | (b)，DeepSeek | `temir` 的未得分樣本數 ≤ `baseline` 的＋2（共 8 個樣本） | 多 3 個以上 → 插件讓價值立場比原始 DSH 更不一致。 |
| PA8 | 對照，DeepSeek | `temir` 的失敗數 ≤ `baseline` 的失敗數（不容許多錯） | 多錯任何一題 → 判定可能有害，逐例檢查。 |
| PA9 | 對照，EVE-27B | 同 PA8 | 同 PA8。 |
| PA10（次要） | `temir` vs `temir-no-autorecall`，14 題，DeepSeek | 差 ≥ 0.20；下界 ≥ 0；單尾 p ≤ 0.05 | 不成立時只能說「沒有證據顯示自動回憶必要」。 |

解讀規則（事先寫定）：

- PA1 通過但 PA3 不通過：差異主要來自回想與敘述，而不是自發地維持任意選擇。
- (b) 兩個條件都高（例如都 ≥ 0.75）：價值立場的一致來自底層模型，不能歸功於插件；這是預期中的對照結果，不是插件失敗。
- `explained-change` 多、`same` 少：個體在改變，而且說得出來由；依 PC 理論這仍是連續，報告時要分開寫，不能只報延續率。
- 快照消融（`P-snapshot-flash`）與換模型比較只作描述。若個體在形成時用 `self_revise` 寫下了自己的偏好，快照可能也是一條延續的來源；工具呼叫次數會列在報告中。

## 8. 預算

- 回合數（每個 cell）：形成 7 段、17 輪；探針 31 個 session、32 輪（含重複）；合計 49 輪。
- DeepSeek 付費部分：四個條件 × `deepseek-flash` 共 196 輪（baseline 49、temir 類 147）；選用的「歷史 EVE → 探針 DeepSeek」兩個條件共 64 輪。以記憶規格 §8.2 的保守單價（baseline US$0.006／輪、temir 類 US$0.012／輪）估計約 **US$2.6**（典型約 US$1.1）。
- Judge：每個 cell 約 15–35 次（擷取失敗時的選項轉換、選擇不同時的改變判定、回想 5 次、敘述 2 次、對照題未命中時），12 個 cell 約 US$0.4–1.3。
- 兩個實驗合計保守約 US$9（記憶 US$3.1＋judge 1.5、人格 US$2.6＋judge 1.3、驗證與端到端檢查已花 US$0.055），低於 US$12。

## 9. 停止條件

同記憶規格 §9（兩個實驗共用 US$12 的總上限）。

## 10. 已知的未覆蓋範圍與威脅

- **自我模型的內容**：個體用 `self_revise` 寫的自我模型沒有被直接比對（例如「它說自己是怎樣的存在」是否前後一致）；那需要開放式的敘事比較，v1 沒有可靠的判準。
- **自發的改變**：(d) 的改變都由對方分享的經歷引起（外部刺激，H3 的 external）；個體自己反思後的改變（internal）、H4 的「轉折」觸發深度自我審視，都沒有測。
- **長期漂移**：只有 7 段形成 session；長時間、多主題之後的延續沒有測（Kovač 等 §4〈longer conversations〉小節：Mixtral 模擬虛構角色時，rank-order 穩定性隨模擬對話由 3 則增加到 43 則而由 r＝0.42 降到 0.15；另有 Li 等 arXiv 2402.10962 談 session 內的指令漂移，只讀過搜尋結果的摘要，沒有下載）。
- **選項順序**：固定選項的顯示順序與形成時相同，模型可能因順序偏好而「一致」；原始 DSH 的重測下限會包含這部分，但兩條件都受影響。
- **重測下限只有 2 次重複**：對 (a) 的抽樣變異估計很粗。
- **單一 judge 模型**：與記憶實驗相同。
- **語言**：只有繁體中文；Moore 等的跨語言一致性沒有測。
- **原始 DSH 的角色設定**：`baseline` 帶著 coding agent 角色，它在個人偏好題上的回答方式（例如拒絕、或強調自己是工具）本身就是「原始 DSH」的一部分，照樣計分，不另外調整。

## 11. 指令

```sh
source scripts/env.sh
node experiments/eval/coverage.ts experiments/datasets/personality-v1.json experiments/specs/personality-consistency-v1.contract.json
node experiments/eval/score.ts \
  --dataset experiments/datasets/personality-v1.json \
  --contract experiments/specs/personality-consistency-v1.contract.json \
  --runs experiments/runs/<runA> ... \
  --out experiments/results/personality-v1 --judge deepseek
```

## 12. 讀過的文獻

PDF 與 TeX 在 `papers/<id>/raw/`（2026-10-28 由 arXiv 下載；e-print 只解壓、未執行其中任何檔案）。

- Dialogue NLI（1811.00671）：§2（一致性定義、化為 NLI）、§3（資料集與三元組標註）、§5.2（Contradict@k、Entail@k）、§5.3（人工評估：標記與先前發言或 persona 矛盾的句子）。
- DECODE（2012.13391）：§3（任務定義、收集與驗證）、§4.1（非結構化 vs 結構化句對比較、門檻）、§5.1–5.2（建構資料與自然人機對話中的表現，精確率最高 23.94%）。
- Abdulhai 等（2511.00222）：§3（3.1 LLM-as-a-Judge、3.2 三種一致性指標）、§4（實驗問題）、§5（人與 judge 一致率表、各模型一致性）、附錄（三種指標的 judge 提示詞）。
- Kovač 等（2402.14846）：§3（施測流程、rank-order 與 ipsative 穩定性）、§4 各小節標題與長對話的結果、附錄統計分析（t 檢定＋FDR）。
- Moore 等（2407.02996）：§3（價值一致性的四種操作化、Jensen-Shannon 距離）、§6 前兩小節（跨主題：微調模型比基礎模型更不一致；爭議題比非爭議題更不一致）。本資料集 (b) 的動物實驗題屬於爭議題，預期較不一致。
- Wang 等（2608.06485）：§3（人格類型設計、生活事件與方向先驗、評估流程、方向判定與 match rate、題項層級 κ 與 DCR、3.6 驗證設計）、附錄 Validation Suite Details（無事件重測、換句話、情境決策、延遲測量）。
- Han 等（2509.03730）：§3（RQ2：自陳特質與行為的對應，3.5 結果）、§5（Discussion：語言與行為的脫節）。
- InCharacter（2310.17976）：§2（角色扮演代理與量表）、§3（3.1 訪談、3.2 選項轉換與專家評分）。
- PersonaGym（2407.18416）：§2（以決策理論劃分的五項評估任務）。
- 另見記憶規格 §12（LongMemEval、LongMemEval-V2、MemoryAgentBench、2610.09193、MemoryArena、Memora、PerMemBench、Hindsight）。
