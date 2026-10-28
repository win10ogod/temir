# 用法：source scripts/env.sh
# F: 空間有限，建置產物與快取一律放 WSL ext4。
export TEMIR_CACHE="${TEMIR_CACHE:-$HOME/.cache/temir}"
export CARGO_TARGET_DIR="$TEMIR_CACHE/target"
mkdir -p "$CARGO_TARGET_DIR"
# DeepSeek 金鑰放在 repo 外（權限 600），只以環境變數載入。
if [ -f "$HOME/.config/temir/secrets.env" ]; then
  set -a; . "$HOME/.config/temir/secrets.env"; set +a
fi
