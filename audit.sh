#!/usr/bin/env bash
# 布局体检一键脚本：产出样张 → 截图 → 输出截图路径供肉眼复核
set -e
VIEW="${1:-save-list}"
W="${2:-1200}"
NODE="C:/Users/wjh/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/docs/snapshots"
mkdir -p "$OUT"

PAGE=$(MCMATE_EMIT_ONLY=1 MCMATE_VIEW="$VIEW" "$NODE" "$DIR/docs/layout-audit.js" "$VIEW" "$W")
PROFILE="$(mktemp -d)/chrome"
SHOT="$OUT/shot-$VIEW-$W-$RANDOM.png"
echo "SHOT=$SHOT" >&2
"$CHROME" --headless=old --disable-gpu --no-sandbox --no-first-run --hide-scrollbars --disable-application-cache --incognito --disk-cache-size=1 \
  --user-data-dir="$PROFILE" --virtual-time-budget=5000 \
  --window-size="$W,2000" --screenshot="$(cygpath -m "$SHOT")" "$(cygpath -m "$PAGE")" 2>/dev/null
echo "$SHOT"
