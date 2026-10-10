/* 用极简 DOM 桩在 Node 里跑一遍 index.html 的全部脚本，捕获运行时错误 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const made = new Map();
function mkEl(id) {
  const el = {
    id, _html: '', textContent: '', value: '600', dataset: {}, style: {}, classList: {
      add() {}, remove() {}, toggle() {},
    },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
  };
  el.querySelectorAll = () => [];
  el.onclick = null; el.oninput = null; el.onchange = null;
  made.set(id, el);
  return el;
}
['catBox','statBox','menuBox','couponBox','saveResult','planBox','kcal','kcalVal',
 'bundleCart','bundleResult','bundleBox','menuCount','search','stratBox','tab-save',
 'tab-cal','tab-set'].forEach(mkEl);

const doc = {
  getElementById: id => made.get(id) || mkEl(id),
  querySelectorAll: sel => {
    // tabs: 3 个按钮；stratBox: 4 个按钮
    if (sel === '.tabs button') return [0,1,2].map(i => mkEl('tabbtn' + i));
    if (sel === '#stratBox button') return [0,1,2,3].map(i => mkEl('stratbtn' + i));
    return [];
  },
};
const sandbox = { console, document: doc, window: {}, Date };
vm.createContext(sandbox);

try {
  vm.runInContext(script, sandbox, { filename: 'index.html<script>' });
  console.log('PASS  脚本首次执行无异常');
} catch (e) {
  console.log('FAIL  脚本执行抛错:', e.message);
  process.exit(1);
}

// 触发各 tab 的渲染函数
const checks = [
  ['renderSave', '券后最优价渲染'],
  ['renderPlans', '配餐渲染'],
  ['renderBundle', '套餐对比渲染'],
  ['renderCoupons', '优惠券渲染'],
  ['renderCats', '分类渲染'],
  ['renderMenu', '菜单渲染'],
];
side_effect: for (const [fn, label] of checks) {
  try {
    vm.runInContext(fn + '()', sandbox);
    console.log('PASS  ' + label);
  } catch (e) {
    console.log('FAIL  ' + label + ' → ' + e.message);
  }
}

// 检查关键输出非空
const menuHtml = made.get('menuBox').innerHTML;
console.log(menuHtml.length > 500 ? 'PASS  菜单渲染出内容 (' + menuHtml.length + ' 字符)' : 'FAIL  菜单为空');

const saveHtml = made.get('saveResult').innerHTML;
console.log(saveHtml.includes('券后应付') || saveHtml.includes('加点餐品')
  ? 'PASS  结算区渲染正常' : 'FAIL  结算区异常');

const bundleHtml = made.get('bundleBox').innerHTML;
console.log(bundleHtml.includes('套餐') ? 'PASS  套餐对照表渲染正常' : 'FAIL  套餐对照表异常');

// 模拟点击「+」加一份 / 「清空」
vm.runInContext("chg('bigmac', 1)", sandbox);
vm.runInContext('renderSave(); renderCoupons();', sandbox);
console.log('PASS  加减餐交互无异常');

console.log('\n全部渲染检查完成');
