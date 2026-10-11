#!/usr/bin/env bash
# 一键跑完 Demo 的全部校验（算法一致性 + 渲染冒烟 + 布局回归）
# 用法：bash docs/test.sh [--no-layout]
#   --no-layout  跳过布局回归（它需要本机 Chrome，较慢）
set -e
cd "$(dirname "$0")/.."

NODE="${NODE:-C:/Users/wjh/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe}"
SKIP_LAYOUT=0
[ "${1:-}" = "--no-layout" ] && SKIP_LAYOUT=1

TOTAL=3
[ "$SKIP_LAYOUT" -eq 1 ] && TOTAL=2

echo "================ 1/$TOTAL 算法一致性 ================"
"$NODE" docs/verify-demo.js

echo
echo "================ 2/$TOTAL 渲染冒烟 ================"
"$NODE" docs/verify-render.js

if [ "$SKIP_LAYOUT" -eq 0 ]; then
  echo
  echo "================ 3/$TOTAL 布局回归（需 Chrome） ================"
  if [ -x "/c/Program Files/Google/Chrome/Application/chrome.exe" ] \
     || [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
    bash docs/verify-layout.sh
  else
    echo "SKIP  未找到 Chrome，跳过布局回归"
  fi
fi

echo
echo "全部校验通过 ✅"
