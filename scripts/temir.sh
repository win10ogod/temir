#!/usr/bin/env bash
# temir 指令。用法：
#   scripts/temir.sh chat [--model deepseek|local] [--session <id>] [--show-thinking]
#   TEMIR_HOME=/path scripts/temir.sh chat ...   指定個體的生命資料目錄（測試時務必指定）
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
command="${1:-chat}"; shift || true
case "$command" in
  chat) exec node "$TEMIR_REPO/cli/chat.ts" "$@" ;;
  *) echo "未知指令：$command（可用：chat）" >&2; exit 2 ;;
esac
