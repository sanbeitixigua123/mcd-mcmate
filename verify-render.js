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
let _seq = 0;
function mkEl(id) {
  const el = {
    id, _html: '', _text: '', value: '600', dataset: {}, style: {},
    // 真实 DOM 会把 textContent 强制转成字符串，桩也要一致，
    // 否则「写入数字、读出字符串」这类断言会假失败
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    // classList 要真的记住状态，否则测不到「结算条滑出」「页签高亮」这类行为
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) {
        if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
        else { on ? this._s.add(c) : this._s.delete(c); }
        return this._s.has(c);
      },
    },
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    // 轻提示需要一棵真的能挂/摘的 DOM 子树，否则测不到 toast 的行为
    children: [], firstChild: null, parentNode: null,
    appendChild(c) {
      this.children.push(c);
      c.parentNode = this;
      this.firstChild = this.children[0];
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; }
      this.firstChild = this.children[0] || null;
      return c;
    },
    setAttribute() {}, getAttribute() { return null; },
  };
  el.querySelectorAll = () => [];
  el.onclick = null; el.oninput = null; el.onchange = null;
  if (id) made.set(id, el);
  return el;
}
['catBox','statBox','menuBox','couponBox','saveResult','planBox','kcal','kcalVal',
 'bundleCart','bundleResult','bundleBox','menuCount','search','stratBox','tab-save',
 'tab-cal','tab-set','tab-mcp','toolSearch','toolBox','toolStat','mapBox',
 'vList','vGrid','toastHost','cartBar','cbQty','cbOrig','cbPay','cbSave','autoCpBtn'].forEach(mkEl);

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
  createElement: () => mkEl('_el' + (++_seq)),
  addEventListener() {},
  querySelectorAll: sel => {
    // tabs: 4 个按钮；stratBox: 4 个按钮
    if (sel === '.tabs button') {
      return ['save','cal','set','mcp'].map(t => {
        const b = mkEl('_tab_' + t);
        b.dataset = { tab: t };
        return b;
      });
    }
    if (sel === '#stratBox button') return [0,1,2,3].map(i => mkEl('stratbtn' + i));
    return [];
  },
};
const sandbox = { console, document: doc, Date, localStorage, JSON,
  // 页面脚本会用到定时器（如按钮文案的短暂回显），沙箱里需要一个空实现
  setTimeout: () => 0, clearTimeout: () => {} };
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

// 图形多样性：去掉颜色后按「结构 + 尺寸」分组，要求足够多的菜有独立外形。
// 之前 12 个汉堡共用同一骨架，只靠颜色区分，缩略图上几乎分不出谁是谁。
const artDiv = vm.runInContext(`
  (function(){
    var sig = {}, groups = [];
    MENU.forEach(function(m){
      var s = dishArt(m.code, m.cat)
        .replace(/#[0-9A-Fa-f]{3,6}/g, '#C')          // 抹掉颜色
        .replace(/-?\\d+\\.\\d+/g, function(n){ return Math.round(+n); }); // 保留尺寸量级
      if(!sig[s]){ sig[s] = []; groups.push(s); }
      sig[s].push(m.code);
    });
    var sizes = groups.map(function(k){ return sig[k].length; }).sort(function(a,b){ return b-a; });
    return { unique: groups.length, total: MENU.length, biggest: sizes[0] };
  })()
`, sandbox);
console.log(artDiv.unique >= 40 && artDiv.biggest <= 6
  ? `PASS  缩略图外形足够多样（${artDiv.unique}/${artDiv.total} 种外形，最大重复组 ${artDiv.biggest}）`
  : `FAIL  缩略图区分度不足：${artDiv.unique}/${artDiv.total} 种外形，最大重复组 ${artDiv.biggest}`);

// 双层汉堡必须比单层明显更高（这是「双层」唯一可靠的视觉线索）
const heights = vm.runInContext(`
  (function(){
    function stackH(code){
      var svg = dishArt(code, 'burger');
      // 底盖顶边 y = 34 + 夹层高度，从底盖路径里读回来
      var m = svg.match(/M12 ([\\d.]+) Q40/);
      return m ? +m[1] - 34 : -1;
    }
    return { single: stackH('cheeseburger'), dbl: stackH('dblcheese'),
             bigmac: stackH('bigmac') };
  })()
`, sandbox);
console.log(heights.dbl - heights.single >= 5 && heights.bigmac - heights.single >= 5
  ? `PASS  双层汉堡视觉上更高（单层 ${heights.single}px → 双层 ${heights.dbl}px / 巨无霸 ${heights.bigmac}px）`
  : `FAIL  双层与单层高度差不足: ${JSON.stringify(heights)}`);

// 麦满分用英式松饼（扁平顶盖），不能和普通圆顶汉堡同形
const muffinOk = vm.runInContext(`
  (function(){
    var m = dishArt('egg-mcmuffin', 'breakfast');
    var b = dishArt('cheeseburger', 'burger');
    return { muffinHasRect: /<rect x="11" y="18"/.test(m), burgerHasDome: /Q40 3 71 34/.test(b) };
  })()
`, sandbox);
console.log(muffinOk.muffinHasRect && muffinOk.burgerHasDome
  ? 'PASS  麦满分用扁平松饼顶盖，与圆顶汉堡区分开'
  : `FAIL  麦满分外形未区分: ${JSON.stringify(muffinOk)}`);

// 轻提示：能挂到宿主上、带正确语义、并支持撤销按钮
const toastT = vm.runInContext(`
  (function(){
    var host = document.getElementById('toastHost');
    host.children.length = 0;
    toast('测试消息A', 'ok');
    toast('测试消息B', 'warn', { label: '撤销', run: function(){} });
    var first = host.children[0], second = host.children[1];
    return {
      n: host.children.length,
      clsA: first ? first.className : '',
      hasMsg: first ? first.innerHTML.indexOf('测试消息A') >= 0 : false,
      hasIcon: first ? first.innerHTML.indexOf('t-ico') >= 0 : false,
      btn: second ? second.children.length : 0,
      btnLabel: second && second.children[0] ? second.children[0].textContent : '',
    };
  })()
`, sandbox);
console.log(toastT.n === 2 && /toast/.test(toastT.clsA) && /ok/.test(toastT.clsA)
    && toastT.hasMsg && toastT.hasIcon && toastT.btn === 1 && toastT.btnLabel === '撤销'
  ? 'PASS  轻提示可挂载、带语义类名与撤销按钮'
  : `FAIL  轻提示异常: ${JSON.stringify(toastT)}`);

// 提示数量上限：连发 6 条只保留 3 条，避免刷屏
const toastCap = vm.runInContext(`
  (function(){
    var host = document.getElementById('toastHost');
    host.children.length = 0;
    for(var i = 0; i < 6; i++) toast('msg' + i, 'info');
    return { n: host.children.length };
  })()
`, sandbox);
console.log(toastCap.n === 3
  ? 'PASS  轻提示最多同时 3 条（超出自动挤掉最早的）'
  : `FAIL  轻提示未限流: ${JSON.stringify(toastCap)}`);

// 底部结算条：空车隐藏、有货滑出、金额与省钱额与引擎一致
const barT = vm.runInContext(`
  (function(){
    var bar = document.getElementById('cartBar');
    Object.keys(cart).forEach(function(k){ delete cart[k]; });
    renderSave();
    var hiddenWhenEmpty = !bar.classList.contains('show');

    cart['bigmac'] = 2; cart['fries-m'] = 1; cart['coke-m'] = 2;
    COUPONS.forEach(function(c){ couponState[c.id] = false; });
    autoPickCoupons();
    renderSave();
    return {
      hiddenWhenEmpty: hiddenWhenEmpty,
      shown: bar.classList.contains('show'),
      qty: document.getElementById('cbQty').textContent,
      pay: document.getElementById('cbPay').textContent,
      save: document.getElementById('cbSave').textContent,
      quote: lastQuote ? lastQuote.payable : null,
    };
  })()
`, sandbox);
const payNum = parseFloat(String(barT.pay).replace(/[^\d.]/g, ''));
console.log(barT.hiddenWhenEmpty && barT.shown && barT.qty === '5'
    && barT.quote !== null && Math.abs(payNum - barT.quote) < 0.01
    && /省 ¥/.test(barT.save)
  ? `PASS  底部结算条状态正确（${barT.qty} 件 / ${barT.pay} / ${barT.save}）`
  : `FAIL  结算条异常: ${JSON.stringify(barT)}`);

// 清空可撤销：撤销后购物车应完全还原
const undoT = vm.runInContext(`
  (function(){
    var before = JSON.stringify(cart);
    clearCartWithUndo();
    var afterClear = Object.keys(cart).length;
    var host = document.getElementById('toastHost');
    var last = host.children[host.children.length - 1];
    var act = last && last.children[0];
    var label = act ? act.textContent : '';
    if(act) act.onclick();          // 点「撤销」
    return { before: before, afterClear: afterClear, label: label,
             restored: JSON.stringify(cart) };
  })()
`, sandbox);
console.log(undoT.afterClear === 0 && undoT.label === '撤销' && undoT.restored === undoT.before
  ? 'PASS  清空可撤销（撤销后购物车逐项还原）'
  : `FAIL  撤销异常: ${JSON.stringify(undoT)}`);

// 快捷键：/ 聚焦搜索、1-4 切页签、Esc 清空搜索
const keyT = vm.runInContext(`
  (function(){
    var handlers = [];
    var origAdd = document.addEventListener;
    document.addEventListener = function(type, fn){ if(type === 'keydown') handlers.push(fn); };
    initShortcuts();
    document.addEventListener = origAdd;
    if(!handlers.length) return { registered: false };
    var fn = handlers[0];
    function press(key, target){
      var prevented = false;
      fn({ key: key, target: target || { tagName: 'DIV' },
           preventDefault: function(){ prevented = true; },
           metaKey: false, ctrlKey: false, altKey: false });
      return prevented;
    }
    // Esc 清空搜索
    var s = document.getElementById('search');
    s.value = '巨无霸'; keyword = '巨无霸';
    press('Escape');
    var cleared = (s.value === '' && keyword === '');
    // 输入框内按 1 不应切页签
    var tabBefore = document.getElementById('tab-cal').style.display;
    press('1', { tagName: 'INPUT' });
    var noSwitchInInput = document.getElementById('tab-cal').style.display === tabBefore;
    return { registered: true, cleared: cleared, noSwitchInInput: noSwitchInInput };
  })()
`, sandbox);
console.log(keyT.registered && keyT.cleared && keyT.noSwitchInInput
  ? 'PASS  键盘快捷键（Esc 清空搜索；输入框内不误触发）'
  : `FAIL  快捷键异常: ${JSON.stringify(keyT)}`);

console.log('\n全部渲染检查完成');

// 「一键最优用券」必须真的选出比手工全不选更省的组合，且结果可重复
const auto = vm.runInContext(`
  (function(){
    Object.keys(cart).forEach(function(k){ delete cart[k]; });
    cart['bigmac'] = 2; cart['fries-m'] = 1; cart['coke-m'] = 2;
    COUPONS.forEach(function(c){ couponState[c.id] = false; });
    autoPickCoupons();
    var picked = COUPONS.filter(function(c){ return couponState[c.id]; })
                        .map(function(c){ return c.id; }).sort();
    var first = picked.join(',');
    var saveHtml = document.getElementById('saveResult').innerHTML;
    var m = saveHtml.match(/已为你省 ¥([\\d.]+)/);
    autoPickCoupons();  // 再点一次，结果应完全一致（幂等）
    var again = COUPONS.filter(function(c){ return couponState[c.id]; })
                       .map(function(c){ return c.id; }).sort().join(',');
    var bill = document.getElementById('saveResult').innerHTML.match(/券后应付[\\s\\S]*?¥([\\d.]+)/);
    return { first: first, again: again, saved: m ? +m[1] : 0,
             payable: bill ? +bill[1] : 0 };
  })()
`, sandbox);
console.log(auto.first && auto.saved > 0 && auto.payable > 0
    && auto.first === auto.again
  ? `PASS  一键最优用券有效且幂等（用 ${auto.first}，省 ¥${auto.saved.toFixed(2)}，实付 ¥${auto.payable.toFixed(2)}）`
  : `FAIL  一键最优用券异常: ${JSON.stringify(auto)}`);

// 券面板必须展示「省 ¥」估值与互斥/可叠加标签
const cpRendered = vm.runInContext(`
  (function(){
    renderCoupons();
    var h = document.getElementById('couponBox').innerHTML;
    return { save: (h.match(/cn-save/g) || []).length,
             excl: (h.match(/tag excl/g) || []).length,
             stack: (h.match(/tag stack/g) || []).length,
             bad: /undefined|NaN/.test(h) };
  })()
`, sandbox);
console.log(!cpRendered.bad && cpRendered.save > 0 && cpRendered.excl > 0 && cpRendered.stack > 0
  ? `PASS  券面板含省钱估值（${cpRendered.save} 张券标了省额，互斥 ${cpRendered.excl} / 可叠加 ${cpRendered.stack}）`
  : `FAIL  券面板渲染异常: ${JSON.stringify(cpRendered)}`);

// 网格视图必须渲染成 .gcard（而不是把列表塞进网格容器）
const gridOk = vm.runInContext(`
  (function(){
    setView('grid');
    var h = document.getElementById('menuBox').innerHTML;
    var cls = document.getElementById('menuBox').className;
    var res = { gcard: (h.match(/class="gcard/g) || []).length,
                row: (h.match(/class="row/g) || []).length,
                cls: cls };
    setView('list');
    var h2 = document.getElementById('menuBox').innerHTML;
    res.rowAfter = (h2.match(/class="row/g) || []).length;
    res.clsAfter = document.getElementById('menuBox').className;
    return res;
  })()
`, sandbox);
console.log(gridOk.gcard === 59 && gridOk.row === 0 && /grid-view/.test(gridOk.cls)
    && gridOk.rowAfter === 59 && !/grid-view/.test(gridOk.clsAfter)
  ? `PASS  视图切换正确（网格 ${gridOk.gcard} 张卡 / 列表 ${gridOk.rowAfter} 行）`
  : `FAIL  视图切换异常: ${JSON.stringify(gridOk)}`);

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
