#!/usr/bin/env bash
# 依預先登記規格（experiments/specs/*-v1.md §2.2）的 cell 批次執行。
# 用法：experiments/runner/batch.sh <批次名稱> <平行數> <cell>...
#   cell 格式：資料集:條件:歷史模型:探針模型[:沿用歷史的 runId]，模型為 deepseek 或 local
# 每個 cell 的 runId 為 <RUN_PREFIX>__資料集__條件__歷史模型__探針模型（RUN_PREFIX 預設 v1）。
# RUN_ARGS：附加在每個 run.ts 的參數（v2：--layout home --assistant-text all）。
# DeepSeek 花費：平行執行時無法歸屬到單一 run，改記錄整批前後的帳戶餘額差（只記差額）；每個 run 的花費見 experiments/eval/cost.ts。
# PID 檔：每個 cell 的 run.ts 寫在 $TEMIR_CACHE/run/batch-<批次名稱>/<runId>.pid（結束後移除）。
#   要中止某一格：node cli/host.ts pid-stop <PID 檔>（確認是同一個程序才結束；不要用 pgrep -f 以樣式結束程序）。
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/env.sh"
cd "$TEMIR_REPO"
name="$1"; parallel="$2"; shift 2
logs="$TEMIR_CACHE/experiments/batch-logs"; mkdir -p "$logs"
pids="$TEMIR_CACHE/run/batch-$name"; mkdir -p "$pids"
before=$(node experiments/runner/balance.ts)
started=$(date -u +%FT%TZ)

run_cell() {
  IFS=: read -r ds cond hm pm from <<<"$1"
  local id="${RUN_PREFIX:-v1}__${ds}__${cond}__${hm}__${pm}"
  local args=(--dataset "experiments/datasets/$ds.json" --condition "$cond" --history-model "$hm" --probe-model "$pm" --no-balance --run-id "$id")
  # shellcheck disable=SC2206
  [ -n "${RUN_ARGS:-}" ] && args+=($RUN_ARGS)
  [ -n "${from:-}" ] && args+=(--from-run "$from")
  node experiments/runner/run.ts "${args[@]}" >"$logs/$id.out" 2>&1 &
  local pid=$!
  node cli/host.ts pid-write "$pids/$id.pid" "$pid"
  wait "$pid"
  local code=$?
  rm -f "$pids/$id.pid"
  echo "$(date -u +%T) $id exit=$code $(tail -1 "$logs/$id.out" | cut -c1-200)"
}

running=0
for cell in "$@"; do
  run_cell "$cell" &
  running=$((running + 1))
  if [ "$running" -ge "$parallel" ]; then wait -n; running=$((running - 1)); fi
done
wait
after=$(node experiments/runner/balance.ts)
spent=$(python3 -c "print(round($before - $after, 2))")
printf '{"batch":"%s","startedAt":"%s","endedAt":"%s","cells":%d,"deepseekSpentUsd":%s}\n' \
  "$name" "$started" "$(date -u +%FT%TZ)" "$#" "$spent" | tee "experiments/runs/batch-$name.json"
