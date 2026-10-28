# WORKLIST

狀態：`[ ]` 未開始、`[~]` 進行中、`[x]` 完成且已驗證（附驗證方式）、`[!]` 阻塞。只有實際跑過的驗證才能打勾。

## M0 身體

- [x] M0-1 研究文件、計畫、CLAUDE.md、WORKLIST、session log，首個 commit（驗證：`git log`、`git show --stat`，暫存檔無金鑰）
- [ ] M0-2 `temir-kernel`：Context／service registry／inject 等待／5 種事件派發／可逆 effect／fiber 狀態機（驗證：單元測試涵蓋每種派發模式、依賴等待、卸載反序釋放、isolate）
- [ ] M0-3 `temir-store`：SQLite WAL 只增事件日誌、session 投影、FTS5（驗證：重放一致性測試；寫入中 `kill -9` 後重開無損）
- [ ] M0-4 `temir-llm`：OpenAI 相容串流＋tool calls＋logprobs＋thinking 控制＋影像；能力探測寫成事件；`temir probe`（驗證：對 DeepSeek 與本機各跑一次，輸出進 session log）
- [ ] M0-5 `temir-tools`：註冊表、pre-execute waterfall、guard、approval、execute、post-execute；fs 與 shell 工具（驗證：管線單元測試；拒絕／詢問／允許三種路徑）
- [ ] M0-6 `temir-agent`：turn/step 迴圈、PC 四段事件（perception／deliberation／preparation／action／outcome）、中斷與恢復（驗證：事件日誌可重建每個模型請求）
- [ ] M0-7 `temir-server`＋`temir-cli`：daemon、SSE、chat 客戶端（驗證：CLI 對兩個模型各完成一個多步工具任務）
- [ ] M0-8 `web/`：對話＋生命日誌時間軸（驗證：Web 即時看到 CLI 進行中的同一 session）
- [ ] M0-9 端到端驗收：多步工具任務 ×2 模型、Web 同步、`kill -9` 恢復、探測紀錄；session log 更新；commit

## M1 記憶與 PC 紀錄
- [ ] 投影層（事實／經歷／看法／自我模型／目標／感受評價），每筆連到來源事件
- [ ] 行動時取回（結構＋FTS5＋時間）；整合期（評價、重新評價、修訂、穩定性／適應性候選量只觀察）
- [ ] 探針情境集與消融實驗（移除自我狀態／移除感受評價），結果進 `experiments/`

## M2 經驗決策
- [ ] JitRL：評估器、折扣回報、狀態抽象、鄰居檢索、V/Q/A、正規化、logit 修正（兩種取 logit 方式都標明）
- [ ] 日誌重播（Dream-RSI 式，只在支撐集內）調 k／β／λ 與取回規則

## M3 技能、插件、自我改進
- [ ] 技能目錄 provider、MCP client（rmcp）、行程外插件管理
- [ ] WikiSkill 迴圈（有驗證集時）、Harness² Propose–Probe–Compose＋EXPERIENCE 函式庫、RRSI 帳本／δ 校準／成本規則／退火預算

## M4 自主性與對齊項目
- [ ] 自主目標、閒置認知排程、拒絕與異議紀錄
- [ ] 身份連續性實驗（DeepSeek↔本機切換）
- [ ] 依 `research/dsh/feature-matrix.md` 補 Harness 能力；Telegram／LINE／Discord 插件

## 待使用者確認
- `research/pc-theory/hypotheses.md` 的 H0–H5、H-M1、H-ID
- 金鑰曾出現在對話中，建議之後到 DeepSeek 後台輪換
