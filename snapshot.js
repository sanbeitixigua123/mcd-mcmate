#!/usr/bin/env node
/**
 * 布局快照工具 —— 用真实 HTML/CSS + 真实渲染函数，生成可离线查看的布局样张。
 * 用途：肉眼复核列表/网格/券面板/结算/方案/套餐 的版式，捕获溢出与错位。
 * 用法：node docs/snapshot.js [输出目录]   默认 docs/snapshots/
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const bodyMarkup = html.match(/<body>([\s\S]*?)<script/)[1];

const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'snapshots');
fs.mkdirSync(outDir, { recursive: true });

/* ---------- DOM stub ---------- */
function makeStore() {
  const nodes = {};
  const mkEl = (id) => nodes[id] || (nodes[id] = {
    id, innerHTML: '', className: '', style: {}, value: '', textContent: '',
    dataset: {}, classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      contains(c){return this._s.has(c);},
      toggle(c,on){ if(on===undefined){this._s.has(c)?this._s.delete(c):this._s.add(c);} else {on?this._s.add(c):this._s.delete(c);} } },
    children: [], firstChild: null, parentNode: null,
    appendChild(c){ this.children.push(c); c.parentNode=this; this.firstChild=this.children[0]; return c; },
    removeChild(c){ var i=this.children.indexOf(c); if(i>=0){this.children.splice(i,1); c.parentNode=null;} this.firstChild=this.children[0]||null; return c; },
    setAttribute(){}, getAttribute(){return null;},
    addEventListener(){}, querySelector: () => null,
  });
  return { nodes, mkEl };
}

function boot(seed) {
  const { nodes, mkEl } = makeStore();
  const sandbox = {
    console, setTimeout, clearTimeout,
    document: {
      getElementById: mkEl, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => mkEl('_el'),
      addEventListener() {},
    },
    window: null,
    location: { hash: seed.hash || '', origin: 'https://x', pathname: '/' },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: { _d: seed.store || {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return { sandbox, nodes };
}

/* ---------- 用真实函数渲染，回填到真实静态骨架 ---------- */
function renderInto(sandbox, nodes) {
  const run = (code) => vm.runInContext(code, sandbox);
  run(`
    (function(){
      // 与页面初始化同序，确保数据一致
      if(typeof renderCats === 'function') renderCats();
      renderMenu();
      renderCoupons();
      renderSave();
      if(typeof renderPlans === 'function') renderPlans();
      if(typeof renderBundle === 'function') renderBundle();
      if(typeof renderTools === 'function') renderTools();
    })();
  `);
  return nodes;
}

/* ---------- 生成样张 ---------- */
function sheet(title, opts) {
  const { sandbox, nodes } = boot(opts.seed || {});
  renderInto(sandbox, nodes);

  // 把渲染结果注入真实静态骨架（保留 class 结构，仅替换动态容器）
  let body = bodyMarkup;
  const swap = (id, val) => {
    if (val === undefined || val === null) return;
    const re = new RegExp(`(<(?:div|span|input)[^>]*id="${id}"[^>]*>)([\\s\\S]*?)(</(?:div|span)>)`);
    // 只替换 div 容器内容
    const divRe = new RegExp(`(<div[^>]*id="${id}"[^>]*>)[\\s\\S]*?(</div>)`);
  };

  // 简化：直接用渲染后的完整结构覆盖对应容器
  const inject = (markup, id, val, tag) => {
    const re = new RegExp(`(<${tag}[^>]*id="${id}"[^>]*>)[\\s\\S]*?(</${tag}>)`);
    return markup.replace(re, (m, a, b) => a + val + b);
  };

  const map = {
    catBox: 'catBox', statBox: 'statBox', menuBox: 'menuBox',
    couponBox: 'couponBox', saveResult: 'saveResult', planBox: 'planBox',
    bundleCart: 'bundleCart', bundleResult: 'bundleResult', toolBox: 'toolBox',
    mapBox: 'mapBox', toolStat: 'toolStat',
  };
  for (const [id] of Object.entries(map)) {
    const v = nodes[id] && nodes[id].innerHTML;
    if (v) body = inject(body, id, v, 'div');
  }
  if (nodes.kcalVal && nodes.kcalVal.textContent) {
    body = body.replace(/(<span class="val" id="kcalVal">)[\s\S]*?(<\/span>)/, `$1${nodes.kcalVal.textContent}$2`);
  }

  // 切换默认 tab
  if (opts.tab && opts.tab !== 'save') {
    body = body.replace('class="grid" id="tab-save"', 'class="grid" id="tab-save" style="display:none"');
    body = body.replace(new RegExp(`class="grid" id="tab-${opts.tab}" style="display:none"`), `class="grid" id="tab-${opts.tab}"`);
    body = body.replace(/(<button class="on" data-tab="save">)/, '<button data-tab="save">');
    body = body.replace(new RegExp(`(<button )data-tab="${opts.tab}"`), `$1class="on" data-tab="${opts.tab}"`);
  }
  if (opts.extraCss) {
    body = `<style>${opts.extraCss}</style>` + body;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${style}
body{overflow-x:hidden}
.snapnote{max-width:1120px;margin:16px auto 0;padding:10px 14px;background:#FFF6F0;
  border:1px dashed #E8CDB4;border-radius:10px;font-size:12.5px;color:#8A7F76}
</style></head>
<body>
<div class="snapnote">📐 布局样张 · ${title} ${opts.width ? `· 视口 ${opts.width}px` : ''}</div>
${body}
</body></html>`;
}

const seeds = {
  default: {},
  cart: { store: { 'mcmate.demo.v1': JSON.stringify({ cart: { bigmac: 2, 'fries-m': 1, 'coke-m': 2, 'mcnuggets-5': 2 }, coupons: ['C1', 'C5', 'C6'] }) } },
  shared: { hash: '#c=bigmac.2,corn-cup.1&k=C2,C8' },
};

const jobs = [
  ['list', '省钱模式 · 列表视图', { tab: 'save', seed: seeds.cart }],
  ['grid', '省钱模式 · 网格视图', { tab: 'save', seed: seeds.cart, extraCss: '.menu{max-height:none!important}#menuBox{display:grid!important}' }],
  ['cal', '热量预算配餐', { tab: 'cal', seed: seeds.cart }],
  ['set', '套餐 vs 单点', { tab: 'set', seed: seeds.cart }],
  ['mcp', '官方 MCP 能力', { tab: 'mcp', seed: seeds.cart }],
  ['shared', '分享链接还原', { tab: 'save', seed: seeds.shared }],
];

let ok = 0;
for (const [name, title, opts] of jobs) {
  try {
    const out = sheet(title, opts);
    const p = path.join(outDir, name + '.html');
    fs.writeFileSync(p, out, 'utf8');
    console.log(`OK   ${name}.html  ${(out.length / 1024).toFixed(1)}KB`);
    ok++;
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
console.log(`\n生成 ${ok}/${jobs.length} 张布局样张 → ${outDir}`);
