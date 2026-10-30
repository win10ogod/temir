#!/usr/bin/env bash
# 本機的個體 host（dsh web）。用法：
#   scripts/host.sh start           背景啟動 dsh web --no-open，寫 PID 檔，以啟動網址的 token 換 cookie（token 不印出）
#   scripts/host.sh stop            結束 PID 檔記下的程序（連同程序群組）；沒有在執行或 PID 檔過期時安全結束
#   scripts/host.sh status          是否在執行
#   scripts/host.sh telegram-bind   以 dsh-im 綁定 TELEGRAM_BOT_TOKEN 的機器人，並設為安全模式（私聊只允許 TELEGRAM_TEST_USER_ID，群組全部拒絕）
#   TEMIR_HOME=/path scripts/host.sh start   指定個體的生命資料目錄（測試時務必指定；CLAUDE.md 規則 6）
# PID、log、cookie 與網址放在 $TEMIR_CACHE/run/（改進清單第 10 項）。不用 pgrep -f 以樣式結束程序。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
run="$TEMIR_CACHE/run"
mkdir -p "$run"
chmod 700 "$run"
pid="$run/web.pid" log="$run/web.log" cookie="$run/web.cookie" base="$run/web.url"
host() { node "$TEMIR_REPO/cli/host.ts" "$@"; }

case "${1:-status}" in
  start)
    if host pid-status "$pid" >/dev/null; then host pid-status "$pid"; exit 0; fi
    rm -f "$pid" "$cookie" "$base"
    : >"$log"
    chmod 600 "$log"
    # setsid：dsh 與它的子程序在自己的程序群組裡，stop 時一起結束。
    setsid "$TEMIR_REPO/scripts/dsh.sh" web --no-open >>"$log" 2>&1 </dev/null &
    host pid-write "$pid" "$!"
    echo "已啟動（PID $!；TEMIR_HOME=${TEMIR_HOME:-預設的正式個體}；log：$log）"
    host connect "$log" "$cookie" "$base"
    ;;
  stop) host pid-stop "$pid"; rm -f "$cookie" "$base" ;;
  status) host pid-status "$pid" || true ;;
  telegram-bind)
    host pid-status "$pid" >/dev/null || { echo "host 沒有在執行（scripts/host.sh start）" >&2; exit 1; }
    host telegram-bind "$base" "$cookie"
    ;;
  *) echo "未知指令：$1（可用：start、stop、status、telegram-bind）" >&2; exit 2 ;;
esac
