# MCP 接入说明（MCP_INTEGRATION）

本文档说明 McMate 实际使用的麦当劳 MCP Server、Tool、调用流程与业务价值。

---

## 1. 使用的 MCP Server

| 项目 | 值 |
| --- | --- |
| 服务提供方 | 麦当劳中国（McDonald's China） |
| 接入地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权方式 | 请求头 `Authorization: Bearer <MCD_MCP_TOKEN>` |
| Token 申请 | <https://open.mcd.cn/mcp>（手机号登录 → 控制台 → 激活） |
| 服务范围 | 中国大陆地区（不含港澳台） |
| 限流 | 每 Token 每分钟最多 600 次请求（超出返回 429） |

McMate 不依赖任何麦当劳之外的第三方数据源，所有餐品、价格、券、活动、积分数据均来自该 Server。

---

## 2. 使用的 Tool 与用途

McMate 覆盖官方 MCP 提供的 35 个工具（2026-10-09 实测；官方文档列出 33 个），按四大模块划分：

### 模块 1 · 智能点餐

| Tool | 在本项目中的作用 |
| --- | --- |
| `query-nearby-stores` | 按城市 + 关键词定位门店，拿到后续查询的主键 `storeCode` |
| `delivery-query-addresses` / `delivery-query-stores` | 外送场景：定位收货地址与可配送门店 |
| `delivery-create-address` | 用户无地址时新增（写操作，需确认） |
| `query-meal-assistance` | 企业团餐场景查询助餐服务 |
| `query-meals` | 拉取门店在售菜单（分类 / 编码 / 标签） |
| `query-meal-detail` | 查套餐组成与**可替换项 / 可特制项**，支撑"换购"与"特制" |
| `calculate-price` | 实算金额、配送费、优惠、应付总价 |
| `create-order` | 生成待支付订单（写操作，需确认） |
| `query-order` / `cancel-order` / `order-list` | 订单跟进、取消与历史查询 |

### 模块 2 · 省钱军师

| Tool | 在本项目中的作用 |
| --- | --- |
| `available-coupons` | 只读查看麦麦省可领券 |
| `auto-bind-coupons` | 一键领取全部可领券（写操作，需确认） |
| `query-my-coupons` | 查询账户全部券 |
| `query-store-coupons` | 查询**当前门店**维度可用券（比账户维度更准，优先使用） |
| `calculate-price` | 带券试算，对比"不用券 / 单张最优 / 可叠加组合"，取实付最低 |

### 模块 3 · 营养配餐

| Tool | 在本项目中的作用 |
| --- | --- |
| `list-nutrition-foods` | 获取餐品营养（能量、蛋白质、脂肪、碳水、钠、钙） |
| `query-meals` | 拉取在售餐品，与营养库按餐品名/编码对齐 |
| `query-meal-detail` | 提示可替换项（如中薯 → 鲜蔬杯），让配餐可落地 |

### 模块 4 · 活动情报

| Tool | 在本项目中的作用 |
| --- | --- |
| `campaign-calendar` | 当月活动日历（进行中 / 往期 / 未来） |
| `now-time-info` | 拿到准确当前时间，由 Skill 计算活动倒计时与状态 |
| `query-my-account` | 查可用 / 累计 / 冻结 / 即将过期积分 |
| `mall-points-products` / `mall-product-detail` / `mall-create-order` | 积分商城浏览 → 详情 → 兑换 |
| `mall-order-list` / `mall-order-detail` | 商城订单查询 |
| `query-lottery-info` / `draw-lottery` / `query-my-prizes` | 积分抽奖规则 → 抽奖 → 中奖记录 |
| `query-party-city` → `query-party-store` → `query-partystore-date` → `query-partystore-session` → `party-order-create` | 派对 / 品鉴会等主题活动预约全链路 |

---

## 3. 核心调用流程

### 流程 A：省钱下单（先券后单）

```
用户："帮我点个板烧鸡腿堡套餐，到店自取，用最便宜的券"

① query-nearby-stores(city, keyword)          → 选定门店 storeCode
② query-meals(storeCode)                       → 确认板烧鸡腿堡套餐编码
③ query-meal-detail(storeCode, 套餐编码)        → 看套餐组成与可替换项
④ available-coupons()                          → 展示可领券，征求同意
⑤ auto-bind-coupons()                          → 一键领券（写操作，已确认）
⑥ query-store-coupons(storeCode)               → 拿当前门店可用券
⑦ calculate-price(storeCode, 商品, 券)          → 试算多组，取实付最低
⑧ 向用户复述账单：原价 → 实付（省 X 元 / Y%）
⑨ create-order(...)                            → 生成待支付订单 + 官方支付链接
```

### 流程 B：热量预算配餐

```
用户："600 大卡以内配个晚餐，蛋白质高一点"

① list-nutrition-foods()                       → 营养库
② query-meals(storeCode)                       → 在售餐品
③ optimizer.plan_calorie_budget(..., 'protein')→ 离线复算最优组合
④ query-meal-detail(...)                       → 提示可替换项，微调热量
⑤ 输出 2–3 个方案（kcal / 蛋白 / 钠 / 价格），用户选定
⑥ 转流程 A 的 ④–⑨ 完成下单
```

### 流程 C：活动与积分

```
用户："这个月有什么活动？我的积分快过期了吗？"

① campaign-calendar()      → 当月活动，区分进行中 / 往期 / 未来
② now-time-info()          → 当前时间，计算倒计时
③ query-my-account()       → 积分余额 + 即将过期积分
④ mall-points-products(积分门槛) → 筛出可兑换商品
⑤ query-lottery-info()     → 有抽奖机会则提醒
⑥ 汇总成一张"情报简报"
```

---

## 4. 业务价值

| 价值点 | 说明 |
| --- | --- |
| **降低决策成本** | 把跨 4 个页面（菜单/券/营养/活动）的决策收敛到一次对话 |
| **真实省钱** | 先券后单 + 券后最优价引擎，把"能省的都省掉"，并量化省了多少 |
| **健康可控** | 用官方营养数据做热量预算配餐，让"想吃麦当劳"和"减脂"不再对立 |
| **不错过活动** | 活动日历 + 积分即将过期提醒 + 派对预约，减少"错过"与"积分浪费" |
| **确定性决策** | 券后最优价与配餐由可复算算法给出，而非模型临场发挥，结果可解释、可复现 |

---

## 5. 安全与合规

- **只读优先**：默认链路以只读工具为主；所有写操作（下单 / 领券 / 兑换 / 抽奖 / 新增地址）前必须向用户复述并取得明确同意。
- **不接触支付**：Skill 只生成待支付订单并给出官方支付链接，绝不索取或代付。
- **隐私最小化**：不读取、不缓存、不展示手机号、完整地址、订单号等敏感信息；Token 仅从环境变量读取。
- **凭证保护**：仓库内所有配置使用环境变量占位符，`.gitignore` 阻止 Token 误提交。
