#!/usr/bin/env bash
# 一键跑完 Demo 的全部校验（算法一致性 + 渲染冒烟）
# 用法：bash docs/test.sh
set -e
cd "$(dirname "$0")/.."

NODE="${NODE:-C:/Users/wjh/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe}"

echo "================ 1/2 算法一致性 ================"
"$NODE" docs/verify-demo.js

echo
echo "================ 2/2 渲染冒烟 ================"
"$NODE" docs/verify-render.js

echo
echo "全部校验通过 ✅"
