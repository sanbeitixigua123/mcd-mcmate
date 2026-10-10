# 麦麦全能搭子 · McMate

> 一句话搞定麦当劳：**点餐 + 省钱 + 营养 + 活动**，四个助手合成一个搭子。

🔗 **在线体验（无需安装、无需 Token）**：<https://sanbeitixigua123.github.io/mcd-mcmate/>

网页版「麦麦省钱计算器」，四个标签页开箱即用：

| 标签页 | 做什么 |
| --- | --- |
| 💰 券后最优价 | 59 款餐品任选（支持搜索 / 分类筛选），勾选优惠券后**穷举所有可行组合**，实时给出实付最低价与最优用券组合 |
| 🥗 热量预算配餐 | 拖动热量上限滑块，按「均衡 / 增肌 / 控钠 / 最省钱」四种策略输出 2–3 个组合方案 |
| 🍱 套餐 vs 单点 | 把购物车当作一套组合，比对套餐一口价与逐项单点价，判定「值不值得买套餐」 |
| 🔌 官方 MCP 能力 | 展示**实测 35 个官方 MCP 工具**（含只读/写操作标注）与本 Demo 的功能对应关系 |

> Demo 的算法与仓库中的 [`scripts/optimizer.py`](scripts/optimizer.py) 完全对齐，一致性由 `docs/verify-demo.js`（28 项断言）自动校验。

基于**麦当劳中国官方 MCP 服务**（`https://mcp.mcd.cn`）开发的 Agent Skill。它不绑定任何特定框架——`SKILL.md` 全程用官方工具名描述流程，可接入 **WorkBuddy**、Claude Code、Cursor、Trae、Cherry Studio 等任意支持 MCP 的客户端。

**2026 麦当劳程序员创意开发大赛参赛作品**（使用 WorkBuddy 开发）。

---

## 它解决什么问题

想吃麦当劳时，你要在四个 App / 页面之间反复横跳：看菜单、翻券、算热量、查活动。McMate 把这件事收敛成一句话：

> "今晚想吃麦当劳，600 大卡以内，越便宜越好，到店自取。"

McMate 会：配出 2–3 个热量达标的方案 → 自动领券并算出券后最低价 → 展示"原价 / 实付 / 省了多少" → 你确认后生成待支付订单。

---

## 四大模块

| 模块 | 一句话 | 核心工具 |
| --- | --- | --- |
| 🍔 **智能点餐** | 一句话点到嘴，支持到店/外送/得来速、套餐换购与特制 | `query-nearby-stores`、`query-meals`、`query-meal-detail`、`calculate-price`、`create-order` |
| 💰 **省钱军师** | 先券后单，券后最优价，每一张券都用在刀刃上 | `auto-bind-coupons`、`query-store-coupons`、`query-my-coupons`、`calculate-price` |
| 🥗 **营养配餐** | 按热量 / 蛋白质 / 控钠目标自动配餐，四种策略 | `list-nutrition-foods`、`query-meals`、`query-meal-detail` |
| 🎉 **活动情报** | 活动日历、积分、商城、抽奖、派对预约一站聚合 | `campaign-calendar`、`query-my-account`、`mall-*`、`draw-lottery`、`party-*` |

---

## 差异化：把"感觉"变成"可复算"

很多点餐助手止步于"帮你说一句话"，结果对不对全看模型当天状态。McMate 把**决策**下沉成确定性算法（`scripts/optimizer.py`，零依赖）：

- **券后最优价引擎** `optimize_price`：穷举可行券组合，遵守**互斥分组**与**叠加规则**，返回实付最低方案。支持满减 / 折扣 / 单品特价三类券。
- **热量预算配餐引擎** `plan_calorie_budget`：在"主餐 + 小食 + 饮品"约束下搜索组合，支持 `balanced` / `protein` / `low_sodium` / `cheapest` 四种策略。
- **套餐 vs 单点对比** `compare_set_vs_single`：一眼看出套餐到底值不值。

模型负责理解意图与解释结果，算法负责把结果算准——**同样的输入永远得到同样的输出**。

### 引擎实测输出

```
$ python scripts/optimizer.py --demo

【场景 A】省钱军师：双人餐怎么点最便宜
  原价 ¥92.00 → 实付 ¥74.50（省 ¥17.50，省 19.0%）
  用券组合：全场 9 折 + 薯条特价 8 元 + 会员日立减 2 元

【场景 B】营养配餐：600 大卡以内
  · 板烧鸡腿堡  ¥24.00  · 鲜蔬杯  ¥12.00  · 橙汁  ¥11.00
  合计 ¥47.00 | 595 kcal | 蛋白 30.5g | 脂肪 18.5g | 钠 935mg
```

---

## 快速开始

### 第一步：申请麦当劳 MCP Token

1. 打开麦当劳 MCP 开放平台 <https://open.mcd.cn/mcp>
2. 手机号验证登录
3. 右上角【控制台】→ 点击【激活】→ 同意服务协议
4. 一键复制你的 MCP Token

### 第二步：把麦当劳 MCP 接入你的 AI 客户端

以 WorkBuddy 为例（其他客户端见 [麦当劳官方接入指南](https://github.com/M-China/mcd-mcp-server)）：

```json
{
  "mcpServers": {
    "mcd-mcp": {
      "type": "streamablehttp",
      "url": "https://mcp.mcd.cn",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

> ⚠️ 把 `YOUR_MCP_TOKEN` 替换为你自己的 Token。**Token 请妥善保管，不要提交到任何公开仓库**——本仓库所有配置一律使用环境变量占位符。

### 第三步：装载本 Skill

把本仓库的 `SKILL.md` 放入你的 Agent 技能目录：

- **WorkBuddy**：`~/.workbuddy/skills/mcd-mcmate/`（连同 `references/`、`scripts/` 一起放）
- 其他框架：参考各自的 Skill / 系统提示加载方式

`references/tools.md` 供 Agent 按需查阅 35 个工具（实测）的入参与返回要点。

### 第四步：开吃

```
"帮我看看今天有什么券，全部领了"
"600 大卡以内配个晚餐，要蛋白质高一点"
"附近有哪些麦当劳？帮我点个板烧鸡腿堡，到店自取，用最便宜的券"
"这个月有什么活动？我的积分快过期了吗？能换点什么？"
```

更多可直接复制的提示词见 [`examples/demo-prompts.md`](examples/demo-prompts.md)。

---

## 本地复现验证

本项目附两个**可直接运行、零第三方依赖**的脚本：

```bash
# 1) 决策引擎自测（离线，无需 Token，验证算法正确性）
python scripts/optimizer.py --selftest     # ✅ 全部自测通过
python scripts/optimizer.py --demo         # 四大场景演示

# 2) MCP 只读冒烟测试（需要 Token，绝不产生业务后果）
MCD_MCP_TOKEN=你的Token python scripts/smoke_test.py --city 上海市 --keyword 人民广场
```

冒烟测试**只调用只读工具**，不会下单、领券、抽奖或消耗积分。

### 实测结果（2026-10-09）

已使用真实 MCP Token 完成**只读**验证：

```
✅ initialize            — mcd-mcp@1.0.0
✅ tools/list            — 35 个工具
✅ 关键工具齐全性          — 核心链路所需工具全部在线
✅ now-time-info         — 返回当前时间信息
✅ list-nutrition-foods  — 返回餐品营养数据
✅ query-nearby-stores   — 返回门店查询结果
冒烟测试完成：6/6 通过
```

实测发现：服务端**实际提供 35 个工具**（官方文档列出 33 个），并暴露了官方文档的 **2 处工具名偏差**（`query-partystore-*` 实为 `query-party-store-*`）与 **2 个未列出的工具**（`query-promotions`、`query-survey-coupon`）。完整证据与 7 条参数坑见 [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) 与 [`references/tools.md`](references/tools.md)。

---

## 仓库结构

```
mcd-mcmate/
├── SKILL.md                  # ★ Skill 主体：四大模块工作流 + 硬性规则
├── README.md                 # 本文件
├── MCP_INTEGRATION.md        # 赛事要求：MCP Server / Tool / 调用流程 / 业务价值
├── CONTEST_DECLARATION.md    # 赛事要求：参赛声明（原创性 / 合规性 / 敏感信息）
├── mcp-config.example.json   # 赛事要求：脱敏 MCP 配置示例（仅环境变量占位符）
├── workbuddy.md              # 赛事要求：WorkBuddy 开发对话上下文
├── LICENSE                   # MIT
├── .gitignore                # 防止 Token / 密钥误提交
├── references/
│   └── tools.md              # MCP 工具速查（实测 35 个）
├── examples/
│   └── demo-prompts.md       # 可直接复制的演示提示词
├── scripts/
│   ├── optimizer.py          # ★ 决策引擎（券后最优价 + 热量配餐），含自测
│   ├── mcd_client.py         # 零依赖 MCP Streamable HTTP 客户端
│   └── smoke_test.py         # 只读冒烟测试
├── tools/
│   └── push.py               # 零依赖 GitHub 推送脚本（Git Data API）
└── docs/
    ├── ARCHITECTURE.md       # 架构与设计说明
    ├── TEST_REPORT.md        # 真实环境只读实测报告（35 工具 / 文档偏差）
    ├── index.html            # 网页版「麦麦省钱计算器」在线 Demo（纯静态，4 个标签页）
    ├── verify-demo.js        # Demo 算法一致性校验（28 项断言，与 optimizer.py 对齐）
    ├── verify-render.js      # Demo 渲染冒烟测试（DOM 桩，含工具清单一致性校验）
    └── test.sh               # 一键跑完上面两项校验
```

### 本地校验 Demo

```bash
bash docs/test.sh
```

会依次跑「算法一致性」与「渲染冒烟」，全绿即表示 Demo 与 Python 引擎完全对齐、且页面无运行时错误。

---

## 目标用户

| 人群 | 痛点 | McMate 的能力 |
| --- | --- | --- |
| 上班族 / 打工人 | 午休时间短，不想在小程序里翻来翻去 | 一句话下单 + 券后最优价 |
| 减脂 / 健身人群 | 想吃但怕热量超标，不会算 | 热量预算配餐 + 营养标签 |
| 学生党 / 精打细算 | 想薅尽每一张券、每一分积分 | 一键领券 + 券后比价 + 积分商城筛选 |
| 麦门老粉 / 潮玩玩家 | 活动、联名、抽奖、派对太多记不住 | 活动日历 + 积分 + 派对预约聚合 |

---

## 设计原则

- **先券后单**：任何下单前先领券、先比价，展示券后价与省钱金额。
- **报价以实算为准**：菜单促销价可能附带条件，最终一律以 `calculate-price` 为准。
- **下单需确认**：写操作前必须复述明细并取得用户明确同意；支付永远跳转麦当劳官方渠道，Skill 不接触支付。
- **隐私最小化**：不读取、不缓存、不展示地址与订单中的敏感信息；Token 只从环境变量读取。
- **诚实降级**：工具失败时如实告知，绝不编造"看起来合理"的结果。
- **营养免责**：配餐结果仅供生活方式参考，不构成医疗或营养学专业建议。

---

## 参赛信息

- 赛事：**2026 麦当劳程序员创意开发大赛**
- 官方仓库：<https://github.com/M-China/mcd-developer-innovation-challenge>
- 依赖服务：麦当劳中国官方 MCP Server（`https://mcp.mcd.cn`，Streamable HTTP，Bearer Token）
- 开发工具：腾讯 WorkBuddy（详见 [`workbuddy.md`](workbuddy.md)）

## 免责声明

本作品为大赛参赛作品，**非麦当劳官方产品**。餐品、价格、优惠、活动与积分信息均以麦当劳官方渠道的实时结果为准；本项目输出仅供参考，不构成专业建议。

## License

[MIT](LICENSE)
