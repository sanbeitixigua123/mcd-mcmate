#!/usr/bin/env node
/**
 * 布局体检工具 —— 用真实 index.html 在无头 Chrome 里渲染，
 * 抽取每个关键容器的几何盒模型，自动报告排版缺陷（溢出、错位、截断、失衡）。
 *
 * 用法：node docs/layout-audit.js [视图] [宽度]
 *   视图: save-list | save-grid | cal | set | mcp | all
 *   宽度: 如 1200 / 900 / 420
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');

/* ============ 1. 用真实渲染函数产出静态样张（复用 snapshot.js 思路） ============ */
function buildPage(view) {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const bodyMarkup = html.match(/<body>([\s\S]*?)<script/)[1];

  const nodes = {};
  const mkEl = (id) => nodes[id] || (nodes[id] = {
    id, innerHTML: '', className: '', style: {}, value: '600', textContent: '',
    dataset: {}, classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      contains(c){return this._s.has(c);},
      toggle(c,on){ if(on===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);} else {on?this._s.add(c):this._s.delete(c);} } },
    children: [], firstChild: null, parentNode: null,
    appendChild(c){ this.children.push(c); c.parentNode=this; this.firstChild=this.children[0]; return c; },
    removeChild(c){ var i=this.children.indexOf(c); if(i>=0){this.children.splice(i,1); c.parentNode=null;} this.firstChild=this.children[0]||null; return c; },
    setAttribute(){}, getAttribute(){return null;},
    addEventListener(){}, querySelector: () => null,
  });
  const store = { 'mcmate.demo.v1': JSON.stringify({
    cart: { bigmac: 2, 'fries-m': 1, 'coke-m': 2, 'mcnuggets5': 2 },
    coupons: ['C1', 'C5', 'C6'] }) };
  const sandbox = {
    console, setTimeout, clearTimeout,
    document: {
      getElementById: mkEl, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => mkEl('_el'),
      addEventListener() {},
    },
    window: null, location: { hash: '', origin: 'x', pathname: '/' },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: { _d: store, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  // 应用被测视图的状态（分类/视图/策略）
  // 先设真实状态（与用户点击等价），再渲染 —— 避免「容器类名对了但内容没换」
  const wantGrid = view.includes('grid');
  vm.runInContext(`
    (function(){
      try{ setView(${wantGrid ? "'grid'" : "'list'"}); }catch(e){}
      renderCats(); renderMenu(); renderCoupons(); renderSave(); renderPlans();
      renderBundle(); renderTools(); renderMcpMap();
      var el=document.getElementById('kcal'); if(el && !el.value) el.value='600';
    })();
  `, sandbox);

  let body = bodyMarkup;
  // 用「标签配平」的方式替换容器内容：从开标签起扫描，遇到配平的闭标签才停。
  // 早期版本用非贪婪 [\s\S]*? 匹配到第一个 </div>，会把嵌套内容截断，
  // 导致网格卡片、方案卡片等深层结构全部丢失。
  function replaceContainer(markup, id, val, tag) {
    const openRe = new RegExp(`<${tag}([^>]*)\\bid="${id}"([^>]*)>`);
    const m = openRe.exec(markup);
    if (!m) return markup;
    const contentStart = m.index + m[0].length;
    // 扫描：统计同标签的嵌套深度（含自闭合与同类标签）
    const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'g');
    re.lastIndex = contentStart;
    let depth = 1, mm;
    while ((mm = re.exec(markup))) {
      if (mm[0].startsWith('</')) depth--;
      else if (!mm[1]) depth++;
      if (depth === 0) {
        return markup.slice(0, contentStart) + val + markup.slice(mm.index);
      }
    }
    return markup;
  }
  // 自动发现所有「静态骨架里存在、且渲染后拿到了内容」的容器，逐个回填。
  // 早期版本手写了一份 id 白名单，漏掉 bundleBox 导致「套餐对照」整块空白 ——
  // 改成自动发现后，新增容器不需要再维护这份列表。
  const containerIds = [...new Set(
    [...bodyMarkup.matchAll(/<div[^>]*\bid="([\w-]+)"/g)].map(m => m[1])
  )];
  for (const id of containerIds) {
    const v = nodes[id] && nodes[id].innerHTML;
    if (!v) continue;
    body = replaceContainer(body, id, v, 'div');
    // 关键：JS 会改写容器的 className（如 menuBox 的 grid-view），必须一并回写，
    // 否则样式与内容不匹配 —— 之前网格视图因此一直渲染成「列表套网格容器」。
    const cn = nodes[id] && nodes[id].className;
    if (cn) {
      body = body.replace(new RegExp(`<div([^>]*)\\bid="${id}"`), (m, attrs) => {
        const cleaned = attrs.replace(/\sclass="[^"]*"/, '');
        return `<div class="${cn}"${cleaned} id="${id}"`;
      });
    }
  }
  // 覆盖自检：静态骨架里作为「数据容器」存在的 div，渲染后不应仍为空。
  // 这类容器一旦漏填，页面上就是一块莫名其妙的空白（曾经真的发生过）。
  const EMPTY_OK = new Set(['bundleResult', 'toolStat', 'statBox', 'kcalVal', 'cartBar', 'toastHost']);
  const emptyContainers = containerIds.filter(id => {
    if (EMPTY_OK.has(id)) return false;
    const n = nodes[id];
    return n && !n.innerHTML;
  });
  if (emptyContainers.length && process.env.MCMATE_EMIT_ONLY !== '1') {
    console.error(`⚠ 未渲染出内容的容器: ${emptyContainers.join(', ')}`);
  }

  // 底部结算条是「纯文本节点 + 类名切换」，不是 innerHTML 回填，单独处理
  const bar = nodes['cartBar'];
  if (bar && bar.classList && bar.classList.contains('show')) {
    body = body.replace(/<div id="cartBar"([^>]*)>/,
      (m, attrs) => `<div id="cartBar" class="show"${attrs.replace(/aria-hidden="[^"]*"/, 'aria-hidden="false"')}>`);
    for (const [id, tag] of [['cbQty','b'],['cbOrig','div'],['cbPay','div'],['cbSave','div']]) {
      const n = nodes[id];
      if (!n) continue;
      const v = String(n.textContent == null ? '' : n.textContent);
      const re = new RegExp(`(<${tag}[^>]*id="${id}"[^>]*>)[\\s\\S]*?(</${tag}>)`);
      body = body.replace(re, (m2, a, b2) => a + v + b2);
      if (id === 'cbSave' && n.hidden) {
        body = body.replace(new RegExp(`(<${tag}[^>]*id="${id}"[^>]*)(>)`), '$1 hidden$2');
      }
    }
  }

  const tab = view.startsWith('cal') ? 'cal' : view.startsWith('set') ? 'set' : view.startsWith('mcp') ? 'mcp' : 'save';
  const isGrid = view.includes('grid');
  if (tab !== 'save') {
    body = body.replace('class="grid" id="tab-save"', 'class="grid" id="tab-save" style="display:none"');
    body = body.replace(`class="grid" id="tab-${tab}" style="display:none"`, `class="grid" id="tab-${tab}"`);
    body = body.replace('<button class="on" data-tab="save">', '<button data-tab="save">');
    body = body.replace(`<button data-tab="${tab}"`, `<button class="on" data-tab="${tab}"`);
  }
  // 视图类名由 setView() 在渲染时写入，这里保持静态骨架原样即可
  const extra = '';
  return { html: `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<style>${style}${extra}</style></head><body>${body}</body></html>`, isGrid };
}

/* ============ 2. 注入探针，抽几何 ============ */
const PROBE = `
<script>
window.__AUDIT__ = (function(){
  function box(sel){
    var el = document.querySelector(sel);
    if(!el) return null;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return {w:+r.width.toFixed(1), h:+r.height.toFixed(1),
            sh:el.scrollHeight, ch:el.clientHeight, sw:el.scrollWidth, cw:el.clientWidth,
            over:el.scrollHeight - el.clientHeight,
            ovf:cs.overflowY, ml:parseFloat(cs.marginLeft), mr:parseFloat(cs.marginRight)};
  }
  function many(sel){
    var els = document.querySelectorAll(sel), out = [];
    for(var i=0;i<els.length;i++){
      var r = els[i].getBoundingClientRect();
      out.push({i:i, x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1)});
    }
    return out;
  }
  var out = {
    doc:{sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth,
         sh:document.documentElement.scrollHeight},
    cols:[box('#tab-save > .card:nth-child(1)'), box('#tab-save > .card:nth-child(2)'),
          box('#tab-cal > .card:nth-child(1)'), box('#tab-cal > .card:nth-child(2)'),
          box('#tab-set > .card:nth-child(1)'), box('#tab-set > .card:nth-child(2)')],
    menu:box('#menuBox'), coupons:box('#couponBox'), saveResult:box('#saveResult'),
    planBox:box('#planBox'), bundleBox:box('#bundleBox'),
    thumb:many('.thumb'), row:many('.row'), gcard:many('.gcard'),
    plan:many('.plan'), cp:many('.cp'), rl:many('.rl'),
    toolbarBtns:many('.toolbar button'), tabs:many('.tabs button'), cats:many('.cats button'),
    chips:many('.chip'), steppers:many('.stepper'), items:many('.plan .itm'),
    hOverflow: (function(){
      var bad=[], all=document.querySelectorAll('body *');
      for(var i=0;i<all.length;i++){
        var e=all[i];
        if(e.scrollWidth - e.clientWidth > 2 && getComputedStyle(e).overflowX==='visible'){
          bad.push((e.className||e.tagName)+' +'+(e.scrollWidth-e.clientWidth));
        }
        if(e.getBoundingClientRect().right > document.documentElement.clientWidth+1){
          bad.push('OUT:'+(e.className||e.tagName));
        }
      }
      return bad.slice(0,12);
    })()
  };
  return out;
})();
</script>`;

const view = process.argv[2] || 'save-list';
const width = +(process.argv[3] || 1200);

const { html, isGrid } = buildPage(view);
const tmp = path.join(require('os').tmpdir(), `mcmate-audit-${view}-${width}.html`);
fs.writeFileSync(tmp, html.replace('</body>', PROBE + '</body>'), 'utf8');

// 用 --dump-dom 拿不到 getBoundingClientRect，改用 DevTools 协议太复杂；
// 这里用 headless 的 --run-all-compositor-stages-before-draw + evaluate 不可用，
// 改为：把探针结果写进 document.title，再用 --dump-dom 读回。
const probe2 = PROBE.replace('return out;', `document.title = 'AUDIT::'+JSON.stringify(out); return out;`);
fs.writeFileSync(tmp, html.replace('</body>', probe2 + '</body>'), 'utf8');

// 进程派生在某些沙箱下被禁止，改为「产出页面 + 打印路径」，由外部脚本渲染
if (process.env.MCMATE_EMIT_ONLY) {
  console.log(tmp);
  process.exit(0);
}
let out = fs.existsSync(process.env.MCMATE_DOM || '') ? fs.readFileSync(process.env.MCMATE_DOM, 'utf8') : '';
if (!out) {
  console.log('未提供渲染结果。用法：');
  console.log('  1) MCMATE_EMIT_ONLY=1 node docs/layout-audit.js <view> <w>   # 得到页面路径');
  console.log('  2) chrome --headless --dump-dom <path> > /tmp/dom.html');
  console.log('  3) MCMATE_DOM=/tmp/dom.html node docs/layout-audit.js <view> <w>');
  process.exit(0);
}
const m = out.match(/<title>AUDIT::([\s\S]*?)<\/title>/);
if (!m) { console.log('探测失败，title 未写入'); process.exit(1); }
const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));

/* ============ 3. 输出报告 ============ */
const B = (s) => s ? `${s.w}×${s.h}${s.over > 2 ? ` ⚠溢出+${s.over}` : ''}` : 'n/a';
console.log(`\n===== 布局体检 [${view}] 视口 ${width}px =====`);
console.log(`文档宽 ${data.doc.sw} / 视口 ${data.doc.cw}${data.doc.sw > data.doc.cw + 1 ? '  ❌ 横向溢出' : '  ✅ 无横向滚动'}`);
console.log(`文档高 ${data.doc.sh}`);
console.log('\n-- 容器 --');
const names = ['左卡片','右卡片','cal左','cal右','set左','set右'];
data.cols.forEach((c, i) => { if (c) console.log(`  ${names[i].padEnd(6)} ${B(c)}`); });
console.log(`  menuBox    ${B(data.menu)}   (可滚动高度差 ${data.menu ? data.menu.over : '-'})`);
console.log(`  couponBox  ${B(data.coupons)} (可滚动高度差 ${data.coupons ? data.coupons.over : '-'})`);
console.log(`  saveResult ${B(data.saveResult)}`);
if (data.planBox) console.log(`  planBox    ${B(data.planBox)}`);
console.log('\n-- 左列 vs 右列失衡 --');
const L = data.cols[0], R = data.cols[1];
if (L && R) {
  const diff = Math.abs(L.h - R.h);
  console.log(`  左 ${L.h} / 右 ${R.h} → 差 ${diff.toFixed(0)}px ${diff > 260 ? '⚠ 明显失衡' : '✅ 基本平衡'}`);
}
console.log('\n-- 缩略图 --');
const ts = data.thumb.map(t => t.w);
if (ts.length) console.log(`  共 ${ts.length} 个，宽度集合 ${[...new Set(ts)].join(',')}，高度集合 ${[...new Set(data.thumb.map(t=>t.h))].join(',')}`);
const rows = data.row;
if (rows.length) console.log(`  .row ${rows.length} 条，行高集合 ${[...new Set(rows.map(r => r.h))].slice(0, 8).join(',')}`);
const gs = data.gcard;
if (gs.length) {
  console.log(`  .gcard ${gs.length} 个，宽度集合 ${[...new Set(gs.map(g => g.w))].join(',')}`);
  const perRow = gs.filter(g => Math.abs(g.y - gs[0].y) < 4).length;
  console.log(`  首行 ${perRow} 个`);
}
console.log('\n-- 券条目 --');
data.cp.forEach(c => console.log(`  #${c.i} h=${c.h}`));
console.log('\n-- 内联小票行 --');
console.log(`  .rl ${data.rl.length} 行`);
console.log('\n-- 溢出扫描 --');
console.log(data.hOverflow.length ? data.hOverflow.map(s => '  ⚠ ' + s).join('\n') : '  ✅ 未发现溢出元素');
console.log('');
