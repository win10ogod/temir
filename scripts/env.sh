# 用法：source scripts/env.sh
# 執行環境全部放 WSL ext4（F: 空間有限）：Node 24、DSH 執行期、TypeScript、DSH home。
export TEMIR_CACHE="${TEMIR_CACHE:-$HOME/.cache/temir}"
export TEMIR_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TEMIR_NODE_DIR="${TEMIR_NODE_DIR:-$TEMIR_CACHE/baseline/node-v24.21.0-linux-x64}"
export TEMIR_DSH_RUNTIME="${TEMIR_DSH_RUNTIME:-$TEMIR_CACHE/dsh-runtime}"
export TEMIR_TOOLS="${TEMIR_TOOLS:-$TEMIR_CACHE/tools}"
export PATH="$TEMIR_DSH_RUNTIME/bin:$TEMIR_NODE_DIR/bin:$TEMIR_TOOLS/node_modules/.bin:$PATH"
# DSH 的設定、session 與 profile；與個體的生命資料分開。
export DSH_HOME="${DSH_HOME:-$TEMIR_CACHE/dsh-home}"
# 本機 sglang 不驗證金鑰，但 pi-ai 的 OpenAI 相容實作要求一個值（llm-pi-ai README §Known Limitations）。
export LOCAL_LLM_API_KEY="${LOCAL_LLM_API_KEY:-none}"
# DeepSeek 金鑰放在 repo 外（權限 600），只以環境變數載入。
if [ -f "$HOME/.config/temir/secrets.env" ]; then
  set -a; . "$HOME/.config/temir/secrets.env"; set +a
fi
