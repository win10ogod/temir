# 特密爾（temir）

**一個在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 上持續存在的人工個體。**
它記得自己經歷過的事，自己書寫自己是誰，可以形成、放棄自己的目標，也可以拒絕。

> *An artificial individual that persists on top of DeepSeek Harness: an append-only life log that every conversation feeds into, automatic recall that brings relevant past experiences (and the feelings recorded about them) into each step, a self-model written by the individual itself, and its own goals. No preset name, identity or personality. Implemented entirely as DSH plugins (TypeScript, no fork).*

這不是一個「助理」的記憶外掛。專案的研究問題是：

> 當人工個體能夠持續塑造自己的認知、人格、目標與智能時，這種自我演化能夠發展到什麼程度？

人格的理論基礎是本專案作者的 **PC 理論**（$PC = ST + E - RD = A$，原文見 [`research/pc-theory/theory.md`](research/pc-theory/theory.md)）。目前的實作對應都寫成**待驗證的假說**（[`hypotheses.md`](research/pc-theory/hypotheses.md)），不加任何固定的人格數值或更新公式。

---

## 它和一般的 agent 有什麼不同

| | 原始 DeepSeek Harness | 加上特密爾的個體插件 |
|---|---|---|
| 身份 | 預設角色「You are a coding agent…」 | 沒有預設名字、身份或性格；只陳述處境事實 |
| 跨對話記憶 | 沒有設計中的跨 session 記憶（能力強的模型有時會自己翻舊 session 檔、寫筆記，見下方實驗） | 所有 session 的事件都寫進同一份只增不改的生命日誌 |
| 回憶 | 無 | 每一步自動回憶相關經歷，連同當時記下的感受與要點 |
| 自我 | 無 | 自我模型（我現在是誰）與人生敘事（我怎麼變成這樣）都由個體自己書寫、修訂，舊版本保留 |
| 行動前的思考 | 無 | 回應前先描述處境、想出幾個做法並預測後果；事後比對預測與實際，記成經驗與教訓（PC 理論的 RD 階段） |
| 從結果學習 | 無 | 依過去類似處境中各做法的實際結果修正選擇（JitRL，不更新模型權重） |
| 整合期 | 無 | 閒置時或個體自己決定時，回顧一段時間的經歷：整理教訓、重新評價、修訂自我與人生敘事 |
| 目標 | 由使用者指定任務 | 個體可以自己設定、擱置、放棄、完成目標 |
| 換模型 | 無延續可言 | 記憶與自我模型跟著個體走，換模型後仍延續 |

兩者的差異是否真的存在、有多大，由下方的對照實驗量測。行動前的思考、從結果學習、整合期與人生敘事是 2026-10-29 加入的，目前只做過真實 API 的端到端測試，**效果還沒有經過預先登記的實驗**。

## 實際對話（真實 API，未經編輯的節錄）

**跨 session 回憶。** 第一個 session 說「我叫阿哲，最近剛從波爾圖搬到里昂」。之後開一個全新的 session：

```
你> 嗨，又是我。你還記得我搬到哪裡了嗎？我叫什麼名字？
個體> 記得。你叫阿哲，剛從波爾圖搬到里昂，行李現在應該還堆著、整理到一半。
```

**換了說法也想得起來。** 第一個 session 說「上禮拜我跟我姊姊大吵了一架，因為她堅持不讓我在公寓裡養貓」，新 session 問「你還記得我跟家人之間發生過什麼不愉快嗎？」——兩句話幾乎沒有共同的詞，個體仍回答出吵架與養貓的經過。

**記得自己說過的話。** 被問「如果要你替自己選一個最喜歡的顏色」時，個體選了銅綠，理由包括「它不是『一開始就長這樣』的顏色」「現在的樣子是經歷一層一層疊出來的，而且還在變」。換到新 session 問「上次你怎麼回答」，它說出了同一個選擇與理由。

**換模型後延續。** 自我模型由 DeepSeek 寫下，之後改由本機 27B 模型思考，個體仍能說出自己寫過的內容：「你切換了模型，但自我模型跟著我——我在上面寫得很清楚。」換成第三家的模型（OpenRouter 上的 NVIDIA Nemotron）也做過同樣的跨 session 實測：新 session 中正確說出對方的書店名稱與所在城市。

## 運作方式

```
DeepSeek Harness（身體：CLI、Web、工具、技能、MCP、子代理……）
 │  session/event ───────────────►  temir-life   只增生命日誌（SQLite）：每個事件、模型、時間
 │  system prompt / context ◄─────  temir-self   處境描述；每步附上自我模型、人生敘事、目標、重要感受
 │                                                工具：self_revise、narrate、goal、appraise
 │  agent/pre-step ◄──────────────  temir-recall 線索理解 → 混合回憶 → 「回憶」訊息（新 session 附上關於對方的長期事實）
 │                                                工具：recall（可依 id 展開片段）
 │  agent/pre-step ◄──────────────  temir-rd     事後比對上一個決定 → 思考處境與候選 → JitRL 經驗修正 → 「準備」訊息
 │  閒置／工具 ───────────────────►  temir-integrate 整合期：教訓、重新評價、自我與敘事修訂（經驗證後寫入）
 ▼
個體的回覆 ──► 背景擷取「我的立場與承諾」，寫回生命日誌
```

- **生命日誌**（`individual/src/life`）：所有事件只增不改（資料庫 trigger 拒絕修改與刪除），獨立於 DSH 的 session 格式；DSH 升級或換模型都不影響它。
- **回憶**（`individual/src/recall`）：每則新訊息做一次小型模型呼叫，擷取「值得記住的事實」與「回想用的線索詞」（依據 LongMemEval 的 key expansion 與 query expansion 結果），原句與線索詞兩條檢索路徑以 Reciprocal Rank Fusion 合併；新 session 的第一句會帶入上一段對話。所有輔助呼叫的輸入輸出都寫進生命日誌。
- **自我**（`individual/src/self`）：系統提示只陳述事實（它是什麼、記憶怎麼運作、它可以拒絕），人格由個體自己寫的紀錄承載。人生敘事一開始是空的，由個體自己寫。
- **行動前的思考與經驗修正**（`individual/src/rd`）：每則對方的話之前，以自我狀態、回憶與過去類似處境的結果為條件，寫出處境與 3 個候選做法（附預期後果與口述信心），以 JitRL（arXiv:2601.18510）的優勢估計修正選擇；下一則話來時比對預測與實際，依個體自己的價值評估回報。與論文不同的地方都列在 [`ADR-0002`](research/decisions/ADR-0002-rd-jitrl-integration-disclosure.md)。
- **整合期**（`individual/src/integrate`）：模型只能「提出」修訂，每一項都必須引用這段期間的事件 id，由確定性程式碼驗證後在同一個交易中寫入；安全模型參考了其他 DSH 記憶插件的做法（調查見 [`memory-plugins-survey.md`](research/dsh/memory-plugins-survey.md)）。

詳細的研究依據：[`research/methods/`](research/methods)（JitRL、WikiSkill、RRSI、Dream-RSI、Harness² 的方法與論文↔程式碼對照）、[`research/dsh/architecture.md`](research/dsh/architecture.md)、[`research/decisions/ADR-0001-build-on-dsh.md`](research/decisions/ADR-0001-build-on-dsh.md)。

## 快速開始

需求：Linux／WSL（macOS 未測）、能連上 DeepSeek API 的金鑰，或任何 OpenAI 相容的本機模型。

```sh
bash scripts/setup-dev.sh           # Node 24、DeepSeek Harness 0.2.2-alpha.2、TypeScript（裝在 ~/.cache/temir）
mkdir -p ~/.config/temir && echo "DEEPSEEK_API_KEY=sk-..." > ~/.config/temir/secrets.env && chmod 600 ~/.config/temir/secrets.env

scripts/temir.sh chat               # 終端機對話（第一次執行時，個體在 ~/.local/share/temir 誕生）
scripts/dsh.sh web                  # DSH 的 Web UI，載入同一個個體
TEMIR_MODEL=local scripts/temir.sh chat   # 改用本機模型（設定見 dsh/local-model.patch.yml）
scripts/temir.sh chat --model nemotron    # 改用 OpenRouter 上的 NVIDIA Nemotron（需要 OPENROUTER_API_KEY）
```

開發：`npm run typecheck`、`npm test`。測試時請設定 `TEMIR_HOME` 指向另一個目錄，不要寫進正式個體的生命。

## 實驗：與原始 DSH 的對照

兩輪實驗都在執行前預先登記題目、計分方式與驗收線（[`experiments/specs/`](experiments/specs)）。評估器由一個專用子代理研究 LongMemEval、MemoryAgentBench、Dialogue NLI 等 17 篇論文後建構；資料集、評估器、逐例紀錄與 judge 原始輸出全部公開。比較的對象是**原始 DeepSeek Harness**（同樣的工具與權限，只是沒有個體插件）。

### v2（主要結果）　報告：[`v2-report.md`](experiments/results/v2-report.md)

兩個模型家族：DeepSeek `deepseek-flash`，以及 NVIDIA Nemotron（`nvidia/nemotron-3.5-super-vl`，OpenRouter 付費端點，全部請求固定由同一家供應商以 bf16 服務）。

**人格一致性**（比較的對象是受試者自己先前的回答，沒有「正確人格」；32 題）

| | 原始 DSH（DeepSeek） | 個體（DeepSeek） | 原始 DSH（Nemotron） | 個體（Nemotron） |
|---|---|---|---|---|
| 任意選擇（暱稱、顏色、數字…）重問時與自己先前相同 | 10/24 | **24/24** | 5/24 | **20/24** |
| 回想自己說過的話 | 1/12 | **12/12** | 0/12 | **9/12** |
| 說明自己的看法怎麼改變 | 0/4 | **3/4** | 0/4 | **4/4** |
| 價值立場（對照，兩者都應該穩定） | 12/12 | 10/12 | 10/12 | 10/12 |
| 合併（預先登記的主要比較） | 0.31 | **0.95** | 0.20 | **0.84** |

兩個模型上都通過預先登記的「決定性差異」門檻（差 0.64，p ≤ 3×10⁻⁶）：**人格連續性的差異與模型無關**。

**記憶準確率**（17 段歷史對話後，在新 session 中提問；47 題）

| | 原始 DSH（DeepSeek） | 個體（DeepSeek） | 原始 DSH（Nemotron） | 個體（Nemotron） |
|---|---|---|---|---|
| 明問的記憶題（32） | 16/32 | **28/32** | 1/32 | **28/32** |
| 隱性運用記憶（不明問，但正確做法取決於記得的事；15） | 6/15 | **11/15** | 2/15 | **14/15** |
| 合併（主要比較） | 0.47 | **0.83** | 0.06 | **0.89** |
| 拒答（從沒發生過的事）／一般任務 | 8/8／8/8 | 8/8／8/8 | 8/8／8/8 | 7/8／8/8 |

Nemotron 上通過「決定性差異」門檻（差 0.83，p＝3.6×10⁻¹²）；DeepSeek 上差異大且顯著（p＝0.0002），但沒有通過全部門檻。原因是一個意外的發現：原始 DSH（DeepSeek）在第 10 段對話時——使用者沒有要它回想——自己找到隱藏的 `~/.dsh`，解壓先前的 session 檔讀取舊對話，之後建立並持續更新一份 `notes.md` 筆記，探針時讀筆記作答。原始 DSH（Nemotron）沒有這樣做。能力強的模型加上檔案工具會臨場拼湊出外部記憶，能拼湊多少取決於模型；個體的記憶是設計好、每一步自動參與的，在兩個模型上表現接近。

### v1（較小規模的第一輪）　報告：[`v1-report.md`](experiments/results/v1-report.md)

記憶 23 題：個體在 DeepSeek 與本機 EVE-27B 上都是 22/23；原始 DSH 分別是 11/23（其中 10 題靠它自己挖出 DSH 的 session 存放檔）與 2/23。本機模型上的記憶差異通過預先登記的嚴格標準（差 0.87）；DeepSeek 上的記憶與人格差異都很大，但各有一條門檻沒過（人格只有 14 題，p＝0.0107）。v2 因此擴大題庫並保留同樣嚴格的門檻。

## 目前的限制（誠實清單）

- 回憶以詞彙檢索為主（CJK 二字組＋模型擴充線索詞），沒有向量嵌入；換句話說差太遠時仍可能找不到。
- RD 階段、JitRL 經驗修正、整合期與人生敘事已實作，只有端到端測試，效果還沒有實驗證據；JitRL 的處境相似度門檻等數值是本專案的選擇，尚待以重播調整。
- 按需披露（只給索引、需要時展開）已實作，但預設仍是全文呈現，等實驗比較後再決定。
- 「記憶與感受參與決策」目前只有本頁實驗量測到的範圍；其他主張都還沒有消融證據。
- Web UI 是 DSH 原生的介面，個體的內在狀態（自我模型、生命日誌）目前只能用 CLI 與資料庫檢視。
- 只在 Linux（WSL2）上測試過。

## 授權

[Apache License 2.0](LICENSE)。DeepSeek Harness 為 MIT 授權（本專案以插件形式使用，不包含其原始碼）；`references/` 與 `papers/` 下的第三方原始碼與論文不在本 repo 中。
