#!/usr/bin/env bash
# 建立（或檢查）開發環境。可重複執行；已存在的部分只做檢查。
# 不執行任何參考 repo 的腳本；DSH 從 npm 官方 registry 安裝鎖定版本。
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

NODE_VERSION=v24.21.0
DSH_VERSION=0.2.2-alpha.2   # 對應 references/LOCK.md 的 deepseek-harness f3803c96
TS_VERSION=6.0.3            # 與 DSH repo devDependencies（^6.0.3）一致

# 1. Node 24（DSH engines: >=24.9.0），以 nodejs.org SHASUMS256 驗證
if [ ! -x "$TEMIR_NODE_DIR/bin/node" ]; then
  mkdir -p "$TEMIR_CACHE/baseline" && cd "$TEMIR_CACHE/baseline"
  tarball="node-$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/$tarball"
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" | grep " $tarball\$" | sha256sum -c -
  tar -xJf "$tarball"
fi
echo "node: $(node --version)"

# 2. DSH 執行期（全域安裝到隔離的 prefix）
if [ ! -x "$TEMIR_DSH_RUNTIME/bin/dsh" ]; then
  mkdir -p "$TEMIR_DSH_RUNTIME"
  npm_config_cache="$TEMIR_DSH_RUNTIME/npm-cache" npm install -g --prefix "$TEMIR_DSH_RUNTIME" "@deepseek-ai/dsh@$DSH_VERSION"
fi
echo "dsh: $(dsh --version)"

# 3. TypeScript（只用於型別檢查；個體的程式碼由 Node 24 直接剝除型別執行）
if [ ! -x "$TEMIR_TOOLS/node_modules/.bin/tsc" ]; then
  mkdir -p "$TEMIR_TOOLS" && cd "$TEMIR_TOOLS"
  [ -f package.json ] || npm init -y >/dev/null
  npm install --save-exact "typescript@$TS_VERSION"
fi
echo "tsc: $(tsc --version)"

# 4. 讓 repo 內的 import 解析到 DSH 執行期的同一份套件（同一個模組實例）
dsh_modules="$TEMIR_DSH_RUNTIME/lib/node_modules/@deepseek-ai/dsh/node_modules"
mkdir -p "$TEMIR_REPO/node_modules"
ln -sfn "$dsh_modules/@deepseek-ai" "$TEMIR_REPO/node_modules/@deepseek-ai"
ln -sfn "$dsh_modules/@types" "$TEMIR_REPO/node_modules/@types"
echo "linked node_modules/@deepseek-ai and node_modules/@types -> $dsh_modules"
