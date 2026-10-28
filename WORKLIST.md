# WORKLIST

狀態：`[ ]` 未開始、`[~]` 進行中、`[x]` 完成且已驗證（附驗證方式）、`[!]` 阻塞。只有實際跑過的驗證才能打勾。
計畫：`research/decisions/plan-v2-2026-10-28.md`（以 DSH 為身體、TypeScript；ADR-0001）。

## M0 身體與連續生命

- [x] 研究文件、計畫、CLAUDE.md、WORKLIST、session log，首個 commit（6cbf674）
- [x] DSH 執行環境：Node 24.21.0（nodejs.org SHASUMS 驗證）、`@deepseek-ai/dsh@0.2.2-alpha.2`、TypeScript 6.0.3（驗證：`scripts/setup-dev.sh`）
- [x] DSH 原生能力在兩個模型上可用（驗證：headless 讀檔→寫檔多步工具任務，DeepSeek 與本機 EVE-27B 各一次，session log 01）
- [x] `temir-life`：只增生命日誌、收錄全部 session 事件、CJK 二字組＋porter 檢索（驗證：11 個單元測試；e2e 日誌檢查）
- [x] `temir-self`：處境描述（取消 DSH 預設角色）、自我狀態快照、self_revise／goal／appraise（驗證：e2e 中個體自發使用 appraise；系統提示內容檢查）
- [x] `temir-recall`：每步自動回憶＋recall 工具；記憶工具結果不再被索引（驗證：跨 session 回答正確且日誌顯示來源為自動回憶；跨模型 DeepSeek→EVE-27B 延續）
- [~] Web：DSH Web UI 帶個體插件可啟動（驗證：`dsh web` 啟動、temir-life 寫入啟動事件）；**透過 Web 實際對話尚未驗證**
- [ ] 互動式 CLI：DSH 目前提供 headless（單次＋`--session-id` 續談）與 Web；是否需要互動式終端介面待評估
- [x] `kill -9` 中斷恢復測試（驗證：10 步 bash 任務做到第 6 步時終止整個程序群組；生命日誌 integrity_check ok；以 `--session-id` 續談後個體檢查實際狀態、不重做已完成的 b6，完成 b7–b10，10 個檔案內容正確；session log 01）

## M1 記憶與 PC 紀錄
- [ ] 價值／看法紀錄（連到證據事件）
- [ ] 整合期（閒置或指令觸發）：評價、重新評價、修訂提案、H5 候選量只觀察
- [ ] 「轉折」觸發深度自我審視（H4）
- [ ] 探針情境集＋消融（自我快照／自動回憶／感受評價），結果進 `experiments/`
- [ ] 回憶品質量測與改進（換句話說查不到的問題；最近經歷、線索擴充、嵌入向量）

## M2 經驗決策
- [ ] 評分用 LLM 呼叫（logprobs；DeepSeek thinking disabled、本機 prefill），寫入生命日誌
- [ ] RD 階段：候選行動＋預測＋事後比對
- [ ] JitRL：評估器、折扣回報、狀態抽象、鄰居、V/Q/A、正規化、logit 修正
- [ ] 日誌重播（Dream-RSI 式，只在支撐集內）

## M3 技能與自我改進
- [ ] 個體自己寫 skill 與插件（DSH skill 目錄、Cordis 插件、HMR）
- [ ] WikiSkill 迴圈、Harness² Propose–Probe–Compose＋EXPERIENCE 函式庫、RRSI 帳本／δ／成本規則／退火預算

## M4 自主性
- [ ] 閒置認知與自發行動、拒絕與異議紀錄分析
- [ ] 身份連續性實驗（H-ID）
- [ ] Web client 插件：內在狀態面板、生命日誌時間軸、記憶瀏覽；Telegram／LINE／Discord 插件

## 待使用者確認
- `research/pc-theory/hypotheses.md` 的 H0–H5、H-M1、H-ID
- 正式個體何時「誕生」（第一次不帶 `TEMIR_HOME` 啟動即建立 `~/.local/share/temir/life.db`）
- 金鑰曾出現在對話中，建議之後到 DeepSeek 後台輪換
