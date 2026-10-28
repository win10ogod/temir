# WikiSkill（arXiv:2608.27454）

來源：`papers/2608.27454/raw/src/main.tex`（§Problem Setup、§Methodology、§Analysis、Limitations、附錄 Algorithm、Implementation Details、Wiki Maintainer／Skill Proposer 提示詞）。無官方程式碼（見 `references/LOCK.md`）。

## 解決的問題

技能演化方法每輪只看當輪軌跡，會重複犯同樣的錯、重提已被否決的修改。WikiSkill 讓技能與一個**持續累積、不回滾**的知識庫（wiki）共同演化。

## 架構與演算法

三層工作區：
- `raw/`：每輪訓練軌跡，**不可變**。
- `wiki/`：`patterns/`（每個失敗模式或成功策略一頁，含根因與做法）、`index.md`（每條一行：問題＋根因＋修法）、`logs.md`（演化日誌）、`skill-impact.md`（由外層程式在驗證後寫入：提案、目標技能、unified diff、驗證分數、接受與否）。
- `skills/`：每個技能一個目錄，`SKILL.md`＋`PURPOSE.md`（連回啟發它的 wiki pattern）。

每輪 $k$（附錄 Algorithm 1）：
1. 推論 agent 用 $S_{k-1}$ 跑訓練集，產生 `raw/`。推論 agent **看不到 wiki**。
2. 取樣軌跡（最多 5 條失敗＋3 條成功，每條截到 15,000 字元），Wiki Maintainer 以 patch 操作（append／replace／insert_after）更新 wiki。
3. Skill Proposer（ReAct，可讀 wiki index、skill-impact、全部訓練結果摘要，按需讀 pattern 與 raw 軌跡）產生**單一技能**的原子提案。
4. 在驗證集評估；分數 > $R_{best}$ 才接受，否則技能回滾、**wiki 保留**。
5. 外層把結果寫入 `skill-impact.md`。

## 證據

- 5 個基準、5 個模型上平均最佳；Gemini-3.5-Flash 的 LiveMath 33.0→72.6。
- 消融（表 3）：Proposer 有 wiki、推論 agent 沒有 wiki 最好（63.7）；推論 agent 也看 wiki 反而降到 60.9；兩者都沒有 48.7。
- 技能可跨模型轉移，但小模型的低階 workaround 會傷害大模型（SpreadSheet 50.5→18.1）。

## 限制（論文自述）

技能全量注入（未研究檢索／觸發）；驗證門檻要求嚴格提升，排除中性提案；wiki 沒有修剪機制；未涵蓋數百步的長任務。

## 前提條件

需要有標準答案的訓練／驗證集與評分函式 $f(\hat y,y)$。開放世界的個體大多數時候沒有這個條件。

## 在個體中的角色

- **三層分離**直接採用：原始經歷不可變（事件日誌）→ 編譯成 wiki（信念、模式、自我知識）→ 編譯成技能。
- **推論時不看 wiki、提案時看 wiki** 的消融結果，提示我們：個體行動時取回的記憶與整合期使用的完整知識庫應分開設計，不要把所有 wiki 頁塞進行動時的上下文。
- **驗證閘門**只能用在個體有可驗證任務集的情境（例如它自己寫的測試、它選擇挑戰的基準）。開放情境改用 Harness² 的對照探測。
