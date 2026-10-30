# 參考用的 DSH 插件：重讀（2026-10-30，s09）

- **起因**：使用者說「你假裝明白有用嗎?根本沒用心去理解整個理論與那些參考用的DSH插件, 甚至是論文都沒有看」。
- **舊的調查**：`research/dsh/memory-plugins-survey.md`。它自己寫著「這不是逐行審查的結論」，而且沒有收 dsh-agent-soul。
- **讀法**：只讀原始碼；commit 見 `references/LOCK.md`。
- **重點**：每個插件中，什麼是**寫死的**，什麼交給**模型判斷**，以及判斷由誰、在什麼脈絡中做。

## 1. 用固定的東西「做出人格」的插件（使用者指出的反例）

### dsh-her-memory（KZADEA，5bd7924）

- **人設**：一張寫死的人格卡（`人设文件.txt`）：外貌、性格條目（「聰明但懶」「傲嬌嘴甜」「主食白飯」…），每條附「具體表現」的劇本。正文原樣進入常駐系統提示。
- **心情、關係、精力**：0–100 的數值（`index.js:425-436`，預設 60／10／70）。
  - **標籤**：用固定門檻切分（`MOOD_LABELS`、`intimacyLabel`，`index.js:403-420`）。
  - **說話風格**：由數值區間對應到固定的風格句（`toneHint`，`index.js:550-573`），例如「心情低落：句子短一些」。
- **更新規則**：寫死的公式（`reactToMessage`，`index.js:594-611`）。
  - 心情依訊息**長度**加 1～3，關係依訊息間隔加分，精力每輪扣 1～2。
  - 註解明寫「規則故意簡單可預測……不猜語義」。
  - 另有時間衰減往 60 回落（`loadState`）、閒置回補精力，以及**隨機抖動**（`applyStatJitter`，`index.js:453-481`）。
- **模型能做的**：只有 `feel`：留一句話，最多 5 條（`index.js:1814-1840`）。數值本身模型改不了。

**它說明了什麼**：「人格」是作者寫的卡片，加上作者訂的數值與公式。經歷不改變卡片，數值的變化與經歷的意義無關（只看長度與時間）。

### surfcore（Mieksido，d7f6b33）

- **人格卡**：`roles/*.md`，`roles/README.md` 規定寫「你是誰：身份、性格、說話風格、梗、雷點」。角色可以切換，切換即換人（`src/character-persona.js` 的 epoch）。
- **「目的機制」**（`src/purpose-engine.js`）宣稱「不是關鍵詞映射，而是五步的合流」，實際上是：
  - 需要、行動、情緒都是固定列舉（`PURPOSE_NEEDS`、`ACTION_LABELS`、`EMOTION_LABELS`，`:790-812`）。
  - 每種需要有**固定的驅力權重**（`DEFAULT_DRIVES`，`:814`）。
  - 用**固定的詞表與正則**判斷欲望、計畫、提問、承諾、正負情緒、未解決的事（`DESIRE_RE`、`PLAN_RE`、`PROMISE_RE`、`POSITIVE_RE`、`NEGATIVE_RE`、`UNRESOLVED_RE`…，`:764-829`、`:1426-1427`、`:1620`）。
  - 主動開口：固定排程，白天每 2.5～5 小時最多一次、每天最多 4 次、23:30～08:30 不打擾（`DEFAULT_PURPOSE_CONFIG`，`:23-45`）。
- **記憶卡**：會衰減，另有全量卡（`src/memory-card.js`）。
- **使用者的評語**：「根本沒有人格固有敘事」。

### dsh-agent-soul（cyanwell，504d2d0）

- **「靈魂」**：一套作者規定的結構。
  - 「五層」（`soul/00-layers.md`）、「四條判據」（`soul/01-criteria.md`）。
  - 自我層的模板（`skeleton/03-self.md`）：「必留」的節不能刪、「身份判據要寫成可執行的一條查詢」、「硬線給四類固定項」。
- **主體**：說明文件與體檢工具；不註冊改變行為的鉤子（ADR-0003）。
- **使用者的評語**：「號稱賦予 DSH 靈魂」的劣質插件。

## 2. 記憶插件：哪些交給模型、在什麼脈絡中

| 插件 | 寫死的 | 交給模型的，以及由誰判斷 | 出處 |
|---|---|---|---|
| **hr98w/dsh-memory**（06823e0） | 兩個 scope（Global／Workspace）、記錄格式（feedback／project／reference，與 Claude Code 的記憶相同）、提交的驗證 | 原則「Agent 判断语义，Host 保证安全提交」。整理的語義由模型判斷，程式只決定 scope、驗證 proposal、CAS 提交、留 receipt。**非目標**明寫「不增加 importance、tag 或知识图谱」 | `docs/design.md` §1、§6；`docs/session-consolidation.md` §2 |
| **meow-memory**（7e53a81） | 七層（soul／user／project／fact／lesson／topic／rules，`src/db.ts:23-26`）、分段的近期權重表、閒置 3 小時與尖峰時段 | 整理（dream）**由那個窗口自己的主 agent、對著自己完整的對話脈絡做**。v0.24 起「反思／夢境永遠在主窗口執行，不再提供獨立執行選項」（`src/dream.ts:1-25`、`:46-50`） | 同左 |
| **dsh-memory-evolve**（e6f6b84） | 五軌記憶 | 記憶審查在**主 agent 自己的回合內**做。程式到期就在快照中注入必做的提醒，直到完成；註解寫「weak followers cannot skip a review silently」（`lib/index.js:683-720`） | 同左 |
| **dsh-topics-memory**（c082f82） | 只有四種整理操作、不新增；先在本地依詞彙相似度分群 | 模型只判斷已經相似的 Topic；每次修改一個 git commit，可以整批 revert（`src/consolidate.ts:1-34`） | 同左 |
| **jipika/dsh-memory**（2ca0b15） | 兩層 Markdown、地圖模式的預算階梯（`index.js:370-390`） | 由對話中的 agent 自己寫入、自己按需取回 | `index.js:378`、`:494-517` |

## 3. 對照本專案（只列事實，設計上的結論等論文讀完再寫）

**本專案寫死的類別與模板**（行號以 HEAD 為準）：
- **做法種類**：7 類（`individual/src/rd/aux.ts:16` 的 KINDS）。2026-10-30 的 D22 還把它改成強制作答。
- **重要程度**：4 級（`individual/src/self/state.ts:11` 的 SIGNIFICANCE）。pivotal 會觸發立即整合（`integrate/evidence.ts:152`）；notable 以上的預測落空會產生意外的勢能（`self/energy.ts:91`、`:118`）。
- **懸念類型**：3 類 promise／waiting／unresolved（`rd/memory.ts:52`、`rd/aux.ts:324`），事後比對的提示另附一長串「不算」的規則。
  - 這與 surfcore 的 `PROMISE_RE`、`UNRESOLVED_RE` 是同一種分類，只是改由模型照我的定義歸類。
- **處境格式**：「對方｜對方的意圖｜對方的情緒｜話題｜相關的記憶」。JitRL 的狀態相似度只看其中三欄（`rd/jitrl.ts:109-116` 的 STATE_FIELDS）。
- **主動開口的節奏**：寫死的上限，「每天最多幾次、不連發」（`thought/`）。

**誰在判斷**：
- 本專案的思考（ST）、扣除（RD）、事後比對、重新評價、整合、念頭，都是**另外的輔助呼叫**：固定的系統提示、固定的輸出欄位，個體的自我模型以文字放進輸入。
- 主 agent，也就是和對方說話、帶著全部脈絡的那一個，並不自己做這些判斷。
- meow-memory 與 memory-evolve 則是讓主 agent 在自己的脈絡中做（第 2 節）。

**仍待確認**：這些差異對 PC 理論的意義，要等論文讀完才寫。
