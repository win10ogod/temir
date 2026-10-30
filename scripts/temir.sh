#!/usr/bin/env bash
# temir 指令。用法：
#   scripts/temir.sh chat [--model deepseek|nemotron|local] [--session <id>] [--show-thinking]
#   scripts/temir.sh state [--cycles 3]          唯讀檢視內在狀態（不呼叫模型、不寫入）
#   scripts/temir.sh telegram [--model deepseek] 在 Telegram 上對話（需要 secrets.env 的 TELEGRAM_BOT_TOKEN 與 TELEGRAM_ALLOWED_CHAT_IDS）
#   TEMIR_HOME=/path scripts/temir.sh chat ...   指定個體的生命資料目錄（測試時務必指定）
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
command="${1:-chat}"; shift || true
case "$command" in
  chat) exec node "$TEMIR_REPO/cli/chat.ts" "$@" ;;
  state) exec node "$TEMIR_REPO/cli/state.ts" "$@" ;;
  telegram) exec node "$TEMIR_REPO/cli/telegram.ts" "$@" ;;
  *) echo "未知指令：$command（可用：chat、state、telegram）" >&2; exit 2 ;;
esac
