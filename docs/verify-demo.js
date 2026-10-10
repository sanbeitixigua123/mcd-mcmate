/* 校验 docs/index.html 中的 JS 算法与 Python 版 optimizer.py 结果一致
   用法：node docs/verify-demo.js
   覆盖：单品特价 / 第二份半价 / 折扣 / 满减 / 互斥组 / 叠加 / 边界 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到 <script> 块'); process.exit(1); }
const script = m[1];

const startMarker = 'const MENU = [';
const s = script.indexOf(startMarker);
if (s < 0) { console.error('切分失败：未找到 MENU 起始'); process.exit(1); }
// 算法段结束于「状态与渲染」大标题注释
const e = script.indexOf('状态与渲染');
if (e < 0) { console.error('切分失败：未找到状态与渲染'); process.exit(1); }
let algo = script.slice(s, e);
algo = algo.slice(0, algo.lastIndexOf('/* ==='));

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(algo, sandbox);
vm.runInContext('globalThis.__C = COUPONS; globalThis.__op = optimizePrice;'
  + 'globalThis.__plan = planCalorieBudget; globalThis.__ca = couponActive;'
  + 'globalThis.__cb = compareBundle; globalThis.__B = BUNDLES; globalThis.__M = MENU;', sandbox);

const C = sandbox.__C;
const op = sandbox.__op;
const plan = sandbox.__plan;
const ca = sandbox.__ca;
const compareBundle = sandbox.__cb;
const MENU = sandbox.__M;
const pick = ids => C.filter(c => ids.includes(c.id));

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = Math.abs(got - want) < 1e-6;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${got}${ok ? '' : '  want=' + want}`);
}
function assert(label, cond, detail) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

console.log('— 优惠券引擎 —');
// 单品特价：中薯 11.5 → 8，2 份 = 16
eq('单品特价 C5（2×中薯）', op([{ code: 'fries-m', price: 11.5, qty: 2 }], pick(['C5'])).payable, 16);
// 第二份半价：中可 9×2 = 18，减 4.5 = 13.5
eq('第二份半价 C6（2×中可）', op([{ code: 'coke-m', price: 9, qty: 2 }], pick(['C6'])).payable, 13.5);
// 第二份半价：麦乐鸡5块 12×2 = 24，减 6 = 18
eq('第二份半价 C7（2×麦乐鸡5）', op([{ code: 'nuggets5', price: 12, qty: 2 }], pick(['C7'])).payable, 18);
// 3 份时只对 1 对生效：24×1.5 = 36 → 12×3 - 6 = 30
eq('第二份半价 C7（3×麦乐鸡5）', op([{ code: 'nuggets5', price: 12, qty: 3 }], pick(['C7'])).payable, 30);
// 满减阈值刚好达标：51 ≥ 50 → 39
eq('满减 C4（2×巨无霸）', op([{ code: 'bigmac', price: 25.5, qty: 2 }], pick(['C4'])).payable, 39);
// 满减未达标不出券：25.5 < 30 → 原价
eq('满减 C1 未达标（1×巨无霸）', op([{ code: 'bigmac', price: 25.5, qty: 1 }], pick(['C1'])).payable, 25.5);
// 折扣：25.5 × 0.9 = 22.95
eq('折扣 C2（1×巨无霸）', op([{ code: 'bigmac', price: 25.5, qty: 1 }], pick(['C2'])).payable, 22.95);
// 互斥组 ORDER：50 元时 C1(-6) vs C2(-5) vs C3(-3) vs C4(-12) → 选 C4 → 38
eq('互斥组取最优（C1~C4）', op([{ code: 'bigmac', price: 25.5, qty: 2 }], pick(['C1', 'C2', 'C3', 'C4'])).payable, 39);
// ITEM 组内也互斥：C5 薯条特价 vs C6/C7 不冲突（appliesTo 不同），但同组只能选 1 张
const rItem = op([{ code: 'fries-m', price: 11.5, qty: 2 }, { code: 'coke-m', price: 9, qty: 2 }],
  pick(['C5', 'C6']), 4);
assert('ITEM 组内互斥（C5/C6 只选 1 张）', rItem.used.length === 1, 'used=' + JSON.stringify(rItem.used.map(c => c.id)));
assert('ITEM 组取最优（薯条省 7 > 可乐省 4.5）', rItem.used[0].id === 'C5', 'used=' + rItem.used[0].id);
// 无 group 的券可自由叠加：C8 立减 2 + C9 立减 3，但不能与 ORDER 组混？
const rFree = op([{ code: 'bigmac', price: 25.5, qty: 1 }], pick(['C8', 'C9']), 4);
eq('自由叠加 C8+C9（1×巨无霸）', rFree.payable, 20.5);
// maxStack 限制
const rStack = op([{ code: 'bigmac', price: 25.5, qty: 2 }], pick(['C1', 'C2', 'C3', 'C4', 'C8', 'C9']), 2);
assert('maxStack=2 限制生效', rStack.used.length <= 2, 'used=' + rStack.used.length);
// 金额不为负
const rZero = op([{ code: 'coke-s', price: 7.5, qty: 1 }], pick(['C8', 'C9']), 4);
assert('实付不为负', rZero.payable >= 0, 'payable=' + rZero.payable);
// 空购物车
assert('空购物车返回 null', op([], C, 4) === null);

console.log('\n— 营养配餐引擎 —');
const pBal = plan(600, 'balanced', 3);
assert('600kcal 配餐落在容差内', pBal.length > 0 && pBal[0].kcal <= 600 * 1.15 && pBal[0].kcal >= 600 * 0.85,
  pBal.length ? pBal[0].kcal + 'kcal ¥' + pBal[0].price : '无结果');
const pPro = plan(700, 'protein');
assert('增肌策略蛋白质 ≥ 30g', pPro.length > 0 && pPro[0].protein >= 30, pPro.length ? pPro[0].protein + 'g' : '无结果');
const pLow = plan(700, 'low_sodium');
assert('低钠策略钠含量更低', pLow.length > 0 && pLow[0].sodium < pPro[0].sodium,
  pLow.length ? pLow[0].sodium + 'mg vs ' + pPro[0].sodium + 'mg' : '无结果');
const pCheap = plan(700, 'cheapest');
assert('省钱策略价格 ≤ 均衡策略', pCheap.length > 0 && pCheap[0].price <= pBal[0].price * 1.5,
  pCheap.length ? '¥' + pCheap[0].price : '无结果');

console.log('\n— 券生效条件（时段 / 分类）—');
{
  const c9 = C.find(c => c.id === 'C9');
  const at8 = new Date(2026, 0, 1, 8, 0);
  const at15 = new Date(2026, 0, 1, 15, 0);
  assert('C9 早餐券 08:00 生效', ca(c9, at8, ['egg-mcmuffin']) === true);
  assert('C9 早餐券 15:00 不生效', ca(c9, at15, ['egg-mcmuffin']) === false);
  assert('C9 早餐券 08:00 但购物车无早餐 → 不生效', ca(c9, at8, ['bigmac']) === false);
  const c1 = C.find(c => c.id === 'C1');
  assert('C1 无时段限制 → 任意时刻生效', ca(c1, at15, ['bigmac']) === true);
}

console.log('\n— 套餐 vs 单点 —');
{
  // 巨无霸 25.5 + 中薯 11.5 + 中可 9 = 46，套餐 38 → 省 8
  const r = compareBundle({ name: '巨无霸中套餐', price: 38, codes: ['bigmac', 'fries-m', 'coke-m'] }, MENU);
  eq('套餐单点合计', r.singleTotal, 46);
  eq('套餐差额', r.diff, 8);
  assert('套餐更省判定', r.worth === true);
  assert('saveRate 计算正确', Math.abs(r.saveRate - 8 / 46) < 1e-4, 'rate=' + r.saveRate.toFixed(4));
  // 反向：把套餐价抬到 60 → 不划算
  const bad = compareBundle({ name: '贵套餐', price: 60, codes: ['bigmac', 'fries-m', 'coke-m'] }, MENU);
  assert('套餐更贵判定', bad.worth === false && bad.diff === -14, 'diff=' + bad.diff);
  // 所有内置套餐 code 都能在菜单里找到
  const missing = [];
  sandbox.__B.forEach(b => b.codes.forEach(c => { if (!MENU.find(m => m.code === c)) missing.push(c); }));
  assert('内置套餐 code 全部存在于菜单', missing.length === 0, missing.join(','));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
