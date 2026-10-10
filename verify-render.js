/* 用极简 DOM 桩在 Node 里跑一遍 index.html 的全部脚本，捕获运行时错误 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'index.html');
if (!fs.existsSync(htmlPath)) { console.error('找不到文件:', htmlPath); process.exit(1); }
const html = fs.readFileSync(htmlPath, 'utf8');
console.log('校验目标:', path.basename(htmlPath) === 'index.html' ? htmlPath : htmlPath);
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
 'tab-cal','tab-set','tab-mcp','toolSearch','toolBox','toolStat','mapBox',
 'vList','vGrid'].forEach(mkEl);

/* localStorage 桩：让持久化逻辑在 Node 里也能跑通 */
const _store = new Map();
const localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
  clear: () => _store.clear(),
};

const doc = {
  getElementById: id => made.get(id) || mkEl(id),
  querySelectorAll: sel => {
    // tabs: 3 个按钮；stratBox: 4 个按钮
    if (sel === '.tabs button') return [0,1,2,3].map(i => mkEl('tabbtn' + i));
    if (sel === '#stratBox button') return [0,1,2,3].map(i => mkEl('stratbtn' + i));
    return [];
  },
};
const sandbox = { console, document: doc, Date, localStorage, JSON };
sandbox.window = sandbox;   // 在浏览器里 window === globalThis；这里做等价处理
sandbox.location = { origin: 'https://example.com', pathname: '/mcd-mcmate/', hash: '' };
sandbox.navigator = {};
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
  ['renderTools', 'MCP 工具渲染'],
  ['renderMcpMap', 'MCP 映射渲染'],
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

const toolHtml = made.get('toolBox').innerHTML;
console.log(toolHtml.includes('query-meals') && toolHtml.includes('create-order')
  ? 'PASS  MCP 工具清单渲染正常' : 'FAIL  MCP 工具清单异常');
console.log(made.get('mapBox').innerHTML.includes('calculate-price')
  ? 'PASS  MCP 映射表渲染正常' : 'FAIL  MCP 映射表异常');

// 模拟点击「+」加一份 / 「清空」
vm.runInContext("chg('bigmac', 1)", sandbox);
vm.runInContext('renderSave(); renderCoupons();', sandbox);
console.log('PASS  加减餐交互无异常');

// 校验缩略图：每道菜都有 SVG，且不含 undefined 颜色
const artChecks = vm.runInContext(`
  (function(){
    var miss = [], undef = [];
    MENU.forEach(function(m){
      var s = dishArt(m.code, m.cat);
      if(!s || s.indexOf('<svg') !== 0) miss.push(m.code);
      if(/undefined/.test(s)) undef.push(m.code);
    });
    return { total: MENU.length, miss: miss, undef: undef };
  })()
`, sandbox);
console.log(artChecks.miss.length === 0
  ? `PASS  全部 ${artChecks.total} 道菜均有缩略图`
  : `FAIL  缺缩略图: ${artChecks.miss.join(',')}`);
console.log(artChecks.undef.length === 0
  ? 'PASS  缩略图无 undefined 颜色'
  : `FAIL  含 undefined 颜色: ${artChecks.undef.join(',')}`);

// 校验配餐方案去重：不应出现主餐+小食骨架完全相同的重复方案
const dedup = vm.runInContext(`
  (function(){
    var bad = [];
    ['balanced','protein','low_sodium','cheapest'].forEach(function(st){
      var plans = planCalorieBudget(600, st, 3);
      var keys = plans.filter(function(p){ return !p.nearDupe; }).map(function(p){
        return p.items.filter(function(x){
          return x[0].cat==='burger'||x[0].cat==='wrap'||x[0].cat==='side';
        }).map(function(x){ return x[0].code; }).sort().join('|');
      });
      var dup = keys.filter(function(k,i){ return keys.indexOf(k) !== i; });
      if(dup.length) bad.push(st + ':' + dup.join(','));
    });
    return bad;
  })()
`, sandbox);
console.log(dedup.length === 0
  ? 'PASS  配餐方案骨架已去重'
  : `FAIL  仍有重复骨架: ${dedup.join(' | ')}`);

// 校验持久化：写 → 读 应还原购物车
const persist = vm.runInContext(`
  (function(){
    cart['bigmac'] = 2; cart['cone'] = 1;
    Object.keys(cart).forEach(function(k){ if(k!=='bigmac'&&k!=='cone') delete cart[k]; });
    saveState();
    Object.keys(cart).forEach(function(k){ delete cart[k]; });
    var had = loadState();
    return { had: had, bigmac: cart['bigmac'], cone: cart['cone'], keys: Object.keys(cart).length };
  })()
`, sandbox);
console.log(persist.had && persist.bigmac === 2 && persist.cone === 1
  ? 'PASS  购物车持久化往返正确'
  : `FAIL  持久化异常: ${JSON.stringify(persist)}`);

// 校验持久化会丢弃已下架的 code
const stale = vm.runInContext(`
  (function(){
    localStorage.setItem('mcmate.demo.v1', JSON.stringify({
      cart: { bigmac: 1, 'not-a-real-code': 5 }, coupons: {}
    }));
    loadState();
    return Object.keys(cart);
  })()
`, sandbox);
console.log(stale.indexOf('not-a-real-code') === -1 && stale.indexOf('bigmac') >= 0
  ? 'PASS  持久化丢弃未知 code'
  : `FAIL  未过滤未知 code: ${stale.join(',')}`);

// 校验 URL 分享：编码 → 解码 往返一致
const share = vm.runInContext(`
  (function(){
    localStorage.clear();
    Object.keys(cart).forEach(function(k){ delete cart[k]; });
    cart['bigmac'] = 2; cart['corn-cup'] = 1;
    COUPONS.forEach(function(c){ couponState[c.id] = false; });
    couponState['C2'] = true; couponState['C8'] = true;
    var hash = encodeShare();
    // 清空后再解码，应完全还原
    Object.keys(cart).forEach(function(k){ delete cart[k]; });
    COUPONS.forEach(function(c){ couponState[c.id] = false; });
    var ok = decodeShare('#' + hash);
    return { hash: hash, ok: ok, bigmac: cart['bigmac'], corn: cart['corn-cup'],
             c2: couponState['C2'], c8: couponState['C8'],
             c1: couponState['C1'], keys: Object.keys(cart).length };
  })()
`, sandbox);
console.log(share.ok && share.bigmac === 2 && share.corn === 1
    && share.c2 && share.c8 && !share.c1 && share.keys === 2
  ? `PASS  URL 分享编解码往返正确 (${share.hash})`
  : `FAIL  URL 分享异常: ${JSON.stringify(share)}`);

// 校验分享链接里的非法 code 会被忽略
const shareBad = vm.runInContext(`
  (function(){
    Object.keys(cart).forEach(function(k){ delete cart[k]; });
    decodeShare('#c=bigmac.1,evil-code.9,cone.2&k=C1,NOT_A_COUPON');
    return { keys: Object.keys(cart).sort(), c1: couponState['C1'] };
  })()
`, sandbox);
console.log(shareBad.keys.indexOf('evil-code') === -1
    && shareBad.keys.indexOf('bigmac') >= 0
    && shareBad.keys.indexOf('cone') >= 0
    && shareBad.keys.length === 2
  ? 'PASS  分享链接忽略非法 code'
  : `FAIL  未过滤非法 code: ${JSON.stringify(shareBad)}`);

console.log('\n全部渲染检查完成');

// 校验 Demo 内的工具清单与 references/tools.md 完全一致（防止两边漂移）
const toolsMd = path.join(__dirname, '..', 'references', 'tools.md');
if (fs.existsSync(toolsMd)) {
  const md = fs.readFileSync(toolsMd, 'utf8');
  const listed = new Set([...md.matchAll(/^\|\s*`([a-z0-9-]+)`/gm)].map(m => m[1]));
  const inDemo = new Set(
    [...html.matchAll(/\{n:"([a-z0-9-]+)"/g)].map(m => m[1]));
  const onlyMd = [...listed].filter(x => !inDemo.has(x));
  const onlyDemo = [...inDemo].filter(x => !listed.has(x));
  console.log(`文档工具数 ${listed.size} / Demo 工具数 ${inDemo.size}`);
  console.log(onlyMd.length === 0 && onlyDemo.length === 0
    ? 'PASS  Demo 工具清单与 references/tools.md 一致'
    : `FAIL  不一致：仅文档有 [${onlyMd}]；仅 Demo 有 [${onlyDemo}]`);
} else {
  console.log('SKIP  未找到 references/tools.md');
}
