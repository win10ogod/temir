# RRSI（arXiv:2609.24972）

來源：`papers/2609.24972/raw/src/sections/{2_preliminaries,3_methodology,7_appendix}.tex`；程式碼 `references/rrsi@be50316e`（Apache-2.0）。

## 解決的問題

自動演化 agent harness 是一種系統層級的遞迴自我改進，但會過擬合演化集：演化集上分數大漲，分布外基準上消失。RRSI 不限制可編輯的空間，而是**正則化搜尋軌跡**。

## 演算法

提案端（附錄 Algorithm 1）：
- **退火編輯預算**（類 $L_0$）：$b_t=\lceil b_{\min}+(b_{\max}-b_{\min})\cdot\tfrac12(1+\cos(\pi t/T))\rceil$（eq:anneal；`rrsi/schedule.py:edit_budget`）。
- **證據感知的功勞分配**：每個原子編輯記錄（輪次、元件、假說、diff、ΔS、ΔC、是否被採用）（eq:history；`rrsi/history.py`）。
- **結構化探索**：若 $w$ 輪內進步不超過雜訊帶 $\delta$ 即判定停滯，保留 $m_{draft}$ 個名額給從未嘗試過的元件（eq:explore；`history.py:stall_flag, exploration`）。
- **結構修剪**（類 $L_1$）：最近 $n_{prune}$ 輪內沒有正增益的元件列為刪除目標（eq:prune；`history.py:prune_set`）。
- 元件詞彙：prompt、control_flow、config、output_plumbing、context_mgmt、client_tool、skill、memory、subagent。

選擇端（附錄 Algorithm 2；`rrsi/selection.py:judge, select_round`）：
- **洩漏篩檢**：評估前由 critic 讀 diff，拒絕寫入任務名、答案或演化集專屬邏輯的編輯（`critic.py`）。
- **雜訊下限**：$\hat S(H')\ge S^\star-\delta$；$\delta$ 由重複評估未修改的 base harness 量測（`calibrate.py`：多次評估時取 $z\cdot\text{sd}\cdot$，單次時用 bootstrap，$z=2$）。
- **成本感知接受**（類 $L_2$）：若 $\Delta S>\delta$，要求 $\Delta C\le\beta_0+\beta_1\Delta S$；否則要求 $w_s\Delta S-w_c\Delta C+w_n\nu>0$，$\nu$ 為首次進入採用路徑的結構元件數。
- 從可接受者中選分數最高者；$S^\star$ 只升不降。

超參數（附錄表）：$T$=20/20/40、$k$=2/2/4、$b_{\min}=1$、$b_{\max}$=3–4、$w=3$、$n_{prune}$=4–5、$\beta_0$=0.10–0.15。$\delta$「量測而得、不可調」。

## 證據

8 個基準；演化集最多 +6.0，5 個分布外基準最多 +4.3，policy token 比無正則化演化少 30%。

## 論文 ↔ 程式碼

`selection.py` 的 docstring 逐條對應 Algorithm 2，程式與論文一致；`components.py:classify_diff` 依 diff 內容推定元件類別。

## 前提條件

需要可重複評估的演化任務集與驗證器；每輪要對每個候選完整評估 $k$ 次，成本高。

## 在個體中的角色

作為**一切自我修改的守門規則**（技能、harness 元件、記憶策略、提示）：
- 修改歷史帳本（元件＋假說＋證據）直接採用，也就是個體「記得自己改過什麼、結果如何」。
- 雜訊下限、成本規則、退火預算以純函式移植（Apache-2.0），在有任務集時使用。
- 沒有任務集時，這些門檻無法計算，改用 Harness² 的對照證據，並在紀錄中標明「未經量測閘門」。

**與 PC 的關係**：RRSI 只管「能力」層面的修改。人格（PC 紀錄）的修訂不用分數閘門決定，改用 H5 的穩定性／適應性檢查（見 `research/pc-theory/hypotheses.md`）。
