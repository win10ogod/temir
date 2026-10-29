# 中止：dev1 的兩個 Nemotron cell（不計分）

`aborted__dev1__memory-v2__temir__nemotron-bf16__nemotron-bf16`、`aborted__dev1__personality-v2__temir__nemotron-bf16__nemotron-bf16`

2026-10-29 02:48 UTC，固定 bf16 供應商的本機代理（`experiments/runner/openrouter-pin.ts`）因上游 `read ETIMEDOUT` 而結束：
它的串流沒有 error 監聽器，未處理的錯誤讓整個程序結束。之後兩個 cell 的模型請求都連不上，DSH 以
`turn/end`（`error: Connection error`，`TRANSPORT`）結束每個回合。當時的執行器沒有從 turn/end 記下錯誤，
所以 `run-summary.json` 的 `turnErrors` 是 0，但記憶 cell 有 44／63 題、人格 cell 有 38／64 題沒有回覆。

這是基礎設施故障，不是個體的行為。兩個 cell 保留原樣、不計分，以修正後的代理與執行器（commit 121debf）重跑。
