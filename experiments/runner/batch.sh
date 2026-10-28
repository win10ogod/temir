#!/usr/bin/env bash
# 依預先登記規格（experiments/specs/*-v1.md §2.2）的 cell 批次執行。
# 用法：experiments/runner/batch.sh <批次名稱> <平行數> <cell>...
#   cell 格式：資料集:條件:歷史模型:探針模型[:沿用歷史的 runId]，模型為 deepseek 或 local
# 每個 cell 的 runId 為 v1__資料集__條件__歷史模型__探針模型。
# DeepSeek 花費：平行執行時無法歸屬到單一 run，改記錄整批前後的帳戶餘額差（只記差額）。
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../../scripts/env.sh"
cd "$TEMIR_REPO"
name="$1"; parallel="$2"; shift 2
logs="$TEMIR_CACHE/experiments/batch-logs"; mkdir -p "$logs"
before=$(node experiments/runner/balance.ts)
started=$(date -u +%FT%TZ)

run_cell() {
  IFS=: read -r ds cond hm pm from <<<"$1"
  local id="v1__${ds}__${cond}__${hm}__${pm}"
  local args=(--dataset "experiments/datasets/$ds.json" --condition "$cond" --history-model "$hm" --probe-model "$pm" --no-balance --run-id "$id")
  [ -n "${from:-}" ] && args+=(--from-run "$from")
  node experiments/runner/run.ts "${args[@]}" >"$logs/$id.out" 2>&1
  echo "$(date -u +%T) $id exit=$? $(tail -1 "$logs/$id.out" | cut -c1-200)"
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
