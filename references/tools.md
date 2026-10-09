# 麦当劳 MCP 工具速查（实测 35 个）

> 数据来源：麦当劳中国 MCP 开放平台（`https://open.mcd.cn/mcp`）官方文档 +
> **本仓库 2026-10-09 使用真实 Token 对 `https://mcp.mcd.cn` 的实测结果**。
>
> 实测服务端版本：`mcd-mcp@1.0.0`，**实际提供 35 个工具**（官方文档列出 33 个）。
> 下表已按实测结果修正官方文档的命名偏差，并补充了文档遗漏的 2 个工具。
>
> ⚠️ 入参字段名仍**以运行时 `tools/list` 的 JSON Schema 为准**——MCP 是活的接口，随版本演进。

---

## A. 营养与菜单（3）

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `list-nutrition-foods` | 餐品营养信息列表 | 无 | 能量、蛋白质、脂肪、碳水、钠、钙 |
| `query-meals` | 查询门店在售餐品菜单 | `storeCode`（必填）+ `orderType`/`beCode`/`reservationDate` | 分类、餐品编码、名称、标签、价格 |
| `query-meal-detail` | 查询餐品详情 / 套餐组成 | `storeCode`（必填）+ 餐品编码 | 套餐组成、可替换项、特调项（`supportModify`） |

## B. 门店与地址（5）

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `query-nearby-stores` | 查询附近可用门店 | `searchType`（**必传**）+ `city`/`keyword` + `beType` | 门店名、`storeCode`、`beCode`、地址 |
| `delivery-query-addresses` | 获取可配送地址列表 | 无 | 已保存收货地址 |
| `delivery-create-address` | 新增配送地址 ✍️ | 城市/联系人/手机号/地址/门牌号 | 新建结果 |
| `delivery-query-stores` | 查询可配送门店 | `addressId` + `beType` | 可配送门店 + `beCode` |
| `query-meal-assistance` | 查询助餐服务（**仅企业团餐**） | `storeCode` + `beCode` + `orderType=2` + `beType=6` | 助餐服务列表（`gmServiceCode`） |

## C. 优惠券与计价（5）

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `query-store-coupons` | 查询**当前门店**可用券 | `storeCode`（必填） | 券列表（名称/门槛/面额） |
| `available-coupons` | 麦麦省可领取券列表（只读） | 无 | 可领券清单 |
| `auto-bind-coupons` | 麦麦省**一键领券** ✍️ | 无 | 领取结果 |
| `query-my-coupons` | 我的优惠券查询 | 无 | 账户下全部券 |
| `calculate-price` | **商品价格计算** | `storeCode` + `items` + 可选券/`gmServiceCode`/`withOrder`/`needTableware` | 商品金额、配送费、优惠、**应付总价**（单位：**分**） |

## D. 下单与订单（4）

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `create-order` | 创建订单 ✍️ | `storeCode` + `orderType` + `items` + `takeWayCode`(orderType=1) / `addressId`(orderType=2) | 订单详情 + 支付链接 |
| `cancel-order` | 取消订单 ✍️ | 订单号 + `cancelReasonCode` | 取消结果 |
| `query-order` | 查询订单详情 | 订单号 | 状态、内容、配送信息 |
| `order-list` | 查询近期历史订单 | 时间范围 | 历史订单列表 |

## E. 活动与积分（11）

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `campaign-calendar` | 当月营销活动日历 | 月份（可选） | 进行中 / 往期 / 未来活动 |
| `now-time-info` | 获取当前时间信息 | 无 | 时间戳、格式化日期时间、时区 |
| `query-my-account` | 我的积分查询 | 无 | 可用 / 累计 / 冻结 / 即将过期积分 |
| `mall-points-products` | 麦麦商城商品列表 | 积分门槛/分类 | 可兑换或购买商品（`spuId`） |
| `mall-product-detail` | 麦麦商城商品详情 | `spuId` | 图片、积分价、有效期、`skuId`、`shopId` |
| `mall-create-order` | 积分兑换商品下单 ✍️ | `skuId` + `spuCategory` + `count` | 兑换订单号、券码 |
| `mall-order-list` | 麦麦商城订单查询 | 时间范围 | 近一年商城订单 |
| `mall-order-detail` | 麦麦商城订单详情 | 订单号 | 支付积分、金额、状态 |
| `query-lottery-info` | 查看积分抽奖活动信息 | 无 | 活动状态、奖品、`drawDecision` |
| `draw-lottery` | 积分抽奖 ✍️ | 无 | 是否中奖及奖品 |
| `query-my-prizes` | 查看我的奖品 | `pageNum`/`pageSize` | 中奖记录（按时间倒序） |

## F. 主题活动（5）

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `query-party-city` | 主题活动可参与城市列表 | `spuId` | 城市清单（`code`、经纬度） |
| `query-party-store` | 指定城市的活动门店列表 | `code` + 经纬度 + `spuId` | 门店清单（`storeCode`） |
| `query-party-store-date` | 门店可预约日期列表 | `storeCode` + `spuId` | 日期清单（`dateStr`） |
| `query-party-store-session` | 指定日期可预约场次 | `storeCode` + `dateStr` + `spuId` | 场次清单（`id`、起止时间、余位） |
| `party-order-create` | 主题活动订单创建 ✍️ | 城市/门店/日期/场次 + `count` | 预约结果 |

## G. 团餐与其它（2）· 官方文档未列出，实测新增

| 工具 | 用途 | 关键入参 | 返回要点 |
| --- | --- | --- | --- |
| `query-promotions` | 团餐门店**促销 / 满减满折规则** | `storeCode` + `beCode` + `orderType=2` + `beType=6` | 规则列表（`promotionId`/`promotionType`/`ruleDetail`） |
| `query-survey-coupon` | 订单满意度奖券 | 订单相关 | 满意度奖券信息 |

---

## 实测修正：官方文档与本仓库实测的 4 处偏差

以下偏差是跑通真实接口后才暴露的，**照抄官方文档会直接调用失败**：

| # | 官方文档 | 实测（正确） | 影响 |
| --- | --- | --- | --- |
| 1 | `query-partystore-date` | **`query-party-store-date`** | 按文档名调用 → 工具不存在 |
| 2 | `query-partystore-session` | **`query-party-store-session`** | 同上 |
| 3 | 未列出 | **`query-promotions`**（团餐促销规则） | 漏用能力 |
| 4 | 未列出 | **`query-survey-coupon`**（满意度奖券） | 漏用能力 |

> 结论：**官方文档列 33 个，实测 35 个**。永远以 `tools/list` 为准。

---

## 关键参数坑（实测）

1. **`query-nearby-stores` 的 `searchType` 是必传项**
   - `searchType=1`：搜索**收藏餐厅**（新账号无收藏，会失败）。
   - `searchType=2`：按位置搜索，**必须同时给 `city` + `keyword`**。
   - 另外 `beType` 必传：`1`=到店自取（返回门店**无** `beCode`），`5`=得来速（返回门店**有** `beCode`，后续调用**必须**带上）。

2. **`calculate-price` 返回的金额单位是「分」**
   - 展示给用户前**必须除以 100** 转为「元」。这是最容易算错十倍的地方。

3. **`create-order` 的 `takeWayCode` 来源**
   - `orderType=1`（到店/外带）时必传，取值来自 `calculate-price` 返回的 `data.takeWayList[].code`。

4. **`cancel-order` 需要 `cancelReasonCode`**
   - 可选值：`1`=改主意了 `2`=重复下单 `3`=点错了/点多了/点少了 `4`=地址/电话填错了 `5`=送达时间选错了 `-1`=其它原因。

5. **`draw-lottery` 必须以服务端 `drawDecision` 为准**
   - 抽奖前必须展示 `drawDecision.nextConsumption` 并取得用户**明确确认**。
   - 能否抽奖只看 `drawDecision.resourceEligible`，**严禁**根据 `availableTimes` 为 0/null 自行推断（混合规则下次数为 0 仍可用积分抽奖）。

6. **`mall-create-order` 与 `party-order-create` 禁止跳步**
   - 必须逐级选择（城市→门店→日期→场次 / 商品→SKU），每一步等用户明确选择后再继续。
   - **禁止**不调用工具就直接生成"下单成功"的结论性文字。

7. **菜单促销价 ≠ 实付价**
   - 菜单展示的促销价可能附带条件（随单购等），**报价一律以 `calculate-price` 实算为准**。

---

## 调用顺序建议

```
只读探查：  query-nearby-stores(searchType=2) → query-meals → query-meal-detail
省钱链路：  available-coupons → auto-bind-coupons → query-store-coupons → calculate-price
下单链路：  calculate-price → create-order → query-order
营养链路：  list-nutrition-foods + query-meals → (optimizer.py 复算) → query-meal-detail
活动链路：  campaign-calendar + now-time-info + query-my-account
积分链路：  query-my-account → mall-points-products → mall-product-detail → mall-create-order
抽奖链路：  query-lottery-info → draw-lottery → query-my-prizes
派对链路：  mall-points-products(取spuId) → query-party-city → query-party-store → query-party-store-date → query-party-store-session → party-order-create
团餐链路：  delivery-query-stores → query-promotions → query-meals → query-meal-assistance → calculate-price → create-order
```

---

## 错误码

| code | 原因 | 处理建议 |
| --- | --- | --- |
| 401 | MCP Token 无效、已过期或未提供 | 检查 `Authorization` 头与 Token，重新申请 |
| 429 | 触发限流（超过 600 次/分钟） | 降低请求频率，合并查询 |

---

## 实测复现

```bash
# 只读冒烟测试（不下单、不领券、不抽奖）
MCD_MCP_TOKEN=你的Token python scripts/smoke_test.py --city 上海市 --keyword 人民广场

# 导出完整工具清单
MCD_MCP_TOKEN=你的Token python scripts/mcd_client.py --list
```

实测输出（2026-10-09）：

```
✅ initialize            — mcd-mcp@1.0.0
✅ tools/list            — 35 个工具
✅ 关键工具齐全性          — 核心链路所需工具全部在线
✅ now-time-info         — 返回当前时间信息
✅ list-nutrition-foods  — 返回餐品营养数据
✅ query-nearby-stores   — 返回门店查询结果
冒烟测试完成：6/6 通过
```
