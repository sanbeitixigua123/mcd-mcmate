// 校验 docs/index.html 中的 JS 算法与 Python 版 optimizer.py 结果一致
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('docs/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 只取"算法部分"：从数据定义开始，到「状态与渲染」小节之前
const startMarker = 'const MENU = [';
const endMarker = '/* ==================================================================\n   状态与渲染';
const s = script.indexOf(startMarker);
const e = script.indexOf(endMarker);
if (s < 0 || e < 0) { console.error('切分失败 s=' + s + ' e=' + e); process.exit(1); }
const algo = script.slice(s, e);

const sandbox = { console };
vm.createContext(sandbox);

const tests = `
const order = COUPONS.filter(c => ['C1','C2','C3'].includes(c.id));
let r;

r = optimizePrice([{code:'bigmac',price:25.5,qty:1}], order, 4);
console.log('25.5元单点 →', r.payable, r.payable === 22.5 ? 'PASS' : 'FAIL(应22.5)');

r = optimizePrice([{code:'bigmac',price:25.5,qty:2}], order, 4);
console.log('51元双份   →', r.payable, r.payable === 45 ? 'PASS' : 'FAIL(应45)');

r = optimizePrice([{code:'bigmac',price:25.5,qty:1}], COUPONS.filter(c=>['C1','C2'].includes(c.id)), 4);
console.log('互斥组     →', r.payable, r.payable === 22.95 ? 'PASS' : 'FAIL(应22.95)');

r = optimizePrice([{code:'fries-m',price:11.5,qty:2}], COUPONS.filter(c=>c.id==='C4'), 4);
console.log('薯条特价   →', r.payable, r.payable === 16 ? 'PASS' : 'FAIL(应16)');

r = optimizePrice([{code:'bigmac',price:25.5,qty:1}], COUPONS.filter(c=>['C3','C5'].includes(c.id)), 4);
console.log('叠加券     →', r.payable, r.payable === 20.5 ? 'PASS' : 'FAIL(应20.5)');

const p = planCalorieBudget(600, 'balanced', 3);
console.log('600kcal配餐→', p[0].kcal + 'kcal ¥' + p[0].price, p[0].kcal <= 690 ? 'PASS' : 'FAIL');

const pp = planCalorieBudget(700, 'protein');
console.log('增肌蛋白   →', pp[0].protein + 'g', pp[0].protein >= 30 ? 'PASS' : 'FAIL');
`;

vm.runInContext(algo + tests, sandbox);
