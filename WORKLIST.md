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
- [x] 互動式 CLI：`scripts/temir.sh chat`（DSH SDK 協定；續談、換模型、工具審核、個體提問；驗證見 session log 02）
- [x] `kill -9` 中斷恢復測試（驗證：10 步 bash 任務做到第 6 步時終止整個程序群組；生命日誌 integrity_check ok；以 `--session-id` 續談後個體檢查實際狀態、不重做已完成的 b6，完成 b7–b10，10 個檔案內容正確；session log 01）

## 實驗 v1（預先登記：experiments/specs/）
- [x] 記憶準確率與人格一致性：規格、資料集、評估器（65 測試）、執行器；DeepSeek 必要 cell 全部完成（報告 experiments/results/v1-report.md）
- [ ] 本機模型恢復後補跑 v1：人格 × 個體 × EVE-27B（必要）、消融 × EVE-27B、雙向換模型（選用）
- [x] v2 預先登記（9512de4）：記憶 47 題主要比較（隱性運用 15 題）、人格 32 題；目錄配置 home；每輪全部可見文字
- [x] v2 DeepSeek 必要 cell 8 個（錯誤 0）＋計分：PA1 PASS、MA1／MB1 FAIL、MB3 PASS（報告 experiments/results/v2-report.md）
- [x] v2 Nemotron：協定修正 1（改付費端點、固定 bf16 供應商）；四個 cell 錯誤 0；PA2-NEMO、MA2-NEMO、MB2-NEMO PASS（免費端點兩個 cell 存檔不計分）
- [x] v2 全部計分與報告（experiments/results/v2-report.md）
- [ ] 發布：改寫歷史（移除舊餘額、本機模型檔名、references/、papers/）→ 公開 repo（Apache-2.0）

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
