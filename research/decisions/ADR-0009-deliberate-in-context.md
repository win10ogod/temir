# ADR-0009：思考可以放回主 agent 自己的脈絡（2026-10-31）

- 日期：2026-10-31
- 狀態：**2026-10-31 起是預設**（`temir-rd` 的 `mode` 預設 context；原本的輔助呼叫是 `mode: aux`）。
  - context-v1（一段歷史）：C1 不劣 FAIL（記憶多錯 3 題，門檻 ≤ 2），C2 機制 PASS；預設維持輔助呼叫（`experiments/results/context-v1-report.md`）。
  - context-v2（預先登記，再兩段歷史，三段合併）：C1、C2、rd-v4 的護欄都 PASS，照規格改為預設（`experiments/results/context-v2-report.md`）。
    context-v1 的差距在另外兩段歷史中沒有重現，方向也不一致。這不是「context 模式比較好」的證據。
- 觸發：`research/reading/2026-10-30-synthesis.md` §2.3、§3 第 3 點：「判斷放回個體自己的脈絡中……先做成可切換的條件，用實驗比較，不先下結論」。
  使用者對 synthesis 的回答（「思考、扣除、比對、整合、念頭的做法，全部交給個體修訂」）之後，這是 synthesis 中還沒有做的一項。

## 問題

- 思考（ST）與扣除（RD）由另外的輔助呼叫做：固定的框架、個體的做法、重新組出的輸入（自我狀態、回憶、這段對話、對方的話）。
- 主 agent，也就是帶著全部脈絡、與對方說話的那一個，只收到別處產生的「準備」。
- 參考插件的做法相反：
  - dsh-meow-memory v0.24 起，反思與夢境「永遠在主窗口執行」；
  - dsh-memory-evolve 讓主 agent 在自己的回合內做記憶審查，由程式強制（`lib/index.js:683-720`：「weak followers cannot skip a review silently」）。
- 這兩個插件都沒有做對照實驗，所以這只是待檢驗的差異。

## 決定

### 1. 兩種模式共用同一套步驟

- 思考之後的流程寫成一個狀態機（`rd/index.ts` 的 `deliberating`）：思考不合格重問一次、全部扣除重問一次、需要判斷的扣除強制判斷（不合格重問一次）、
  JitRL 經驗修正、寫下 `rd/decision`。
- 輔助呼叫（aux）與 context 模式只差在誰來回答：輔助呼叫的模型，或主 agent 的工具呼叫。強制判斷的驗證完全相同（CLAUDE.md 規則 2）。

### 2. context 模式

- **通知**：對方說話之後（pre-step），放在對方的話與回憶之後。主 agent 已經看得到處境描述、自我狀態、這段對話與回憶，通知只補上它看不到的：
  - 個體自己的思考與扣除做法（ADR-0008，同樣的版本）；
  - 有編號的懸著的事、過去類似處境的經驗（同樣的 E 編號與 sameExcluded 的要求）；
  - `deliberate` 工具的參數：與輔助呼叫的輸出段相同，只有開頭不同。
- **工具**：`deliberate` 一直註冊（工具清單不隨步驟改變，前綴快取才不會失效）。工具結果是下一步：要求重寫、要求判斷扣除（`judgments` 參數），或給出準備。
- **強制**（dsh-memory-evolve 的做法：由程式強制，照實記下）：
  - 思考完成之前，其他工具被 guard 擋下，只能用 recall 查記憶；
  - 回合要結束時還沒有思考，照實記成 `rd/deliberation-failed`（mode＝context，「沒有在回應之前用 deliberate 思考」），下一次的通知提醒；
  - 系統提示多一段處境的事實：對方說話之後要先用 deliberate 思考，只在心裡想不算。
    e2e-42b 中只有通知時，第二、三回合在推理裡照做法想過，卻沒有呼叫工具；加上這段之後，e2e-42c 的 4 個回合都呼叫了。
- **格式錯誤**：主 agent 寫 deliberate 的參數時 JSON 不合法，DSH 以 `MALFORMED_RESPONSE` 結束那一步，整個回合沒有回覆（context-v1 的一次）。
  等待思考中的那一步遇到這種錯誤時重試一次，記成 `rd/request-retry`（`agent/request-error`；f70eec3）。
  context-v2 的 456 個決定中沒有發生格式錯誤，所以重試**仍未以真實模型觸發過**，只有單元測試。
- **程式不能做的**：DSH 沒有 tool_choice（`dsh-llm` README：「`tool_choice` is not mapped」），主 agent 仍可能先說話再思考。
  決定記下 `repliedBefore`，照實計數。
- **紀錄**：
  - 決定寫在它回應的那句話之後（輔助呼叫寫在之前），`openDecision`、`decisionTurn` 照 `mode` 找那一回合；
  - 每次的參數照輔助呼叫的格式記進 `memory/aux`（purpose＝deliberate、mode＝context），做法的閘門可以拿這些輸入以輔助呼叫重跑。
    這是近似：context 模式的真實思考是在主 agent 的脈絡中做的。

## 驗證

- 單元測試（測試替身）：通知的內容、工具結果的三種下一步、扣除的判斷、沒有思考就結束的紀錄與提醒、下一回合的事後比對。
- e2e-42c（DeepSeek）：4 個回合都先呼叫 deliberate（第一回合先用 recall）；事後比對有做。
- context-v1（預先登記，`experiments/results/context-v1-report.md`）：
  - C1 FAIL：記憶主要類別 39/44 vs 42/44；人格 38/39 vs 38/39；拒答與對照相同。
  - C2 PASS：227 個決定，沒有在回應之前思考 0、先說話再思考 3（1.3%）。
  - 只有一次歷史，分不出多錯的 3 題是歷史的變異還是 context 模式的代價。要再比較，需要多次歷史（rd-v4 的做法）。
- context-v2（預先登記，`experiments/results/context-v2-report.md`）：三段歷史合併，記憶主要類別 122/132 vs 123/132、人格 116/117 vs 116/117、
  rd-v4 practical 16/48 vs 19/48，都在不劣的範圍內；C2：0/456 沒有在回應之前思考、4/456 先說話再思考。
- 改預設之後的冒煙測試 e2e-44（DeepSeek，不加 patch 的 headless）：決定是 `mode: context`。

## 已知的限制

- **做法的閘門仍以輔助呼叫重跑思考**（近似）：探測的處境是照輔助呼叫格式記下的輸入，真實的思考是在主 agent 的脈絡中做的；
  現在 context 是預設，這個近似適用於預設的個體。context 模式的紀錄沒有記系統提示的雜湊，不會被當成現行做法的雜訊樣本，
  所以兩個雜訊基準的輸出都要由閘門重跑（每個處境比輔助呼叫模式多一次呼叫）。
  要在主 agent 的脈絡中重跑，需要重建那一回合的完整上下文（DSH 組的訊息、回憶、通知），目前沒有做。
- DSH 沒有 tool_choice，主 agent 仍可能先說話再思考（context-v1 1.3%、context-v2 0.9%），照實記下。
