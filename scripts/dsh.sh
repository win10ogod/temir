#!/usr/bin/env bash
# 以個體的插件啟動 DSH。用法：
#   scripts/dsh.sh headless "任務"            用預設模型（DeepSeek）跑一次
#   TEMIR_MODEL=local scripts/dsh.sh web       改用本機模型（http://localhost:8000/v1）
#   TEMIR_MODEL=nemotron scripts/dsh.sh ...     改用 OpenRouter 上的 Nemotron（需要 OPENROUTER_API_KEY）
#   TEMIR_HOME=/path scripts/dsh.sh ...        指定個體的生命資料目錄（測試時務必指定）
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
patches=(--patch "$TEMIR_REPO/individual/cordis.patch.yml")
case "${TEMIR_MODEL:-deepseek}" in
  local) patches+=(--patch "$TEMIR_REPO/dsh/local-model.patch.yml") ;;
  nemotron) patches+=(--patch "$TEMIR_REPO/dsh/openrouter-model.patch.yml") ;;
esac
profile="$1"; shift
exec dsh --profile "$profile" "${patches[@]}" "$@"
