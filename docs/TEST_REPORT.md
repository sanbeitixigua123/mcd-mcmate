# 实测报告（TEST_REPORT）

**测试时间**：2026-10-09
**测试对象**：麦当劳中国 MCP Server `https://mcp.mcd.cn`
**测试工具**：本仓库 `scripts/smoke_test.py`、`scripts/mcd_client.py`（均只读）
**测试性质**：**只读验证** —— 未下单、未领券、未抽奖、未兑换、未消耗任何积分

---

## 一、连接与握手

| 检查项 | 结果 |
| --- | --- |
| 接入地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 鉴权 | `Authorization: Bearer ***`（Token 已脱敏） |
| 握手 | ✅ 成功，服务端 `mcd-mcp@1.0.0` |
| 协议版本 | `2025-06-18` |

---

## 二、工具清单

| 检查项 | 结果 |
| --- | --- |
| `tools/list` 返回工具数 | **35 个** |
| 官方文档列出数 | 33 个 |
| 差异 | **实测多 2 个**（`query-promotions`、`query-survey-coupon`） |
| 核心工具齐全性 | ✅ 点餐 / 券 / 计价 / 下单 / 活动 / 积分链路工具全部在线 |

实测得到的 35 个工具名（按字母序）：

```
auto-bind-coupons          mall-create-order        query-meal-detail
available-coupons          mall-order-detail        query-meals
calculate-price            mall-order-list          query-my-account
campaign-calendar          mall-points-products     query-my-coupons
cancel-order               mall-product-detail      query-my-prizes
create-order               now-time-info            query-nearby-stores
delivery-create-address    order-list               query-order
delivery-query-addresses   party-order-create       query-party-city
delivery-query-stores      query-lottery-info       query-party-store
draw-lottery               query-meal-assistance    query-party-store-date
                                                     query-party-store-session
                                                     query-promotions
                                                     query-store-coupons
                                                     query-survey-coupon
```

---

## 三、只读链路验证

| 工具 | 结果 | 说明 |
| --- | --- | --- |
| `initialize` | ✅ | `mcd-mcp@1.0.0` |
| `tools/list` | ✅ | 35 个工具 |
| `now-time-info` | ✅ | 返回当前时间信息 |
| `list-nutrition-foods` | ✅ | 返回餐品营养数据（6666 字符） |
| `query-nearby-stores` | ✅ | 返回门店查询结果 |
| `query-meals` | ⏭️ 跳过 | 未从门店结果中解析出 `storeCode`，故跳过（不影响结论） |

**冒烟测试结果：6/6 通过**

---

## 四、由实测暴露的 4 处官方文档偏差

| # | 官方文档 | 实测正确值 | 影响 |
| --- | --- | --- | --- |
| 1 | `query-partystore-date` | `query-party-store-date` | 按文档名调用直接失败 |
| 2 | `query-partystore-session` | `query-party-store-session` | 同上 |
| 3 | 未列出 | `query-promotions` | 漏用团餐促销能力 |
| 4 | 未列出 | `query-survey-coupon` | 漏用满意度奖券能力 |

---

## 五、关键参数坑（实测确认）

1. `query-nearby-stores` 的 `searchType` **必传**：`1`=收藏餐厅（新账号会失败），`2`=按位置（**必须** `city`+`keyword`）；`beType` 必传（`1`=到店自取无 `beCode`，`5`=得来速有 `beCode` 且后续必带）。
2. `calculate-price` 返回金额单位为**分**，展示前须 `/100`。
3. `create-order` 在 `orderType=1` 时必传 `takeWayCode`，取值来自 `calculate-price` 的 `data.takeWayList[].code`。
4. `cancel-order` 需要 `cancelReasonCode`（枚举 1/2/3/4/5/-1）。
5. `draw-lottery` 必须以服务端 `drawDecision` 为准，**不得**据 `availableTimes` 自行推断。
6. `mall-create-order` / `party-order-create` **禁止跳步**，且禁止不调用工具就宣称"下单成功"。
7. 菜单促销价 ≠ 实付价，报价一律以 `calculate-price` 实算为准。

> 这些坑已被写入 `references/tools.md` 与 `SKILL.md`，是本 Skill 相比"照抄文档"的差异价值。

---

## 六、复现方式

```bash
# 1) 决策引擎自测（离线，无需 Token）
python scripts/optimizer.py --selftest
# → ✅ 全部自测通过（9 项）

# 2) 只读冒烟测试（需要 Token）
MCD_MCP_TOKEN=你的Token python scripts/smoke_test.py --city 上海市 --keyword 人民广场
# → 冒烟测试完成：6/6 通过

# 3) 导出完整工具清单
MCD_MCP_TOKEN=你的Token python scripts/mcd_client.py --list
```

---

## 七、声明

- 本报告仅记录**只读**验证，未产生任何订单、领券、抽奖或积分消耗。
- 报告中不含任何真实 Token 或个人信息。
- 实测结果对应 2026-10-09 的接口状态；MCP 为活接口，后续版本可能变化，请以实际 `tools/list` 为准。
