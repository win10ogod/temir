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
- [x] Web：DSH Web UI 帶個體插件可啟動，也可以實際對話。
  - 2026-10-30 e2e-34：透過 DSH Web 介面本身用的 API（`/connect` 換 cookie，`session/create`、`session/prompt`）；
  - 第一段對話自我介紹，新的一段對話中個體記得「你叫阿哲，在桃園的物流倉庫上班」；
  - 兩段都有 RD 的思考；profile 同時載入了 dsh-im。
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
- [~] 勢能紀錄的品質：假說已寫下（hypotheses.md H-E 第四版），實作與檢驗（followup-v4，預先登記）還沒有做：
  - 懸念要說得出它推動的行動；
  - 「對方沒回答」與「我還沒回答」不再成為懸念（v3 仍有 5/13）。
- [ ] 其餘假說的消融（各自需要新的、預先登記的實驗）：
  - H-M1：回憶中的感受；
  - H-N：人生敘事；
  - E-RD：見下一項。
- [x] E-RD：依結果調整行為（rd-v1，預先登記，[報告](experiments/results/rd-v1-report.md)）：
  - 模擬使用者（`experiments/runner/simulator.ts`）依個體實際的回應產生下一句話；runner 以資料集的 `meta.simulate` 接上；評分器檢查模擬的話都有標記；
  - RA FAIL，方向相反：有 RD 2/12、沒有 RD 6/12。主要原因是思考看不到這段對話，也看不到過去類似處境的結果。
  - 修正：
    - D18：思考看得到這段對話；
    - D19：思考時列出回憶帶進來的經歷中做過的決定。
  - 重跑（開發訊號，資料集已暴露）：
    - rd2（D18）仍是 2/12 vs 6/12；
    - rd3（D18＋D19）是 6/12 vs 7/12，「給建議」只被扣除 1/10、被選中 6 次。
- [x] E-RD 第二版（rd-v2，預先登記，[報告](experiments/results/rd-v2-report.md)）：全新的人物與題目，檢驗修正後的 RD。
  - 優越性 FAIL：都是 4/16。
  - 不劣 PASS：rd-v1 的問題已經解決。
  - 扣除仍然多半依模型的預設。
- [x] 扣除本身會被經驗改變（使用者 2026-10-30 確認；ADR-0002 D20；rd-v3，預先登記，[報告](experiments/results/rd-v3-report.md)）：
  - deepseek-flash：機制 R3M PASS（被扣除的比例 0.28 vs 0.82）；行動 R3A FAIL（10/16 vs 4/16，p＝0.0625）。
  - 本機 Qwen3.8-Flash-Next：反向（4/16 vs 13/16），R3M FAIL，`revised` 是 0；事後比對把對方的失望評為非負，過去的扣除成了先例。
  - dev11：同一份本機快照上，D20 關、第一版、第二版都是 4/16，反向來自兩格不同的歷史。第二版（附上預測有沒有成真）開始寫 revised，DeepSeek 沒有變差。
  - dev10 沒有退化（記憶 42/44、人格 38/39）。dev12 檢查的是第二版，被第三版取代而中止。
  - 第三版：強制判斷（使用者：「應該交給模型判斷設計沒問題, 有問題的是沒有作強制要求判斷」）。rd-v4（預先登記，3 次歷史，[報告](experiments/results/rd-v4-report.md)）：
    - R4A FAIL、R4M FAIL；
    - 強制判斷 77 次、0 次不合格，幾乎都維持扣除；
    - 歷史之間的變異遠大於條件之間。
  - dev13（第三版之後的退化檢查）沒有退化：記憶 42/44、人格 38/39。
- [~] 實驗方法：每個條件只有一次歷史，分不清歷史的變異與條件的效果（rd-v3 本機，dev11）。
  - rd-v4 起每個條件 3 次歷史，合併判定（`experiments/eval/pool-rd.ts`）。
  - rd-v4 顯示，3 次仍然不夠：同一條件內是 1/16～13/16。
- [x] 輔助呼叫不關思考（使用者「不關思考」；ADR-0002 D21）：DeepSeek 由 off 改為 low，本機照預設；思考不混進輸出（e2e-37）。
  - 代價：每回合約慢一倍（dev10：記憶 19 → 33 秒）。
  - 逾時放寬為 180 秒。
- [x] 本機模型（可選的第二個模型，使用者 2026-10-30）：
  - e2e-37 通過；
  - dev10 人格對照：個體 38/39 vs 原始 DSH 13/39；
  - rd-v3 本機反向（見上）；
  - memory 的本機對照沒有跑。
- [x] 回憶同時考慮多人的限制（ADR-0002 D17）：
  - 逐人檢查兩版都已實作；
  - multiperson-v1：PA FAIL，+0.17，區間下界 0.06；
  - multiperson-v2：PA FAIL，18/18 vs 17/18，天花板效應；
  - 兩版合計開 32/36、關 28/36，保留為預設。
- [ ] 預先登記的新實驗：E-Int（整合前後）；題目要比 v3 更難（個體在兩個資料集都接近上限）。E-RD 見上；能量消融已做三次。
- [ ] 記憶主要線對 DeepSeek 的門檻（原始 DSH ≤ 0.25）在不阻擋 DSH 能力的前提下達不到：是否修改要另開規格。
- [x] 價值／看法紀錄（連到證據事件；ADR-0002 D12）
- [ ] 回憶品質量測與改進（換句話說查不到的問題；嵌入向量）
- [x] 記憶分區（ADR-0007；使用者 2026-10-30「長短期記憶有分區嗎？」）：
  - 短期：這段對話（DSH 的上下文），以及新 session 開頭最近 7 個回合（MemoryOS 的 STM）；
  - 長期：生命日誌，以檢索帶回；長期事實、教訓、自我模型、敘事、價值、目標、技能；
  - 溢出時：被 DSH 壓縮擠出上下文的部分照常可以檢索（MemGPT 的 recall storage），壓縮之後重新帶入長期事實；
  - 單元測試；e2e-36；dev8 沒有退化（記憶 43/44、人格 39/39）。
  - 狀態檢視與 Web 面板列出記憶分區。
  - 沒有做：遺忘與衰退（要先有實驗）、主題分段（沒有嵌入向量）。

## M2 經驗決策
- [~] RD 階段 `temir-rd`（H0；2026-10-30 起思考看得到這段對話（D18），並列出回憶帶進來的經歷中做過的決定（D19））：
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
- [x] 技能是否讓行為變好（H-S；skills-v1，預先登記）：
  - KA FAIL：有技能 11/12、拿掉 12/12；
  - 技能被載入 14 次，但對方明說過的偏好也在回憶裡；
  - 報告：`experiments/results/skills-v1-report.md`。
- [x] 個體寫插件（ADR-0005）：
  - 程式碼存進生命日誌；
  - 每個新版本啟用前，創造者在 DSH 的核准介面核准；
  - 以 DSH 的 DynamicCordisRunnerService 執行；
  - 核准過的版本在每段對話、DSH 重啟後自動重新啟用；
  - e2e-30。
- [ ] 量測閘門（WikiSkill 驗證集、RRSI 的 δ 與成本規則、退火預算）：只在個體有可驗證任務集時。

## M4 自主性
- [x] 閒置認知與自發行動（ADR-0004）：
  - 對方沉默時的暫時比對；
  - 念頭決定現在就說時主動開口（agent.followup）；
  - 排程規則：不連續追著說、24 小時最多 3 次；
  - e2e-25～29：個體三次都自己判斷不打擾，送出的機制以測試插件驗證。
- [x] 由模型決定的主動開口（ADR-0004）：
  - 有計畫的：e2e-25，個體用 DSH 的排程工具準時送出提醒；
  - 閒置念頭的：送出機制已驗證（e2e-29），四個情境中個體都判斷不必開口（e2e-26～28、32）；
  - 由念頭決定並送出的開口，要在長時間的真實使用中才可能出現。
- [x] 拒絕與異議紀錄分析：狀態檢視列出實際採取的做法是拒絕的決定與結果（`self/view.ts` 的 refusalLines）。
- [x] 身份連續性（H-ID）：
  - 換模型的證據沿用 v2、v3 的 Nemotron 結果；
  - 用 deepseek-v4-pro 的換模型實驗（identity-v1）依使用者決定取消：「deepseek-FLASH 不好嗎？非得 PRO 燒更多錢」。
- [x] Web 的內在狀態面板（temir-panel）：
  - 掛在 DSH 自己的 Web 伺服器上：`/temir/`（狀態）、`/temir/timeline`（生命日誌）、`/temir/search`（回憶搜尋）；
  - 唯讀，只回應本機，並檢查 Host 標頭（擋下 DNS rebinding）；
  - 單元測試，以及真實的 `dsh web`：本機 200、假冒 Host 403。
- [x] 其他通道（ADR-0006）：
  - 使用 dsh-im（使用者建議；13 個渠道），已安裝在正式的 web profile；
  - IM 上的話照常進入個體的回憶與 RD；
  - 主動開口可經 `imTargets` 送到 IM；
  - 插件改在本機面板核准；
  - 與個體一起執行已驗證。
  - 2026-10-30 Telegram（e2e-38）：IM 上的對話與主動開口送到 Telegram 都已驗證；測試中修正了重啟後無法開口、關閉自動念頭時 relay 也關掉這兩個問題。

## 離線改進（`research/proposals/2026-10-30-offline-improvements.md`，雲端 2026-10-30）
只跑離線驗證：`npm run typecheck`、`npm test`、`npm run -s test:experiments`；沒有呼叫任何外部 API。
- [x] 第 3 項：rd、recall 的 pre-step 可注入模型呼叫。
  - `createRd`、`createRecall` 只依賴生命日誌與 `deps.call`（`recall/aux.ts` 的 `CallModel`；正式執行是 `modelCaller(ctx)`），DSH 的訊息、工具與計時器留在 `apply`。行為不變。
  - 控制流測試（測試替身）：`individual/test/rd-step.test.ts`（思考重問、強制判斷三種情形）、`recall-step.test.ts`（第一句與壓縮之後的 working、短期記憶 7 頁、excludeIds 不重複）。
- [x] 第 1 項：暫時比對與正式比對的競態。
  - 暫時比對進行中對方回話時，正式比對排在它之後執行（`rd/index.ts` 的 `evaluating`），不再被丟掉；正式比對進行中或已排隊時不重複。
  - 測試（可控的 promise，測試替身）：回話時最後有一筆非 provisional 的 `rd/outcome`；沒有回話只有暫時比對；沒有重複的正式比對。修正前的程式跑這組測試有兩則失敗。
  - 效果未驗證（需真實測試）：之前被吃掉的正式比對現在會寫進經驗。
- [x] 第 2 項：事後比對改為強制判斷。
  - `parseOutcome` 回傳 `{ ok, judgment } | { ok: false, problems }`，不再替模型填 matched、significance 的預設值；必填：reward 是數、matched、didAction、significance。didKind 不在必填之列，認不得時仍記為「其他」（範圍照清單；是否也要強制，待決定）。
  - 不合格時附 `outcomeRetryNote(problems)` 重問一次；仍不合格或呼叫失敗時寫 `rd/outcome-failed`（決定 id 與兩次的 problems），不寫 `rd/outcome`。沉默計時器看到失敗紀錄就不再每分鐘重做暫時比對；對方回話時仍會正式比對。提示內容不變。
  - 測試：每一種缺漏的 problems；第一次壞、第二次好時一筆 outcome；兩次都壞時一筆失敗紀錄、沒有 outcome；呼叫失敗。
  - 效果未驗證（需真實測試）：重問會多一次模型呼叫，不合格的比對不再以預設值成為經驗。

## 待使用者確認
- `research/pc-theory/hypotheses.md` 的 H0–H5、H-E、H-M1、H-M2、H-N、H-S、H-ID
- 正式個體何時「誕生」（第一次不帶 `TEMIR_HOME` 啟動即建立 `~/.local/share/temir/life.db`）
- 金鑰曾出現在對話中，建議之後到 DeepSeek 與 OpenRouter 後台輪換
- IM 的正式使用：測試已用使用者提供的 Telegram 機器人完成（測試 DSH_HOME、安全模式只允許使用者）。
  - 正式的 web profile 要不要接這個機器人，由使用者決定。
  - 機器人的 token 曾出現在對話中，建議測試後到 @BotFather 重新產生。

