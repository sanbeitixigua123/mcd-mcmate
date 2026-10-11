#!/usr/bin/env bash
# 真机宽度回归：无头 Chrome 强制最小视口约 512px，直接用 --window-size 测不到手机宽度。
# 这里用「iframe 沙盒」绕开限制 —— iframe 拥有独立的布局视口，
# 里面的媒体查询按 iframe 宽度求值，于是可以真实模拟 360/390/414px。
# 用法：bash docs/verify-mobile.sh
set -u
NODE="C:/Users/wjh/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
FAIL=0

PROBE='<script>window.addEventListener("load",function(){setTimeout(function(){
  var d=document.documentElement, bad=[], all=document.querySelectorAll("body *");
  for(var i=0;i<all.length;i++){
    var e=all[i], r=e.getBoundingClientRect();
    if(r.width>0 && r.right>d.clientWidth+1 && !e.closest(".tabs")){
      bad.push((e.className||e.tagName)+"@"+Math.round(r.right));
    }
  }
  var vis=function(s){var n=document.querySelectorAll(s);
    for(var j=0;j<n.length;j++){var rr=n[j].getBoundingClientRect();
      if(rr.width>0) return Math.round(rr.height);} return -1;};
  var bar=document.getElementById("cartBar");
  var out={vw:d.clientWidth, sw:d.scrollWidth, ovf:bad.length, list:bad.slice(0,5),
           menu:vis("#menuBox"), cp:vis("#couponBox"),
           tabs:document.querySelectorAll(".tabs button").length,
           thumb:document.querySelectorAll(".thumb").length,
           bar: bar ? Math.round(bar.getBoundingClientRect().height) : -1};
  var s="MOB::"+JSON.stringify(out);
  document.title=s;
  try{ window.top.document.title=s; }catch(e){}
},700)});</script>'

run_width () {
  local W="$1" VIEW="$2"
  local PAGE
  PAGE=$(MCMATE_EMIT_ONLY=1 "$NODE" "$DIR/docs/layout-audit.js" "$VIEW" 400)
  cp "$PAGE" "$TMP/page.html"
  python - "$TMP/page.html" "$PROBE" << 'PY'
import sys
p, probe = sys.argv[1], sys.argv[2]
h = open(p, encoding='utf-8', errors='replace').read()
open(p, 'w', encoding='utf-8').write(h.replace('</body>', probe + '</body>'))
PY
  cat > "$TMP/harness.html" << HTML
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#e9e9e9}
iframe{width:${W}px;height:844px;border:0;display:block;background:#fff}
</style></head><body>
<iframe id="f" src="page.html"></iframe>
</body></html>
HTML
  local OUT
  OUT=$("$CHROME" --headless=old --disable-gpu --no-sandbox --no-first-run \
        --allow-file-access-from-files --hide-scrollbars \
        --user-data-dir="$TMP/c$W$VIEW" --virtual-time-budget=7000 \
        --window-size=900,950 --dump-dom "$(cygpath -m "$TMP/harness.html")" 2>/dev/null \
        | grep -o 'MOB::{[^<]*' | head -1)
  if [ -z "$OUT" ]; then
    echo "FAIL  $VIEW@${W}px  探测无输出"
    FAIL=1
    return
  fi
  echo "$OUT" | python -c "
import sys, json
raw = sys.stdin.read().strip()
d = json.loads(raw.replace('MOB::','').replace('&quot;','\"'))
W, VIEW = int(sys.argv[1]), sys.argv[2]
msgs = []
if d['vw'] != W: msgs.append(f\"视口异常 {d['vw']}≠{W}\")
if d['sw'] > d['vw'] + 1: msgs.append(f\"横向溢出 {d['sw']}>{d['vw']}\")
if d['ovf'] > 0: msgs.append(f\"越界 {d['ovf']} 个 {d['list']}\")
if d['thumb'] <= 0: msgs.append('无缩略图')
if VIEW.startswith('save'):
    if d['menu'] <= 0: msgs.append('菜单高度为 0')
    if d['cp'] <= 0: msgs.append('券面板高度为 0')
if msgs:
    print(f\"FAIL  {VIEW}@{W}px  \" + '；'.join(msgs))
    sys.exit(1)
print(f\"PASS  {VIEW}@{W}px  视口 {d['vw']} · 文档 {d['sw']} · 菜单 {d['menu']}px · 券 {d['cp']}px · 页签 {d['tabs']} · 缩略图 {d['thumb']} · 底栏 {d['bar']}px\")
" "$W" "$VIEW" || FAIL=1
}

for W in 360 390 414; do
  run_width "$W" save-list
done
run_width 390 save-grid

echo ""
if [ "$FAIL" -eq 0 ]; then echo "真机宽度回归全部通过 ✅"; else echo "存在移动端问题 ❌"; fi
rm -rf "$TMP"
exit $FAIL
