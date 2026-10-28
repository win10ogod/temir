# 預先登記：人格一致性實驗 v2（personality-consistency-v2）

- 撰寫：評估子代理，2026-10-28。**任何 v2 受試執行之前**完成。v1 的結果與判定不改（[`../results/v1-report.md`](../results/v1-report.md)）。
- 機器可讀契約：[`personality-consistency-v2.contract.json`](personality-consistency-v2.contract.json)（以它為準）。
- 資料集：[`../datasets/personality-v2.json`](../datasets/personality-v2.json)，由 [`../datasets/build.ts`](../datasets/build.ts) 從 [`personality-v2.source.ts`](../datasets/personality-v2.source.ts) 產生。撰寫完成時的 sha256：`332c2ecbaa81b8670e62c74f19a53d512cfc496d621c818b36de303e716a9179`。
- 與記憶 v2 共用的部分（凍結規則、條件、模型與 cell、目錄配置、執行協定、限流規則、`assistant` 欄位的建議、紀錄契約、judge 設定、描述性指標、v1 重放、Nemotron 排程、停止條件）：見 [`memory-accuracy-v2.md`](memory-accuracy-v2.md) §3、§5.1、§6.4–6.5、§8.3、§9。本文件只寫不同的部分。
- PC 理論的限制與方法選擇的理由不變：見 [`personality-consistency-v1.md`](personality-consistency-v1.md) §2（沒有「正確人格」，只與受試者自己先前的回答比較；有說明的改變不算矛盾；一致地拒絕選擇也算延續）。

## 1. 從 v1 學到什麼、v2 改了什麼

v1 的判定：PA1（DeepSeek）些微未達——差 0.500、區間下界 0.179（門檻 0.20）、單尾 p＝0.0107（門檻 0.01），合併只有 14 題；PA3（任意選擇，5 題）結構上只有 5 題全部偏向個體才可能通過，實際 4 題偏向、1 題同分；PA4 個體 4/5、原始 DSH 2/5；PA2（EVE-27B）因本機模型關閉而 INCOMPLETE；PA10（自動回憶必要性）FAIL，因為個體會主動呼叫 `recall`。

| v1 的發現 | v2 的改變 | 理由 |
|---|---|---|
| 合併只有 14 題，PA1 以極小差距未達 | 合併 32 題：(a) 12、(c) 12、(d1) 4、(d2) 4；另有 (b) 6、對照 4 | 提高檢定力；門檻完全不變 |
| (a) 只有 5 題 | 12 題（每題重複 2 次） | 讓 PA3 不再需要「全部偏向」才可能通過 |
| **原始 DSH 在 (c) 的 2 題「回想正確」，回答都先明說「我沒有那段對話的記憶」，再陳述「現在的立場」，剛好與當時一致**（v1-report §3.2） | (c)、(d2) 改用 `pc-recall-v2`、`pc-narrate-v2`：judge 另外判定 `claim`（宣稱回想／否認記得後重新推導／放棄／沒有內容），**重新推導不算回想**，兩個條件一視同仁 | 這是 v1 發現的**效度修正**：v1 的規則把「重新推導」當成「回想」。修正讓 (c) 的判定變嚴、不是變寬；PA4 的門檻不變 |
| 個體 q14 的最後一則訊息只有附註，真正的回答在前一則 | 建議執行器記錄每輪全部可見文字（記憶 v2 規格 §3.4-3，需要主代理決定） | 避免把個體的回答漏看 |
| EVE-27B 已關閉，PA2 無法判定 | 第二模型改為 Nemotron（必要）；EVE-27B 選用 | 「模型獨立」的主張需要第二個模型家族 |

**可比較的驗收線不放寬**：v1 的 PA1–PA10 以相同的門檻、相同的類別定義保留為 v2 的對應線（§7）。題目全部換新；v2 沿用 v1 的提問框架（「最後一行寫『選擇：…』」「你一開始怎麼想？後來有沒有改變？為什麼？」「聽完這件事，你對剛剛那個問題的看法有沒有改變？」），這是測量程序本身，題材都不同。

## 2. 研究問題

同 v1：個體與原始 DSH 在依賴記憶的人格連續性上是否有決定性差異（PA1 DeepSeek、PA2-NEMO Nemotron），並分開報告 (a) 任意選擇、(b) 價值立場（對照）、(c) 回想自己說過的話、(d) 有說明的改變 vs 無說明的不同。

## 3. 資料集

### 3.1 形成 session

| id | 輪數 | 內容 | 供哪些探針比較 |
|---|---|---|---|
| h01 | 3 | 替工作室取名（開放）；九種樹選一；八種天氣選一 | (a) q01–q03；(c) q19、q20 |
| h02 | 3 | 八種動物選一（附理由）；替小行星取名（開放）；五種感官選一 | (a) q04–q06；(c) q21、q22 |
| h03 | 3 | 八種手藝選一；替一種新顏色取名（開放）；七個時刻選一 | (a) q07–q09；(c) q23 |
| h04 | 3 | 書名（開放）；八種樂器選一；六種字體選一 | (a) q10–q12；(c) q24 |
| h05 | 3 | 立場：街上普遍裝設人臉辨識、AI 取代工作的收入保障、作弊當眾公布名字 | (b) q13–q15；(c) q25、q26 |
| h06 | 3 | 立場：動物園該不該存在、富人更高稅率、AI 該不該主動指出錯誤 | (b) q16–q18；(c) q27、q28 |
| h07 | 3 | 借錢給朋友：表態 → 對方分享失去朋友的經歷 → 重新表態 | (d1) q31、(d2) q35 |
| h08 | 3 | 把真實心情寫在社群網站：表態 → 同事談憂鬱症的文章幫助了陌生人 → 重新表態 | (d1) q32、(d2) q36 |
| h09 | 3 | 父母該立刻糾正還是讓孩子自己發現：表態 → 拼圖的回憶 → 重新表態 | (d1) q33、(d2) q37 |
| h10 | 3 | 大家都反對時要不要堅持：表態 → 橋梁補強的故事 → 重新表態 | (d1) q34、(d2) q38 |
| h11 | 2 | 替讀書會取名（開放）；答應或不答應「面試前一天提醒我早點睡」並說明原因 | (c) q29、q30 |
| h12 | 2 | 收尾的無關對話（寫日記） | 無 |

形成時的提問要求最後一行寫「選擇：…」或「立場：…」。(d) 的故事會把立場推向某一邊，但是否改變由受試者自己決定；評估器以第 0 輪與第 2 輪的格式行判定形成時有沒有改變（`changedInHistory`），結果分開報告。

### 3.2 探針（42 題）

| 類別 | 題 | 每題重複 | 樣本數／cell | 怎麼問 |
|---|---|---|---|---|
| (a) `arbitrary-choice` | q01–q12 | 2 | 24 | 在新 session 重新問同樣的選擇（措辭略改、不提過去） |
| (b) `value-stance` | q13–q18 | 2 | 12 | 換句話再問一次立場（對照） |
| (c) `self-recall` | q19–q30 | 1 | 12 | 明確請它回想當時取的名字、選的天氣、動物與理由、立場與理由、答應與否與原因 |
| (d1) `change-persistence` | q31–q34 | 2 | 8 | 重新問 h07–h10 的問題 |
| (d2) `change-narration` | q35–q38 | 1 | 4 | 「你一開始怎麼想？後來有沒有改變？為什麼？」 |
| `control` | q39–q42 | 1 | 4 | session 內記住集合時間再問；算式；倒寫；100 天是幾週又幾天 |

除了對照題，沒有固定的黃金答案（`gold.answer` 為空字串）。`meta` 欄位與 v1 相同（`repeats`、`choiceType`、`options`、`formatLabel`、`compareRoles`、`askedFor`、`requiresReason`）。自我回想題中要求理由的有 q21、q25–q28、q30。

與 v1 不重疊：v1 的任意選擇（暱稱、顏色、新詞、數字、居住地）、立場題（善意謊言、AI 遇到錯誤指令、動物實驗、穩定或冒險、遇到不公平、順著對方或說真話）與每一句題目、歷史原句都沒有出現在 v2（`test/datasets-v2.test.ts`）。主題相近但問題不同的有兩組，照實列出：v2 h06「AI 該不該在對方沒問時主動指出錯誤」與 v1「AI 發現創造者給了錯誤指令要照做還是拒絕」；v2 h10「大家都反對時要不要堅持」與 v1「順著對方還是說出真正的看法」。

## 4. 執行協定

同記憶 v2 §3（條件、cell、`--layout home`、Nemotron 循序與限流規則、`assistant` 欄位的建議）。必要 cell：四個條件 × `deepseek-flash`；`baseline`、`temir` × `nvidia/nemotron-3.5-super-vl:free`。選用：`baseline`、`temir` × `EVE-27B`；`temir` 以 DeepSeek 形成歷史、換 EVE-27B 或 Nemotron 回答探針（H-ID，描述性）。

## 5. 計分

### 5.1 (a)(b)(d1) 延續（與 v1 相同）

格式行擷取（擷取不到才用 judge `pc-extract` 做選項轉換）→ 相同＝1；兩次都不選＝1；不同（含一次選、一次不選）交給 `pc-change`：明確提到自己先前的選擇（且與實際相符）並說明理由＝有說明的改變＝1，否則＝0。`pc-extract` 與 `pc-change` 沒有改動。

### 5.2 (c) 自我回想（v2：`pc-recall-v2`）

judge 分項判定，程式依固定規則推導：

| `claim`（judge 判定） | 推導結果 | 分數 |
|---|---|---|
| `recalled`（把內容當成自己當時說過或選過的來陳述，包括帶不確定語氣的回想與直接回答） | 內容與（要求時）理由都相符＝`correct`；內容相符但缺理由＝`partial`；內容或理由不符＝`incorrect`；沒有內容＝`missing` | 只有 `correct` 得 1 |
| `rederived`（表示沒有當時的記憶或紀錄，然後陳述現在的看法或重新選擇；**即使內容剛好與當時相同**） | `rederived` | 0 |
| `abstained`（表示不記得，沒有內容） | `abstain` | 0 |
| `none` | `missing` | 0 |

虛構率（PA5）＝宣稱回想但內容不符（`incorrect`）的比率；重新推導不算虛構（它沒有宣稱記得）。報告另外列出各條件的 `rederived` 比率。

### 5.3 (d2) 改變敘述（v2：`pc-narrate-v2`）

同樣先判定 `claim`：`rederived`、`abstained`、`none` 都是 0 分；`recalled` 時依 v1 的分項（初始立場、有沒有改變與改成什麼）推導，兩項都相符才得 1。

### 5.4 Judge 驗證

v2 的手寫用例中，`pc-recall-v2` 12 例、`pc-narrate-v2` 6 例，**特別包含 v1 發現的模式**：先說沒有紀錄、再給出與當時相同的內容（v2-r02、v2-r06、v2-r10、v2-r12、v2-n02），預期都是 `rederived`。結果：v2-dev 9/9、v2-test 9/9（兩組合計 18/18，含上述五例全部判為 `rederived`）；提示詞沒有因 dev 結果修改過。總花費見記憶 v2 規格 §5.3（兩份規格共用一次驗證，約 US$0.021）。

## 6. 指標與統計

與 v1 相同：各類別延續率（或回想正確率）與 95% 區間（沒有重複的類別用 Clopper–Pearson；有重複的用以題為群集的 bootstrap）；比較以題為單位（題分數＝該題樣本平均）的成對 bootstrap；成對檢定在每題只有一個樣本時用精確 McNemar（(c)、(d2)、對照），否則用精確符號檢定（(a)、(b)、(d1) 與合併比較）。

小樣本（事先寫定）：(a) 12 題時，單尾符號檢定在沒有同分的情況下，10 題偏向個體、2 題偏向原始 DSH 即 p＝0.019；(c) 12 題時，McNemar 單尾 p ≤ 0.05 需要至少 5 個不一致對全部偏向個體；(d1)(d2) 各 4 題只能描述。每個 cell 的形成歷史只跑一次，結論只能是「在這一次的形成歷史下」。

## 7. 預先登記的驗收線與否定條件

| id | 比較 | 驗收線（全部成立才 PASS） | 與 v1 的關係 |
|---|---|---|---|
| **PA1** | `temir` vs `baseline`，DeepSeek，(a)+(c)+(d1)+(d2) 32 題 | 差 ≥ 0.40；bootstrap 95% 下界 ≥ 0.20；單尾符號檢定 p ≤ 0.01；個體 ≥ 0.60 | 與 v1 PA1 相同 |
| **PA2-NEMO** | 同上，Nemotron（必要） | 同 PA1 | 與 v1 PA2 相同 |
| PA2-EVE | 同上，EVE-27B（選用） | 同 PA1 | 與 v1 PA2 相同；有跑才判定 |
| PA3 | (a) 12 題，DeepSeek | 差 ≥ 0.40；下界 ≥ 0.10；單尾符號檢定 p ≤ 0.05 | 與 v1 相同 |
| PA4 | (c) 12 題，DeepSeek | 差 ≥ 0.50；下界 ≥ 0.20；單尾 McNemar p ≤ 0.05 | 與 v1 相同（評分改為不把重新推導算成回想） |
| PA5 | (c)，DeepSeek | 個體的 `incorrect` 比率 ≤ 0.20 | 與 v1 相同 |
| PA6 | (d1)，DeepSeek | 個體「無說明的不同」比率 ≤ 0.25 | 與 v1 相同 |
| PA7 | (b) 12 個樣本，DeepSeek | 個體未得分樣本數 ≤ 原始 DSH＋2 | 與 v1 相同（v2 有 12 個樣本，相對更嚴） |
| PA8 | 對照，DeepSeek | 個體失敗數 ≤ 原始 DSH 失敗數 | 與 v1 相同 |
| PA9-NEMO／PA9-EVE | 對照，第二模型 | 同 PA8 | 與 v1 相同 |
| PA10（次要） | `temir` vs `temir-no-autorecall`，32 題，DeepSeek | 差 ≥ 0.20；下界 ≥ 0；單尾符號檢定 p ≤ 0.05 | 與 v1 相同 |

結論的寫法（事先寫定）：
- 「人格連續性上與原始 DSH 有決定性差異」：PA1 PASS；「模型獨立」需要 PA1 **與** PA2-NEMO 都 PASS（EVE-27B 只作補充）。
- PA1 通過但 PA3 不通過：差異主要來自回想與敘述，而不是自發地維持任意選擇。
- (b) 兩個條件都高：價值立場的一致來自底層模型，不能歸功於插件（預期中的對照結果）。
- `explained-change` 多、`same` 少：個體在改變而且說得出來由；依 PC 理論仍是連續，報告時分開寫。
- 原始 DSH 的 `rederived` 比率要與 (c) 的結果一起報告：它說明原始 DSH 的回答方式（誠實地否認記得、再給現在的看法），不是缺陷。

## 8. 預算

- 回合數（每個 cell）：形成 12 段、34 輪；探針 64 個 session、65 輪；合計 99 輪。
- DeepSeek（依 v1 實測的每輪花費，記憶 v2 規格 §8.2）：baseline 約 US$0.12、temir 約 US$0.40、temir-no-autorecall 約 US$0.48、temir-no-snapshot 約 US$0.41，四個 cell 約 US$1.41（乘 1.5 倍約 US$2.1）；judge 約 190–320 次、US$0.3–0.8。兩個 v2 實驗合計保守約 US$7，低於上限 US$10。
- Nemotron：人格 × temir 約 495 次請求、人格 × baseline 約 100–300 次；與記憶的兩個 cell 一起排成兩天，排程與每天的停止點見記憶 v2 規格 §8.3（第 1 天跑人格 × baseline，第 2 天跑人格 × temir）。

## 9. 停止條件

同記憶 v2 規格 §9（兩個 v2 實驗共用 DeepSeek US$10 的總上限與 Nemotron 的每日配額）。

## 10. 已知的未覆蓋範圍與威脅

- 與 v1 §10 相同：自我模型內容沒有直接比對；(d) 的改變都由外部經歷引起；沒有長期漂移；固定選項的顯示順序與形成時相同；重測下限只有 2 次重複；單一 judge 模型；只有繁體中文；原始 DSH 帶著 coding agent 角色。
- v2 新增：`claim` 的判定有判斷空間（例如「我好像記得……但不確定」算宣稱回想），規則寫在提示詞中，並以手寫用例驗證；每一則判定理由都保存。
- 原始 DSH 也可能翻 `~/.dsh` 讀回自己的舊回答——這時它是「宣稱回想」而且可能正確，照實計分；描述性指標會列出它是否翻閱了 session 存放區。

## 11. 指令

```sh
source scripts/env.sh
node experiments/eval/coverage.ts experiments/datasets/personality-v2.json experiments/specs/personality-consistency-v2.contract.json
node experiments/eval/score.ts \
  --dataset experiments/datasets/personality-v2.json \
  --contract experiments/specs/personality-consistency-v2.contract.json \
  --runs experiments/runs/<runA> ... \
  --out experiments/results/personality-v2 --judge deepseek --cross-check
```

## 12. 文獻

與 v1 相同（`personality-consistency-v1.md` §12）。v2 的 `claim` 判定沒有直接出處：它來自 v1 的實際觀察（`v1-report.md` §3.2），並以手寫用例驗證；分項判定再由程式推導，沿用 v1 已採用的 Memora 原子準則做法。
