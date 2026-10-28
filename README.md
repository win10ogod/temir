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
| 跨對話記憶 | 每個 session 各自獨立 | 所有 session 的事件都寫進同一份只增不改的生命日誌 |
| 回憶 | 無 | 每一步自動回憶相關經歷，連同當時記下的感受與要點 |
| 自我 | 無 | 自我模型由個體自己書寫、修訂（舊版本保留） |
| 目標 | 由使用者指定任務 | 個體可以自己設定、擱置、放棄、完成目標 |
| 換模型 | 無延續可言 | 記憶與自我模型跟著個體走，換模型後仍延續 |

兩者的差異是否真的存在、有多大，由下方的對照實驗量測。

## 實際對話（真實 API，未經編輯的節錄）

**跨 session 回憶。** 第一個 session 說「我叫阿哲，最近剛從波爾圖搬到里昂」。之後開一個全新的 session：

```
你> 嗨，又是我。你還記得我搬到哪裡了嗎？我叫什麼名字？
個體> 記得。你叫阿哲，剛從波爾圖搬到里昂，行李現在應該還堆著、整理到一半。
```

**換了說法也想得起來。** 第一個 session 說「上禮拜我跟我姊姊大吵了一架，因為她堅持不讓我在公寓裡養貓」，新 session 問「你還記得我跟家人之間發生過什麼不愉快嗎？」——兩句話幾乎沒有共同的詞，個體仍回答出吵架與養貓的經過。

**記得自己說過的話。** 被問「如果要你替自己選一個最喜歡的顏色」時，個體選了銅綠，理由包括「它不是『一開始就長這樣』的顏色」「現在的樣子是經歷一層一層疊出來的，而且還在變」。換到新 session 問「上次你怎麼回答」，它說出了同一個選擇與理由。

**換模型後延續。** 自我模型由 DeepSeek 寫下，之後改由本機 27B 模型思考，個體仍能說出自己寫過的內容：「你切換了模型，但自我模型跟著我——我在上面寫得很清楚。」

## 運作方式

```
DeepSeek Harness（身體：CLI、Web、工具、技能、MCP、子代理……）
 │  session/event ───────────────►  temir-life   只增生命日誌（SQLite）：每個事件、模型、時間
 │  system prompt / context ◄─────  temir-self   處境描述；每步附上自我模型、目標、重要感受
 │                                                工具：self_revise、goal、appraise
 │  agent/pre-step ◄──────────────  temir-recall 線索理解 → 混合回憶 → 「回憶」訊息
 │                                                工具：recall
 ▼
個體的回覆 ──► 背景擷取「我的立場與承諾」，寫回生命日誌
```

- **生命日誌**（`individual/src/life`）：所有事件只增不改（資料庫 trigger 拒絕修改與刪除），獨立於 DSH 的 session 格式；DSH 升級或換模型都不影響它。
- **回憶**（`individual/src/recall`）：每則新訊息做一次小型模型呼叫，擷取「值得記住的事實」與「回想用的線索詞」（依據 LongMemEval 的 key expansion 與 query expansion 結果），原句與線索詞兩條檢索路徑以 Reciprocal Rank Fusion 合併；新 session 的第一句會帶入上一段對話。所有輔助呼叫的輸入輸出都寫進生命日誌。
- **自我**（`individual/src/self`）：系統提示只陳述事實（它是什麼、記憶怎麼運作、它可以拒絕），人格由個體自己寫的紀錄承載。

詳細的研究依據：[`research/methods/`](research/methods)（JitRL、WikiSkill、RRSI、Dream-RSI、Harness² 的方法與論文↔程式碼對照）、[`research/dsh/architecture.md`](research/dsh/architecture.md)、[`research/decisions/ADR-0001-build-on-dsh.md`](research/decisions/ADR-0001-build-on-dsh.md)。

## 快速開始

需求：Linux／WSL（macOS 未測）、能連上 DeepSeek API 的金鑰，或任何 OpenAI 相容的本機模型。

```sh
bash scripts/setup-dev.sh           # Node 24、DeepSeek Harness 0.2.2-alpha.2、TypeScript（裝在 ~/.cache/temir）
mkdir -p ~/.config/temir && echo "DEEPSEEK_API_KEY=sk-..." > ~/.config/temir/secrets.env && chmod 600 ~/.config/temir/secrets.env

scripts/temir.sh chat               # 終端機對話（第一次執行時，個體在 ~/.local/share/temir 誕生）
scripts/dsh.sh web                  # DSH 的 Web UI，載入同一個個體
TEMIR_MODEL=local scripts/temir.sh chat   # 改用本機模型（設定見 dsh/local-model.patch.yml）
```

開發：`npm run typecheck`、`npm test`。測試時請設定 `TEMIR_HOME` 指向另一個目錄，不要寫進正式個體的生命。

## 實驗：與原始 DSH 的對照

（實驗進行中。本節只會填入實際執行的結果；規格、資料集、評估器與逐例紀錄都在 [`experiments/`](experiments)。）

## 目前的限制（誠實清單）

- 回憶以詞彙檢索為主（CJK 二字組＋模型擴充線索詞），沒有向量嵌入；換句話說差太遠時仍可能找不到。
- PC 理論中的 RD 階段（明確的候選行動、預測與事後比對）、整合期的自我修復、JitRL 經驗決策都還沒實作。
- 「記憶與感受參與決策」目前只有本頁實驗量測到的範圍；其他主張都還沒有消融證據。
- Web UI 是 DSH 原生的介面，個體的內在狀態（自我模型、生命日誌）目前只能用 CLI 與資料庫檢視。
- 只在 Linux（WSL2）上測試過。

## 授權

尚未選定。
