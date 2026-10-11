#!/usr/bin/env node
/**
 * 缩略图总览：把 59 道菜的 SVG 排成一张对照表，用于肉眼判断「是否一眼可分」。
 * 用法：node docs/contact-sheet.js [输出 html 路径]
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const sb = {
  console, setTimeout: () => 0, clearTimeout,
  document: {
    getElementById: () => ({ innerHTML: '', style: {}, value: '600', textContent: '',
      dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelector: () => null }),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {}, innerHTML: '' }),
    addEventListener() {},
  },
  window: null, location: { hash: '', origin: 'x', pathname: '/' }, navigator: {},
  localStorage: { _d: {}, getItem() { return null; }, setItem() {}, removeItem() {} },
  Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
};
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(script, sb);
vm.runInContext('globalThis.__M=MENU;globalThis.__D=dishArt;', sb);
const MENU = sb.__M, dishArt = sb.__D;

const CAT_ZH = { burger: '汉堡', wrap: '卷类', side: '小食', dessert: '甜品', drink: '饮品', breakfast: '早餐' };
const order = ['burger', 'wrap', 'side', 'dessert', 'drink', 'breakfast'];

let cards = '';
for (const cat of order) {
  const items = MENU.filter(m => m.cat === cat);
  if (!items.length) continue;
  cards += `<h2>${CAT_ZH[cat]} <span>${items.length} 款</span></h2><div class="row">`;
  for (const m of items) {
    cards += `<figure><div class="art">${dishArt(m.code, m.cat)}</div>
      <figcaption><b>${m.name}</b><small>${m.code} · ¥${m.price}</small></figcaption></figure>`;
  }
  cards += `</div>`;
}

const out = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>缩略图总览 · 59 道菜</title><style>
body{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#FFF9F2;color:#2B2B2B;
  margin:0;padding:24px;line-height:1.5}
h1{font-size:20px;margin:0 0 4px}
p.sub{color:#8A7F76;font-size:13px;margin:0 0 22px}
h2{font-size:15px;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid #F0E4D8}
h2 span{color:#8A7F76;font-weight:400;font-size:12.5px}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #F0E4D8;border-radius:12px;padding:10px;text-align:center}
.art{width:76px;height:76px;margin:0 auto;border-radius:10px;
  background:linear-gradient(160deg,#FFFDF8,#FBF1E6);border:1px solid #F2E6D8;padding:3px;box-sizing:border-box}
.art svg{width:100%;height:100%;display:block}
figcaption{margin-top:7px}
figcaption b{display:block;font-size:12px;font-weight:600}
figcaption small{display:block;font-size:10px;color:#8A7F76;word-break:break-all}
</style></head><body>
<h1>🍔 缩略图总览</h1>
<p class="sub">59 道菜的内联 SVG 并排对照 —— 用于判断每道菜是否「一眼可分」。</p>
${cards}
</body></html>`;

const outPath = process.argv[2] || path.join(__dirname, 'snapshots', 'contact-sheet.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, 'utf8');
console.log(`已生成 ${outPath}  (${(out.length / 1024).toFixed(1)}KB, ${MENU.length} 道菜)`);
