#!/usr/bin/env bash
# 布局回归检查：在多个视口宽度下渲染真实页面，检测横向溢出与内容塌陷。
# 用法：bash docs/verify-layout.sh
set -u
NODE="C:/Users/wjh/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
FAIL=0

PROBE='<script>window.addEventListener("load",function(){setTimeout(function(){var d=document.documentElement;var bad=[];var all=document.querySelectorAll("body *");for(var i=0;i<all.length;i++){var e=all[i];var r=e.getBoundingClientRect();if(r.width>0&&r.right>d.clientWidth+1&&!e.closest(".tabs")){bad.push((e.className||e.tagName)+"@"+Math.round(r.right))}}var vis=function(s){var n=document.querySelectorAll(s);for(var j=0;j<n.length;j++){if(n[j].getBoundingClientRect().width>0)return n[j].getBoundingClientRect().height}return -1};document.title="OVF::"+JSON.stringify({sw:d.scrollWidth,cw:d.clientWidth,n:bad.length,list:bad.slice(0,6),menu:Math.round(vis("#menuBox")),cp:Math.round(vis("#couponBox")),thumb:document.querySelectorAll(".thumb").length})},500)});</script>'

for spec in "save-list:1200" "save-list:860" "save-list:420" "save-grid:1200" "save-grid:420" "cal:1200" "cal:420" "set:1200" "mcp:1200"; do
  VIEW="${spec%%:*}"; W="${spec##*:}"
  PAGE=$(MCMATE_EMIT_ONLY=1 "$NODE" "$DIR/docs/layout-audit.js" "$VIEW" "$W")
  cp "$PAGE" "$TMP/p.html"
  python - "$TMP/p.html" "$PROBE" << 'PY'
import sys
page, probe = sys.argv[1], sys.argv[2]
h = open(page, encoding='utf-8', errors='replace').read()
open(page, 'w', encoding='utf-8').write(h.replace('</body>', probe + '</body>'))
PY
  OUT=$("$CHROME" --headless=old --disable-gpu --no-sandbox --no-first-run \
        --user-data-dir="$TMP/c$W$VIEW" --virtual-time-budget=8000 \
        --window-size="$W,900" --dump-dom "$(cygpath -m "$TMP/p.html")" 2>/dev/null \
        | grep -o 'OVF::{[^<]*' | head -1)
  if [ -z "$OUT" ]; then
    echo "FAIL  $VIEW@$W  渲染探测失败"
    FAIL=1
    continue
  fi
  JSON="${OUT#OVF::}"
  SW=$(echo "$JSON" | python -c "import sys,json;d=json.load(sys.stdin);print(d['sw'])")
  CW=$(echo "$JSON" | python -c "import sys,json;d=json.load(sys.stdin);print(d['cw'])")
  N=$(echo "$JSON"  | python -c "import sys,json;d=json.load(sys.stdin);print(d['n'])")
  MENU=$(echo "$JSON" | python -c "import sys,json;d=json.load(sys.stdin);print(d['menu'])")
  CP=$(echo "$JSON"   | python -c "import sys,json;d=json.load(sys.stdin);print(d['cp'])")
  THUMB=$(echo "$JSON" | python -c "import sys,json;d=json.load(sys.stdin);print(d['thumb'])")
  MSG=""
  if [ "$SW" -gt "$((CW + 1))" ]; then MSG="$MSG 横向溢出 ${SW}>${CW}"; fi
  if [ "$N" -gt 0 ]; then MSG="$MSG 越界元素 ${N} 个"; fi
  if [ "$MENU" -le 0 ] && [ "${VIEW%%-*}" = "save" ]; then MSG="$MSG 菜单高度为 0"; fi
  if [ "$CP" -le 0 ] && [ "${VIEW%%-*}" = "save" ]; then MSG="$MSG 券面板高度为 0"; fi
  if [ "$THUMB" -le 0 ]; then MSG="$MSG 无缩略图"; fi
  if [ -z "$MSG" ]; then
    echo "PASS  $VIEW@${W}px  文档 ${SW}px / 视口 ${CW}px · 菜单 ${MENU}px · 券 ${CP}px · 缩略图 ${THUMB}"
  else
    echo "FAIL  $VIEW@${W}px ${MSG}"
    FAIL=1
  fi
done

echo ""
if [ "$FAIL" -eq 0 ]; then echo "布局回归全部通过 ✅"; else echo "存在布局问题 ❌"; fi
rm -rf "$TMP"
exit $FAIL
