# 特密爾（temir）— 專案規範

## 這是什麼

一個長期研究專案：創造一個能持續經歷、記憶、思考、學習及改變自己的人工個體。它的人格（使用者的 PC 理論）與智能共同演化，可以形成自己的目標，也可以不符合創造者的期待。「超級智能」是研究問題，不是交付規格。

- 理論原文：`research/pc-theory/theory.md`（逐字保存，不得改寫）
- 實作假說：`research/pc-theory/hypotheses.md`（全部待使用者確認）
- 架構決定：`research/decisions/ADR-0001-build-on-dsh.md`（以 DeepSeek Harness 為身體、TypeScript、不 fork）
- 現行計畫：`research/decisions/plan-v2-2026-10-28.md`
- 工作清單：`WORKLIST.md`；每次工作階段的紀錄：`research/log/`

## 硬性規則

1. **證據優先**。每個演算法都要能追到論文 TeX 節號／方程式，或 `file:line@commit`；不從 README 或摘要推測。論文的演算法與本專案的延伸要分開標示。
2. **不用 mock 充當完成**。測試替身只能出現在單元測試並明確標示；端到端驗收一律用真實 API（DeepSeek）。沒跑過就寫「未驗證」。
   - Nemotron 不再使用：使用者 2026-10-29「沒必要再用 Nemotron 了，因為證明這樣的差異不大」。
   - 本機模型不再測試：使用者 2026-10-30「不用測本機用ds就行了, 你純粹是設計錯誤導致依賴模型性能和習慣」。同日稍早曾說可選測試，以這句為準；之前的本機結果見 rd-v3、dev10、dev11。
   - **判斷交給模型，但要強制判斷**：使用者 2026-10-30「應該交給模型判斷設計沒問題, 有問題的是沒有作強制要求判斷」。
     - 機制需要的判斷，不能寫成模型「可以」做的提示或選填欄位。
     - 由程式決定何時需要判斷，模型必須逐一明確作答；程式驗證答案，缺了就要求重答。
     - 判斷的內容由模型決定，程式不替它決定。
   - **不關思考**：使用者 2026-10-30「不關思考, 沒法處理思考就是你亂搞」。
     - 個體的模型呼叫一律不關閉思考，輔助呼叫用不關閉思考的最低等級（`recall/aux.ts` 的 `auxEffort`）。
     - 思考內容由 DSH 解析成 reasoning 區塊，不得混進回覆或輔助呼叫的輸出。
   - 模型獨立性的既有證據見 `experiments/results/v2-report.md`、`v3-report.md`。
   - 評分的 judge 固定為 deepseek-v4-pro（thinking disabled）：使用者 2026-10-30「評分可以固定」。受試者與模擬使用者用 deepseek-flash。
3. **不偽造人格／情感／成長指標**。沒有消融或實驗數據，就不能宣稱「記憶／人格參與了決策」。
4. **PC 理論**：不加入固定人格數值、不發明更新公式、不用固定 system prompt 強制人格、不以服從或討喜作為成熟度判準。新想法一律寫成假說放進 `hypotheses.md`。
5. **初始人設可以給，但必須能在循環中改變**（使用者 2026-10-29 澄清）。
   - 初始人設（名字、身份、性格、背景）是 PC 的初始狀態，寫成自我模型與人生敘事的第一個版本（`temir-self` 的 `persona` 設定或 `TEMIR_PERSONA_FILE`），個體可以修訂；不寫進固定的系統提示。
   - 沒有給的話，個體從空白開始。
   - 系統提示只組裝處境描述（`individual/src/self/situation.ts`）；DSH 預設的角色設定（例如 headless 的「coding agent」）由 `individual/cordis.patch.yml` 取消。
   - `卡莉歐碧` 影片只是參考資料，不是指定的人設。
6. **生命日誌只增不改**，而且獨立於 DSH 的 session 格式。測試一律設定 `TEMIR_HOME=~/.cache/temir/test-lives/<名稱>`，不得寫進正式個體（預設 `~/.local/share/temir`）。
7. **不 fork DSH**。用插件、patch、bundle 擴充；擴充點不足時先記錄原因再考慮最小 patch。
8. **機密**：DeepSeek 與 OpenRouter 金鑰、Telegram 測試機器人的 token 與使用者的 Telegram User ID 只存在 `~/.config/temir/secrets.env`（600），以 `DEEPSEEK_API_KEY`、`OPENROUTER_API_KEY`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_TEST_USER_ID` 載入；不得寫進 repo、log、測試夾具或 commit。commit 前掃描暫存檔。
9. **參考 repo 唯讀**：`references/*` 的 HEAD 必須等於 `references/LOCK.md`；不執行其安裝腳本或 hooks。
10. **誠實回報**：失敗、跳過、未完成都照實寫；session log 不美化。

## 環境與指令

```sh
bash scripts/setup-dev.sh        # 一次性：Node 24、DSH 0.2.2-alpha.2、TypeScript 6、node_modules 連結（全在 ext4）
source scripts/env.sh            # PATH、DSH_HOME、金鑰
npm run typecheck                # tsc，型別解析到 DSH 執行期的同一份套件
npm test                         # node:test 單元測試
TEMIR_HOME=~/.cache/temir/test-lives/x scripts/dsh.sh headless --permission-mode workspace-write --approval-policy never "任務"
TEMIR_MODEL=local scripts/dsh.sh web --no-open   # 改用本機模型、開 Web UI
```

- 個體的程式碼是 TypeScript，由 Node 24 直接剝除型別執行（只能用可擦除語法；相對 import 要寫 `.ts`）。
- F: 只剩約 15GB：DSH 執行期、TypeScript、生命資料、DSH home 都在 `~/.cache/temir` 或 `~/.local/share/temir`。
- 模型端點：DeepSeek（預設；`deepseek-flash`、`deepseek-v4-pro`）。
  - 本機 `http://localhost:8000/v1`（sglang `Qwen3.8-Flash-Next`，`dsh/local-model.patch.yml`；harness 的模型名 `local`）：保留設定檔，依規則 2 不再測試。
  - OpenRouter NVIDIA Nemotron（`dsh/openrouter-model.patch.yml`；付費 bf16 經代理 `experiments/runner/openrouter-pin.ts` 與 `dsh/openrouter-bf16.patch.yml`）：保留設定檔，依規則 2 不再使用。

## 目錄

```
individual/         個體（DSH bundle）：src/life、src/self、src/recall、test、cordis.patch.yml
dsh/                額外的 DSH patch（OpenRouter Nemotron、本機模型）
research/           methods/ dsh/ pc-theory/ decisions/ log/
papers/             論文全文（PDF、TeX）與 INDEX.md——只在本機，不入 git、不上傳
references/         參考 repo 與版本鎖定 LOCK.md——只在本機，不入 git、不上傳
experiments/        實驗規格與結果（結果數字只能來自實際執行）
scripts/            env.sh、setup-dev.sh、dsh.sh、dsh_inventory.py
```

## Session log 格式（`research/log/<date>-sNN.md`）

1. 來源（讀了什麼、commit／版本）
2. 已驗證的能力（指令與實際輸出摘要）
3. 測試結果（含失敗）
4. 未解問題
5. 下一項工作

## 與使用者的互動

- 回覆用繁體中文；不要在步驟之間敘述計畫或徵求同意，直接做，最後只回報結果與真正的阻礙。
- commit 由 Claude 自行決定時機（已驗證的里程碑）；不要 push。
