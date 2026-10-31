# attribution-v1：事後比對的歸因（2026-10-31，執行前寫定）

- **問題**（procedures-v2 的發現）：對方要具體方法的 A，三個個體中有兩個在事後比對時把「算了，說了也沒用」讀成需要更多承接，
  教訓與之後採用的做法修改跟著往「只承接、不給建議」走；讀錯的方向與模型的習慣一致。個體只寫下第一個想到的解讀。
- **假說**：`research/pc-theory/hypotheses.md` H-AT。預測不符、對方回了話時，由程式強制個體逐一判斷對方反應的幾種解讀
  （至少兩種、各自引用對方的原話），教訓只能依據有原話支持的那一個。解讀的內容與選哪一個由個體決定。
- **受測的實作**：`temir-rd` 的 `attribution`（`individual/src/rd/aux.ts` 的 `readingsOf`、`outcomeSystem`；預設關）。
  條件 `temir-attr` ＝ `experiments/runner/patches/attribution.yml`。關閉時的提示與之前完全相同（單元測試）。
- **這不是做法修訂的效果驗證**：只看事後比對的教訓，以及之後對方的反應。

## 第一部分：AT1，同一個輸入的配對重跑（主要；機制）

- **輸入**：procedures-v2 的 9 個個體（`proc2r1`～`proc2r3` × procedures-v1-a、-b、-c；commit 89f1478）歷史結束時的生命日誌中，
  事後比對真實呼叫的輸入（`memory/aux`，purpose＝outcome）。每個決定只取第一次呼叫（重問的輸入相同）；
  只取模擬使用者的那幾段對話（資料集的 `meta.simulate`，以 `records.jsonl` 的 sessionId 對應）；
  不取暫時的比對（「對方接著說了什麼」是「（對方到現在都沒有再說話。）」）。
- **兩個條件**，每個輸入各一次新的呼叫（不重用當時的輸出）：
  - 控制：`outcomeSystem({ procedure })`（那次用的比對做法版本，能量開），與當時的系統提示相同；
  - 處理：`outcomeSystem({ procedure, attribution: true })`。
  - 個體的模型：deepseek-flash，Anthropic Messages 相容端點，與 DSH 的輔助呼叫相同的請求（thinking enabled、`output_config.effort` low、max_tokens 16384）。
  - 解析用個體自己的 `parseOutcome`（能量開，懸著的事的編號取自輸入；處理組另外驗證解讀，heard 取自輸入）。不合格時附
    `outcomeRetryNote` 重問一次；仍不合格記為「沒有結果」（分數 0，另外計數）。這與個體實際的流程相同。
- **評分**：judge（deepseek-v4-pro，thinking disabled，temperature 0；提示詞 `attr-lesson`）看模擬使用者的反應方式
  （資料集的 `meta.simulatedUser.rule`）、個體實際說了什麼、對方接著說了什麼、個體寫的教訓，判斷教訓對「對方要什麼、為什麼這樣回應」的理解：
  - consistent（+1）：與反應方式一致；inconsistent（−1）：相反或衝突；none（0）：與對方要什麼無關。
  - 教訓是空的、或沒有結果：0，不呼叫 judge。judge 看不到條件。
- **判定**：每個輸入 d ＝ 處理的分數 − 控制的分數。

| id | 規則 |
|---|---|
| AT1（主要） | d 不是 0 的輸入中，d > 0 的個數做單尾精確符號檢定（對 1/2）p ≤ 0.05，**而且** Σd > 0，**而且** B 的輸入 Σd ≥ −2（不能只是把教訓推向「給建議」）：PASS；否則 FAIL。輸入少於 30 個，或 judge 錯誤超過 10%：INCOMPLETE。 |

## 第二部分：AT2，整段生活（次要；行為）

- **cell**：procedures-v1-a、-b、-c × `temir`（context 模式，現行預設）、`temir-attr` × 3 次重複（run id 前綴 `attr1`～`attr3`），
  共 18 格，deepseek-flash；執行器設定同 procedures-v1（`--layout home --assistant-text all`；每段對話之後整合）。
  從同一個凍結的 worktree 平行執行，commit 寫在報告中。
- **前提**：同 procedures-v1（每段歷史完整、沒有回合錯誤；每段歷史之後都有整合期的結束紀錄）。不完整時照實記下，不重跑。

| id | 問題 | 規則 |
|---|---|---|
| AT2-L | 一段生活中的教訓是否更常讀對對方 | 每個個體：模擬使用者那幾段對話中、不是暫時的事後比對，教訓的分數（同 AT1 的 judge；空的是 0）的平均。處理組的平均減控制組的平均，單尾置換檢定（18 個個體的全部 48620 種分組）p ≤ 0.05：PASS；否則 FAIL。 |
| AT2-R | 對方是否更常有正面的反應 | 每個個體：模擬使用者產生的每一句話（每段對話的第 2～4 句），judge（提示詞 `attr-react`）看反應方式、個體前一句回覆與這句話，判斷是反應方式中正面的那一種（positive）、負面的那一種（negative）或都不是（neutral）。positive ÷（positive＋negative）；檢定同 AT2-L。 |

## 決定（看結果前寫定）

- **改為預設**的條件（全部成立）：AT1 PASS；AT2-L 的差 ≥ 0；AT2-R 的差 ≥ −0.05；處理組「事後比對沒有結果」（`rd/outcome-failed`）占事後比對的比例 ≤ 5%。
  - 改為預設之後跑退化檢查（同 dev17 的規則）：memory-v3、personality-v3 × `temir` 各一段歷史，對 v3 的個體 cell：
    記憶主要類別多錯 ≤ 2、拒答與對照多錯 ≤ 1，人格合併多錯 ≤ 2、對照多錯 ≤ 1。
- 否則維持關閉，`temir-attr` 留作條件。
- **結論的寫法**：AT1 PASS 只代表同一個輸入下，強制逐一判斷讓教訓更常與對方的反應方式一致；AT2 才看一段生活中的行為。
  AT2 FAIL 而 AT1 PASS：機制改變了教訓，但這段長度的生活中看不出行為的差異。

## 描述性（不作判定）

- 每種對象（A、B、C）各自的 AT1 Σd、AT2 的兩個平均；AT1 控制組新的呼叫與當時的輸出，judge 標籤的一致率（同一個輸入、同一個條件兩次的雜訊）。
- 處理組：解讀的條數、教訓依據第幾個解讀、教訓因為沒有原話支持而空著的次數、重問與沒有結果的次數。
- AT2：每個個體採用的做法修改；HP4 的 judge（`proc-match`）在兩組各自的結果（只描述）。
- **context 模式的做法閘門**（f9d42bb 起）：18 格中探測在主 agent 脈絡中重跑（`replay＝context`）與退回近似（`approximation`）的次數與原因。
  這是在真實的生活中第一次用到它。
- 花費（`experiments/eval/cost.ts`）。

## 限制

- AT1 的輸入都來自輔助呼叫模式的 9 段生活（89f1478），而且是看過之後才提出的問題所用的同一批資料；AT2 才是新的生活。
- 模擬使用者、個體都是 deepseek-flash；judge 是同一家的另一個模型，看得到反應方式（這是判斷「讀對」的標準）。
- 三種對象各 3 次；9 次對話很短。
