# 改進清單：可離線驗證的項目（2026-10-30）

給雲端的 Claude Code。清單由主代理起草，Fable 5.1 子代理逐項對照程式碼審查（HEAD a6afd4c），高嚴重度的新發現由主代理再次核對。

## 先讀

- `CLAUDE.md` 的硬性規則，特別是規則 2：
  - **判斷交給模型，但要強制判斷**：程式決定何時需要判斷，模型必須逐一作答，程式驗證、不合格就重問；判斷的內容由模型決定。
  - **不關思考**。
- `research/pc-theory/theory.md` 逐字保存，**不得修改**。
- 環境：先跑 `bash scripts/setup-dev.sh`，再 `source scripts/env.sh`。
- 驗收一律離線：
  - `npm run typecheck`、`npm test`、`npm run -s test:experiments` 全部通過；
  - 基線：individual 129/129、experiments 127/127。
- **不要**：
  - 跑任何會呼叫 DeepSeek 的東西（runner、e2e、score 的 `--judge deepseek`）；
  - 改寫歷史或 force push；
  - 修改 `experiments/runs/`、`experiments/results/` 中既有的紀錄（那些是實驗證據）。
- 測試替身只能用在單元測試，而且要在註解中標明「測試替身」。
- 每一項獨立 commit；commit 訊息用繁體中文，結尾附 Co-Authored-By。
- 在 `WORKLIST.md` 記下做了什麼。改變了模型可見行為的項目，標明「效果未驗證（需真實測試）」。

## 依價值排序

### 1. 暫時比對與正式比對的競態（高）
- **證據**：
  - `individual/src/rd/index.ts:147-149`：`evaluate()` 以 `evaluating` 依決定 id 去重。
  - 沉默計時器的暫時比對（`provisional`，`rd/index.ts` 約 225-245 行，呼叫最多 180 秒）還在進行時，如果對方剛好回話，pre-step 的正式比對 `evaluate(previous, cue, route)` 會直接 return。
  - 同一步又寫入新的決定，`openDecision`（`rd/memory.ts:147-153`）之後拿到的是新決定。舊決定永遠只剩「對方到現在都沒有再說話」的暫時回報，`experiences()` 拿它當經驗。
- **做法**：正式比對不能被暫時比對吃掉。例如：
  - 進行中的是暫時比對時，把正式比對排在它之後執行；
  - 或者讓暫時比對完成後，檢查對方是否已回話，再補做正式比對。
- **驗收**：用第 3 項的可注入 `call`，加上可控的 promise（測試替身），測三種情形：
  - 暫時比對進行中對方回話，最後有一筆非 provisional 的 `rd/outcome`；
  - 沒有回話，只有暫時比對；
  - 沒有重複的正式比對。

### 2. 事後比對：強制判斷（中高）
- **證據**：
  - 輸出無法解析，或 reward 不是數字（`rd/aux.ts:275`）時，`rd/index.ts:182-184` 直接 return：不重問、不留紀錄，那個決定永遠沒有回報。
  - `parseOutcome` 會替模型填預設值：
    - `matched` 缺就填 `partly`（`aux.ts:276`）；
    - `significance` 不合法就填 `daily`（`aux.ts:287`）；
    - `didKind` 填「其他」。
  - `matched` 會進入 surprise 勢能（`self/energy.ts:118`），也是 D20「預測成真與否」的依據（`rd/memory.ts` 的 `renderExperiences`、`renderExclusionReview`）。
- **做法**：
  - `parseOutcome` 改回傳 `{ ok: true, judgment } | { ok: false, problems }`。必填：reward 為數字、`matched` 屬於 yes／partly／no、`didAction` 非空、`significance` 合法。
  - `evaluate` 不合格時，附上 `outcomeRetryNote(problems)` 重問一次。
  - 仍不合格時寫一筆失敗紀錄，例如 `rd/outcome-failed`，內容為決定 id 與 problems；不寫 `rd/outcome`。
  - 提示的內容不變，提示本來就要求這些欄位。
- **驗收**：
  - parser 對每一種缺漏都列出對應的 problems；
  - 第一次壞、第二次好時，寫一筆 outcome；
  - 兩次都壞時，寫一筆失敗紀錄、沒有 outcome。

### 3. rd 與 recall 的 pre-step 可注入模型呼叫，補控制流測試（中）
- **證據**：
  - rd、recall、integrate 的 pre-step 邏輯都在 `apply` 閉包內直接呼叫 `callModel`，無法替換。
  - 已有先例：`skill/index.ts:118-129` 的 `ModelCall` 介面與 `individual/test/skill.test.ts` 的 `scripted()` 替身；`individual/test/thought.test.ts` 末尾的最小假 ctx。
- **做法**：把 rd 的思考步驟抽成可注入 `deps.call` 的函式（例如 `deliberateStep`），recall 同理。行為不變。
- **驗收**（測試替身）：
  - 思考：第一次非 JSON 時重問一次；兩次都壞時不寫決定。
  - 強制判斷：
    - 第一次缺漏時附 problems 重問，合格後寫入 `judgment`；
    - 兩次都不合格時記 `review.failed`，扣除維持；
    - 呼叫失敗時記 `review.failed`。
  - recall：
    - 第一句與壓縮之後是 `working: true`；
    - 短期記憶 7 頁；
    - `excludeIds` 不重複。
- 第 1、2、7 項的測試都建立在這一項上，建議先做。

### 4. 強制判斷重問時遺失第一次的問題（中）
- **證據**：`rd/index.ts` 約 325-335 行。第二次呼叫失敗時，`judged` 變成 undefined，第一次的 problems 不見了，只記「判斷的呼叫失敗」。
- **做法**：兩次的 problems 都保留在 `review.failed`。
- **驗收**：第 3 項的測試。

### 5. 輔助呼叫記下 usage 與 finish；模擬使用者記下 usage；成本彙總（中）
- **證據**：
  - DSH 的 `BlockAssembler` 有 `usage`，串流中有 `type: 'usage'` chunk（dsh-llm 的 `lib/types/assembler.d.ts`、`types.d.ts`）。
  - `individual/src/recall/aux.ts` 的 `callOnce` 只取 blocks，丟掉了 usage 與 finish reason。
  - 所以無法分辨「格式錯」與「思考吃掉輸出上限被截斷」，這是 D21（不關思考）的主要風險。
  - `experiments/runner/simulator.ts` 丟掉回應的 `usage`。
  - 目前的花費只能用帳戶餘額差估算，並行的批次會互相重疊。
- **做法**：
  - `callModel` 回傳並在 `memory/aux` 記下 `usage`（input／output／cacheRead／reasoning tokens）與 `finish`；
  - simulator 回傳 usage，runner 記進該回合；
  - 新增 `experiments/eval/lib/cost.ts`，以價表彙總每個 run 的花費。價表要註明來源；查不到就留空並標明。
- **驗收**：
  - 假串流（測試替身）含 usage 與 finish chunk 時記錄正確；
  - 成本算術的表驅動測試。

### 6. 其他「程式替模型決定」的地方：驗證與重問（中）
只做驗證器、重問說明與重問控制流。這些地方的提示本來就要求這些答案，不改提示的意思。

- **全部候選都被扣除**：`rd/jitrl.ts:198-201` 的 `chooseAmong` 退回分數最高者，等於程式替它選。思考的提示已寫「至少保留一個不扣除的做法」（`rd/aux.ts`）。→ 全扣除時附說明重問一次；仍全扣除就照實記下，不靜默改選。
- **整合的穩定性與適應性**：`integrate/proposal.ts:129-132` 缺判準時當作 `holds: false`，於是保留為提案，等於程式替它決定不採用。`integrate/index.ts:99-100` 整個輸出解析不了也不重問。→ 列出缺判準的項目重問一次；解析不了也重問一次。
- **技能閘門**：`skill/skill.ts:204` 的 `parseCompose` 看不懂時當作 reject。→ 重問一次。
- **事後比對中認不得的懸念編號**：`self/energy.ts:475-483` 會靜默丟掉。→ 記為問題，納入第 2 項的重問。
- **驗收**：每一種的 parser／驗證器測試，以及第 3 項風格的控制流測試。
- 效果標為「需真實測試」。

### 7. 每一步的全表掃描改為增量投影（中）
- **證據**：
  - 每個 pre-step 的 `experiences()`（`rd/memory.ts:93-105`；`rd/index.ts:268`）都對 decision、outcome、revaluation 做三次全表讀取，加上逐列 JSON.parse。
  - `potentialItems()` 每步被呼叫至少 4 次（`rd/index.ts` 約 156、194、282 行，`self/index.ts:135`），每次 `releasedKeys` 掃描 3 類事件（`self/energy.ts:93-95,111,123`）。
  - `goals`、`opinions` 每步各一次（`self/state.ts:164,181`）。
  - `self/state.ts:283` 為了取第一筆，讀出全部的 `life/born`。
  - SQL 有 `(kind, seq)` 索引，成本在物化與解析。生命越長越慢。
- **做法**：
  - 在 LifeStore 外加 `Projection<T>`：記下 lastSeq，用 `after(seq, kinds)` 增量折疊；
  - `experiences` 的重新評估覆寫與 session 內的折扣回報，要能增量維護。
- **驗收**：
  - 等價測試：隨機追加事件序列後，快取結果與不快取的完全相同（deepEqual）；
  - 以計數用的 LifeStore 包裝（測試替身）斷言穩定狀態下每步沒有全表 `all()`。不要用牆鐘時間，以免測試不穩定。

### 8. 實驗工具：多次歷史的合併判定契約化（中）
- **證據**：
  - `experiments/eval/pool-rd.ts` 寫死了條件名、類別、`deepseek` 路徑，以及門檻：0.25／0／0.05、多錯 ≤ 2、機制 ≥ 0.25、少於 4 個為 INCOMPLETE。
  - 這些門檻另外寫在 `experiments/specs/rd-v4.md`，契約中沒有。
  - `pool-rd.ts` 的 `mechanism()` 與 `experiments/eval/rd1-describe.ts` 重複。
  - `pool-rd.test.ts` 只測 `perItemMeans` 與 `actionVerdict`，機制、對照與 INCOMPLETE 的判定都沒有測試。
  - `score.ts` 同一個 cell 有多份歷史時「採用最早的一份」。
- **做法**：
  - 契約加 `replicates`／`pooled` 區塊，門檻從契約讀取；
  - 抽出 `experiments/eval/lib/rd-mechanism.ts`，輸入 decision 資料列，是純函式，兩支腳本共用。
  - 既有的 `rd-v4` 結果要能以新工具重算出相同數字：以 `experiments/results/rd-v4/pooled.json` 為準。這只讀 items 與生命日誌，不呼叫 API。生命日誌只在使用者本機，雲端沒有的話，至少讓 items 部分重算一致。
- **驗收**：三個判定各一組表驅動測試，包括 INCOMPLETE 的邊界。

### 9. 清理 D20 的殘留（低）
- `rd/jitrl.ts` 約 62-66 行：`Candidate.revised` 的註解仍把它寫成現行機制。實際上它只是舊紀錄的相容欄位，現行的是 `judgment`。
- `parseDeliberation`（`rd/aux.ts` 約 197、205 行）仍接受新輸出中的 `revised`。保留解析舊紀錄的能力，但註明用途。
- `rd/memory.ts` 的 `renderPreparation` 中，`c.revised` 那個分支註明是舊紀錄相容。
- `experiments/eval/rd1-describe.ts` 仍在統計 `revised`；改用第 8 項的共用模組，並統計 `judgment`。
- **驗收**：既有測試全部通過；`individual/test/rd.test.ts` 中舊紀錄可解析的那一則保留。

### 10. 程序管理：PID 檔與 host 腳本（低）
- **證據**：
  - `experiments/runner/batch.sh` 約 29-33 行在背景子 shell 執行，沒有 PID 檔。
  - 用 `pgrep -f` 以樣式結束程序，曾經兩次結束到代理自己的 shell（session log）。
- **做法**：
  - batch 為每個 cell 寫 PID 檔；
  - 新增 `scripts/host.sh start|stop|status`：PID 檔放在 `$TEMIR_CACHE/run/`；啟動 dsh web 後，以 `/connect?token=` 換 cookie 存檔，token 不印出。
  - Telegram 綁定的 payload 建構器：綁定並同時設定安全模式白名單，token 與 User ID 從 `TELEGRAM_BOT_TOKEN`／`TELEGRAM_TEST_USER_ID` 讀取；格式以 dsh-im 的型別為準。
- **驗收**：
  - PID 讀寫與 payload 建構的單元測試；
  - 腳本對不存在的 PID 安全結束。
- 真正的啟動與綁定由使用者在本機驗證。

### 11. 繁簡漂移的描述性監測（低）
- **證據**：回覆偶爾出現簡體字，例如「运行」「难受」。`individual/src/recall/script.ts` 已有 `driftedToSimplified`。
- **做法**：新增 `experiments/eval/lib/script-drift.ts`，對 `records.jsonl` 每一回合（對方的話 → 回覆）計數，只輸出描述表。
  - **不得**在處境描述或任何提示中加入語言指示。
- **驗收**：手寫繁、簡樣本的測試。

### 12. 文件整理（低）
- **證據**：
  - `research/log/2026-10-29-s06.md`（約 36 KB）混了 10-30 的段落，CLAUDE.md 要求一次工作階段一份 log；
  - `WORKLIST.md` 中「本機模型」一項沒有註明已依規則 2 停測，RD 的標題沒有提到 D20 第三版與 D21。
- **做法**：
  - 把 10-30 的段落原文搬到 `research/log/2026-10-30-s07.md`。驗收：兩檔串接之後與原檔逐字相同，diff 為空。
  - 更新 WORKLIST 的狀態。
  - 不改寫任何內容的意思；`theory.md` 不碰。

## 需要真實測試，雲端請不要做

- **思考的 `similar`／`sameAs` 改為逐筆強制作答**：每一筆列出的經驗都要回答是否同一處境、每個候選都要回答是否同一做法。
  - 缺漏時目前當作空陣列（`rd/aux.ts` 約 203、214 行），而 JitRL 的鄰居與 Q̂ 比對靠它們（`rd/jitrl.ts`）。
  - 這需要改提示的格式，效果只能用真實模型檢驗。留給本機。
- 任何提示措辭的改變、新的實驗、judge 或模擬使用者設定的改變。

## 不屬於程式的待決事項

- **push 的規則不一致**：CLAUDE.md 寫「不要 push」；但使用者要求過 push，記憶中也記著透過 Windows git push。請使用者決定是否更新 CLAUDE.md，雲端不要改。
