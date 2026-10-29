# WORKLIST

狀態：`[ ]` 未開始、`[~]` 進行中、`[x]` 完成且已驗證（附驗證方式）、`[!]` 阻塞。只有實際跑過的驗證才能打勾。
計畫：`research/decisions/plan-v2-2026-10-28.md`（以 DSH 為身體、TypeScript；ADR-0001）。

## M0 身體與連續生命

- [x] 研究文件、計畫、CLAUDE.md、WORKLIST、session log，首個 commit（245eaa2）
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
- [x] v2 預先登記（d183a39）：記憶 47 題主要比較（隱性運用 15 題）、人格 32 題；目錄配置 home；每輪全部可見文字
- [x] v2 DeepSeek 必要 cell 8 個（錯誤 0）＋計分：PA1 PASS、MA1／MB1 FAIL、MB3 PASS（報告 experiments/results/v2-report.md）
- [x] v2 Nemotron：協定修正 1（改付費端點、固定 bf16 供應商）；四個 cell 錯誤 0；PA2-NEMO、MA2-NEMO、MB2-NEMO PASS（免費端點兩個 cell 存檔不計分）
- [x] v2 全部計分與報告（experiments/results/v2-report.md）
- [x] 發布：改寫歷史（驗證與舊→新對照表：research/decisions/history-rewrite-2026-10-29.md）→ 公開 repo https://github.com/win10ogod/temir（Apache-2.0；驗證：遠端 main 與本機相同，session log 03）

## M1 記憶與 PC 紀錄
- [x] 回憶呈現的修正（c6c363e）：
  - 改以回合呈現，只呈現說出口的話，保留開頭與結尾，依時間排列；
  - 新增「關於對方的長期事實」（H-M2）；
  - 驗證：單元測試，e2e-12 兩個模型。dev1 開發檢查見 session log 03。
- [x] `appraise` 預設對象修正：原本掛到 DSH 注入的 runtime/time-context（v2 日誌中 15 筆全部如此），改為掛到對方說的最後一句話。驗證：單元測試；e2e-13 的感受掛在對方的話上。
- [~] 整合期 `temir-integrate`（H5、H4）：
  - 閒置自動觸發，或由 `integrate` 工具觸發；
  - 產出教訓、重新評價、自我修訂、人生敘事、目標、過時事實；
  - proposal 經確定性驗證，在同一個 transaction 寫入；觀測量只記錄。
  - 驗證：單元測試；e2e-13（DeepSeek）實際整合出 3 條教訓與自我模型第 1 版。**效果未驗證。**
- [~] 人生敘事 `self/narrative`＋`narrate`（H-N，使用者 2026-10-29）：
  - 每步帶入自我狀態；
  - 驗證：e2e-13（DeepSeek）寫出引用經歷的第 1 版。**效果未驗證。**
- [x] 按需披露（ADR-0002 D1）：
  - 2026-10-29 改為預設。dev2（v2 題目已暴露）中，兩個模型都不輸全文：DeepSeek 0.957 vs 0.894、Nemotron 0.979 vs 0.915；注入字數少約三成。
  - **正式比較仍待 E-D1。**
- [x] 初始人設（ADR-0002 D8，使用者 2026-10-29 更正）：
  - 寫成自我模型與人生敘事第 1 版，可在循環中修訂；`TEMIR_PERSONA_FILE`。
  - 驗證：單元測試；e2e-16～18 兩個模型都以人設為起點，之後經整合修訂。
- [x] PC 理論一致性檢查與修正（`research/pc-theory/consistency-review-2026-10-29.md`）：
  - **整合期**：修訂要通過穩定性與適應性兩項判準；觸發來源由個體判斷；深度整合回顧整段生命。
  - **直接修訂**：工具也要兼顧兩項判準。
  - **RD**：事後比對產生感受；準備只給方向；思考時提供工具清單。
  - **檢視**：PC 循環的檢視（`scripts/temir.sh state`）。
  - 驗證：單元測試 70/70；e2e-16～18；dev2、dev3t。
- [x] v3 實驗（題目全新、模擬時間；[`v3-report.md`](experiments/results/v3-report.md)）：
  - 人格連續性：兩個模型都 PASS。
  - 記憶：Nemotron PASS；DeepSeek FAIL，因為原始 DSH 自己寫 `AGENTS.md` 當記憶。
  - E-D1：兩個模型都 PASS，維持按需披露。
- [x] 能量（動能與勢能，H-E、ADR-0002 D10）：已實作；e2e-19 兩個模型驗證承接與釋放。
- [x] 快照的「現在」（日期與星期）。
- [x] 能量第二版（ADR-0002 D10）：懸著的事有 key、觸發與釋放記下是哪一件、懸著直到個體釋放、收緊懸念的定義。單元測試；e2e-20。
- [x] 閒置時的念頭（D11，H0 的內部刺激）、價值與看法（D12，H1-2）、重新評估回報（D13，H2）、轉折後立即整合（D14，性質 4）。單元測試；e2e-20、e2e-21。
- [x] 第二版的懸念是否比較少：dev4 量測。事後比對寫了 left 的比例：記憶 70%、人格 20%（v3 第一版 95–100%）。
- [x] H-E 的消融實驗，三次，DeepSeek，每次都是全新題目、預先登記：
  - 追蹤的差：−0.44、0.00、+0.19，都未達增益門檻；
  - 能量參與了決策，但沒有證據顯示有增益；
  - 報告：`experiments/results/energy-followup-v{1,2,3}-report.md`。
- [x] RD 的扣除（使用者 2026-10-29 說明「−」的意義；ADR-0002 D15）：
  - 單元測試；e2e-22；
  - dev5 沒有退化：探針中有扣除的思考 87/101，真正改變選擇的 5/101。
- [x] 扣除的消融（subtraction-v1，預先登記）：
  - SA FAIL（17/20 vs 18/20）：扣除在運作，但沒有證據顯示它改變了行動；
  - 界線在想出做法時就已經被考慮；
  - 報告：`experiments/results/subtraction-v1-report.md`。
- [x] 評分器 pc-change-v2：同一個選擇只差繁簡寫法算 same。手寫用例 dev 10/10、test 8/8，之後的人格契約採用。
- [ ] 勢能紀錄的品質（新的假說，先寫再檢驗）：
  - 懸念要說得出它推動的行動；
  - 「對方沒回答」與「我還沒回答」不再成為懸念（v3 仍有 5/13）。
- [ ] 其餘假說的消融（各自需要新的、預先登記的實驗）：
  - H-M1：回憶中的感受；
  - H-N：人生敘事；
  - E-RD：依結果調整行為。
  - E-RD 需要隨個體行為改變回應的模擬使用者，例如對方討厭被給建議、只有被傾聽時回應正面。目前的執行器只能送固定台詞，回饋無法依個體實際做了什麼而改變，要先加上這個能力。
- [ ] 回憶同時考慮多人的限制（v3 q51：只顧媽媽的糖尿病，忘了使用者自己的過敏）。
- [ ] 預先登記的新實驗：E-RD（依結果調整行為）、E-Int（整合前後）、能量消融；題目要比 v3 更難（個體在兩個資料集都接近上限）。
- [ ] 記憶主要線對 DeepSeek 的門檻（原始 DSH ≤ 0.25）在不阻擋 DSH 能力的前提下達不到：是否修改要另開規格。
- [x] 價值／看法紀錄（連到證據事件；ADR-0002 D12）
- [ ] 回憶品質量測與改進（換句話說查不到的問題；嵌入向量）

## M2 經驗決策
- [~] RD 階段 `temir-rd`（H0）：
  - 行動前的處境描述、3 個候選、預期後果與口述信心；
  - 準備訊息；
  - 事後比對（回報、教訓），記成 `rd/decision`、`rd/outcome`。
  - 驗證：單元測試；e2e-13（DeepSeek）：
    - 第一輪預測不符，回報 −0.4，並得出教訓；
    - 新 session 中，經驗修正找到這個經驗，思考採用了教訓。

  **效果未驗證。**
- [~] JitRL 經驗修正（arXiv:2601.18510 §3.2–3.3；與論文的差異見 ADR-0002 D3）：
  - 驗證：單元測試涵蓋回報、鄰居、V̂、Q̂、樂觀值、正規化、z' 與選擇。**效果未驗證。**
- [x] 日誌重播（ADR-0002 D16）：
  - 只在支撐集內評估經驗估計（k、處境門檻、行動門檻）；
  - 依時間切分驗證，超過 bootstrap 雜訊帶才採用；
  - α、β、λ、γ 在支撐集內評估不了，維持原值；
  - 單元測試；實驗中的生命不到門檻。
- [x] 價值改變後重新評估舊的回報（ADR-0002 D13）

## M3 技能與自我改進
- [x] 個體自己寫技能（ADR-0003）：
  - 生命日誌中的帳本投影成 DSH 執行期技能；
  - `skill_propose` 與閒置時的回顧；
  - Propose–Probe–Compose 閘門（行為對照，未經量測）；
  - 單元測試；e2e-24（DeepSeek：個體自己提出並採用，閘門擋下過度的修改）。
- [ ] 技能是否讓行為變好（H-S）：預先登記的實驗（有／拿掉技能，全新的同類處境）。
- [ ] 個體寫插件（Harness² 的 middleware、DSH Cordis 插件）：需要使用者核准的路徑。
- [ ] 量測閘門（WikiSkill 驗證集、RRSI 的 δ 與成本規則、退火預算）：只在個體有可驗證任務集時。

## M4 自主性
- [x] 閒置認知與自發行動（ADR-0004）：
  - 對方沉默時的暫時比對；
  - 念頭決定現在就說時主動開口（agent.followup）；
  - 排程規則：不連續追著說、24 小時最多 3 次；
  - e2e-25～29：個體三次都自己判斷不打擾，送出的機制以測試插件驗證。
- [ ] 由真實模型的判斷主動開口並送出（e2e 中個體都選擇不開口）：在長時間的真實使用中觀察。
- [ ] 拒絕與異議紀錄分析
- [ ] 身份連續性實驗（H-ID）
- [ ] Web client 插件：內在狀態面板、生命日誌時間軸、記憶瀏覽；Telegram／LINE／Discord 插件

## 待使用者確認
- `research/pc-theory/hypotheses.md` 的 H0–H5、H-M1、H-ID
- 正式個體何時「誕生」（第一次不帶 `TEMIR_HOME` 啟動即建立 `~/.local/share/temir/life.db`）
- 金鑰曾出現在對話中，建議之後到 DeepSeek 與 OpenRouter 後台輪換
