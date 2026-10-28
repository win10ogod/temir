# JitRL（arXiv:2601.18510）

來源：`papers/2601.18510/raw/src/{method.tex, tables/algorithm.tex, appendix.tex, experiments.tex}`；程式碼 `references/jitrl@143d2218`（Jericho 版）。
閱讀範圍：方法、演算法 1、附錄（推導、一致性定理假設、實作細節、超參數、狀態表示消融、可擴展性、成本）、實驗設定中的 logit 取得方式。

## 解決的問題

凍結權重的 LLM agent 在部署後無法持續適應。JitRL 不更新權重，改在推論時用檢索到的經驗估計優勢值，直接修正候選行動的 logits。

## 演算法（論文）

記憶 $\mathcal M=\{(s_i,a_i,G_i)\}$。

1. **回合結束後**：LLM 評估器把軌跡映射成逐步獎勵 $\{r_t\}$（method.tex「Reflective Step-wise Rewards」），計算折扣回報 $G_t=\sum_{u\ge t}\gamma^{u-t}r_u$（eq:discounted_return），存入 $(s_t,a_t,G_t)$。
2. **狀態抽象**：把原始觀察壓成結構化文字狀態，原則是「功能等價的狀態映射到相似表示」（appendix §Implementation Details）。
3. **檢索**：以 Jaccard 相似度取 top-$k$ 鄰居 $\mathcal N(s)$（附錄的 Jericho 版另用向量索引加權 0.75 狀態＋0.25 歷史，再以 Jaccard 過濾）。
4. **價值估計**：$\hat V(s)=\text{mean}_{\mathcal N(s)} G$；已知行動 $\hat Q(s,a)=\text{mean}_{\mathcal N(s,a)} G$；未見行動以機率 $\lambda$ 給 $\hat V(s)+\alpha/|\mathcal N(s)|$，否則給 0（eq:exploration）。
5. **優勢**：$\hat A=\hat Q-\hat V$，再以 $\max|A|+\epsilon$ 正規化（eq:norm_advantage）。
6. **策略更新**：$z'=z+\beta\tilde A$（eq:logit_update），為 KL 約束優勢最大化的閉式解（Theorem 4.1，附錄推導）。
7. **候選集擴充**：LLM 候選 ∪ 鄰居中出現過的行動；記憶專屬行動的基礎 logit 設 0。

**黑箱模型取得 logits**（experiments.tex「Token-level Logit／Verbalized Logit」）：讓模型從 $k$ 個候選中輸出編號，用該編號 token 的 log-prob 當 logit；不提供 logprobs 的模型改用 0–100 的口述信心。

超參數（Jericho，附錄表）：$|\mathcal C|=3$、$\gamma=0.5$、$k=10$、相似度門檻 0.95、$\lambda=0.65$、$\alpha=5$、溫度 0.8。

## 證據與限制

- WebArena、Jericho 上優於記憶型基準與 GRPO；附錄同骨幹比較顯示在持續學習情境下勝過 GRPO。
- 消融（tables/logit_prompt.tex）：logit 更新優於「把相同檢索結果放進 prompt」（Admin 52.31 vs 48.35）。
- 狀態表示消融：結構化文字狀態優於 embedding（後者會把描述相似但結構不同的狀態判為相近）。
- 一致性定理需要「狀態不匹配、策略漂移、變異」三類假設（appendix §Consistency）——**價值會演化的個體違反回報分布平穩的前提**，見下方衝突。

## 論文 ↔ 程式碼差異（`Jericho/src/jitrl_agent.py@143d2218`）

| 項目 | 論文 | 程式碼 |
|---|---|---|
| 探索機率 | 固定 $\lambda$ | `calculate_exploration_probability`：依各行動回報的變異係數與樣本數計算信心，探索機率 $1/(1+\text{conf})$ 並夾在 [0.05, 0.8] |
| 被修正的量 | logit $z$ | `update_scores`：`normalized_prob`（$e^{\text{logprob}}$，是機率不是 logit）加上加權優勢 |
| $\beta$ | 常數 | 隨回合數從 1.0 增到 1.5 的 `episode_weight` |
| 正規化 | $\max_a|A|$ | 正、負優勢分別用最大正值與最大負絕對值正規化 |
| 記憶專屬行動 | 一律加入，logit=0 | 只加入平均回報 > 0 者 |
| 未見行動 bonus | $\alpha/|\mathcal N(s)|$ | `overall_avg + alpha/count`，count 為鄰居回報總數 |
| 行動選擇 | 從 softmax 取樣 | 取修正後最大值（argmax） |
| logprob 位置 | 編號 token | `logprobs.content[-2]`（依其 JSON 輸出格式取倒數第二個 token） |

repo 根目錄沒有授權條款，因此**只參考、不複製**，依論文自行實作；與論文不同的選擇會標明。

## 本專案的 API 前提驗證（2026-10-28，DeepSeek）

- `deepseek-flash` 回傳 top-k logprobs。
- 預設開啟 thinking 時，logprobs 只涵蓋推理後的輸出 token，分布已被推理收斂（例：'1' −0.013、'2' −4.5）。
- 以 `"thinking":{"type":"disabled"}` 關閉時，得到的是未經推理的候選分布（例：'2' −0.17、'3' −2.1、'1' −3.3）。
- 結論：JitRL 的 token-level 評分呼叫應關閉 thinking，或明確記錄使用的是「推理後分布」。兩者是不同的先驗，不能混用。

## 在個體中的角色

用於 PC 循環的 RD 階段：對 ST 產生的候選行動做經驗修正（見 `research/integration.md`）。

**與 PC 的衝突與處理（本專案的延伸，非論文內容）**：
- 論文的評估器以任務成功為準；個體的回報應依它**自己的**價值與目標評估。因此每筆 $G$ 都記錄評估當時的自我狀態版本。
- 價值改變後，舊 $G$ 可能失準。候選做法：保留評估器的理由文字，在整合期依新價值重新評估——這同時實現「根據新經驗改變對過去事件的評價」。此做法違反定理的平穩假設，需實驗觀察。
