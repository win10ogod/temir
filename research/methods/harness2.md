# Harness²（arXiv:2610.14224）

來源：`papers/2610.14224/raw/src/sections/{01_introduction,03_method,04_experiments,05_analysis,appendix}.tex`、`tables/components.tex`；程式碼 `references/harness2@1cfe254e`（Apache-2.0）。

## 解決的問題

開放世界任務在設計 harness 時沒見過、也沒有標準答案驗證器；RSI 過程本身又高度任務專屬，無法轉移。

## 演算法

Harness＝8 個以檔案形式掛載的可編輯元件（tables/components.tex）：system prompt、guardrails、memory（LongTermMEMORY.md）、skills、tool guidance、scripts、subagents、middleware plugin（在工具迴圈中**強制**而非**指示**行為）。

**任務層遞迴**（§Task-Level Recursion）——對照改進步驟 Propose–Probe–Compose：
1. **Propose**：先跑一次參考執行 $e^0$；依任務、現行 harness、參考執行、歷史與改進函式庫，提出兩個候選：**不變式**（跨領域的 agent 缺陷，如規劃、工具使用、上下文管理）與**領域專屬**（此領域的知識、程序、限制）。
2. **Probe**：同一任務、同模型與環境下執行候選，與參考比較，得到**行為對照**證據（不是正確性驗證）。
3. **Compose**：讀取所有執行證據與 diff，選擇性合併、修正、採用其一或保留現狀；每個決定都綁定具體觀察。
- 平行遞迴：$k$ 個參考、$k$ 個不變式＋$k$ 個領域候選、$k$ 個獨立合成（`core/recursion.py:run_parallel`）；序列遞迴：串接 $k$ 步（`run_sequential`）。$k>1$ 時由匿名比較 deliverable 的選擇器挑一個。

**Harnessing 層遞迴**（§Harnessing-Level Recursion）：任務結束後反思整個改進紀錄，只保留**有執行對照支持**的教訓；把採用的 harness 與 `EXPERIENCE.md`（適用情境、教訓、證據）存入改進函式庫（`core/library.py:Library`）。下一個任務仍從共同的 $\mathcal H_0$ 開始，但改進過程可以參考函式庫。

實作細節（appendix §Improvement Sessions）：證據以檔案交給改進 session；有防護會拒絕交出含評分結果或 rubric 的目錄（`core/context.py:assert_no_grader_verdicts`）；無效樹重試一次後回退。

## 證據

WorkBuddy-Bench 最多 +11.5、JobBench +4.5、LAB +11.8；$k$ 從 1 到 5 單調提升。消融：去掉函式庫 −3.1／−1.8，去掉範圍分工 −2.9／−3.7，去掉合成 −1.6／−1.9。同一模型兼任執行者與編輯者也有提升（不需要更強的編輯者）。沒有參考執行、探測與函式庫而直接改 harness 會**降低**表現（Code 73.4→63.2）。

## 前提條件

任務可以在有限預算內重跑；每次改進的成本約 $4k$ 次執行＋$3k$ 次改進 session。

## 在個體中的角色

- 開放情境下的自我改進主幹：個體沒有標準答案時，仍可用「改前／改後的行為對照」作為證據。
- `EXPERIENCE.md` 函式庫對應個體的「改進經驗記憶」：它不只記得任務，也記得**自己怎麼變好**。
- 中介 plugin 元件（強制行為）與 DSH 的 waterfall 事件（`tools/pre-execute` 等）是同一種機制，個體可以為自己寫 plugin。
- 「沒有證據的直接修改會變差」是重要的負面證據：個體修改自己時必須先有對照執行。
