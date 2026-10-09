# WorkBuddy 开发对话上下文（workbuddy.md）

> 本文件用于**联动「2026 麦当劳程序员创意开发大赛」的 WorkBuddy 专项奖励**：
> 记录本项目在开发过程中**真实使用腾讯 WorkBuddy** 的上下文与关键节点。
>
> 本文件如实记录，不夸大、不虚构。

---

## 一、开发环境

| 项目 | 内容 |
| --- | --- |
| 开发工具 | 腾讯 WorkBuddy（AI 智能体） |
| 开发模式 | Agent 模式（读取资料 → 设计 → 写代码 → 自测 → 交付） |
| 项目产物 | 麦麦全能搭子（McMate）Skill |
| 运行环境 | Python 3.13（标准库，零第三方依赖） |

---

## 二、WorkBuddy 在本项目中实际承担的工作

1. **需求调研与信息聚合**
   - 读取大赛公告文章，识别出"真正的项目 = 基于麦当劳 MCP 开发创意 Skill 并开源参赛"。
   - 抓取并解析官方活动规则（`M-China/mcd-developer-innovation-challenge`），提炼出参赛必须提交的文件清单。
   - 抓取麦当劳 MCP 官方接入文档与工具列表，整理出工具能力清单；随后用真实 Token 实测，确认服务端 `mcd-mcp@1.0.0` 实际提供 **35 个工具**（多于官方文档的 33 个）。

2. **方案设计与技术选型**
   - 确定"四大模块（点餐 / 省钱 / 营养 / 活动）"的产品结构。
   - 决定把决策逻辑下沉为**可复算算法**（券后最优价引擎、热量预算配餐引擎），而不是依赖模型临场发挥。

3. **代码实现**
   - 编写 `scripts/mcd_client.py`：零依赖的 MCP Streamable HTTP 客户端（含 JSON-RPC 握手、SSE 解析、错误码处理）。
   - 编写 `scripts/optimizer.py`：券后最优价引擎 + 热量预算配餐引擎 + 套餐对比，含内置单元测试。
   - 编写 `scripts/smoke_test.py`：只读冒烟测试。
   - 编写 `SKILL.md` 及全部文档文件。

4. **自测与纠错**
   - 运行 `optimizer.py --selftest`，发现并修正了样例券的互斥分组设计问题（原先允许了不现实的券叠加），使测试全部通过。
   - 运行 `py_compile` 做语法检查，并验证无 Token 时的友好提示。

5. **文档与合规**
   - 按赛事要求产出 `README.md` / `CONTEST_DECLARATION.md` / `MCP_INTEGRATION.md` / `mcp-config.example.json` / `workbuddy.md`。

---

## 三、关键对话节点（节选）

| 轮次 | 用户输入（要点） | WorkBuddy 产出 |
| --- | --- | --- |
| 1 | 给出大赛文章链接，要求阅读并实现项目 | 识别赛事性质，抓取规则与 MCP 文档，梳理技术需求 |
| 2 | 选择"全能搭子（综合版）" + "完整可运行项目" | 确定四大模块与交付范围 |
| 3 | — | 搭建目录结构，实现 MCP 客户端与决策引擎 |
| 4 | — | 运行自测并修正算法样例，产出 SKILL.md 与全部文档 |

---

## 四、可复现证据

任何人在本地即可复现本项目的核心产出：

```bash
# 决策引擎自测（离线，无需 Token）
python scripts/optimizer.py --selftest
# 预期输出：✅ 全部自测通过

# 四大场景演示
python scripts/optimizer.py --demo

# MCP 只读冒烟测试（需自备 Token）
MCD_MCP_TOKEN=你的Token python scripts/smoke_test.py --city 上海市 --keyword 人民广场
```

---

## 五、说明

- 本项目在 WorkBuddy 中**真实开发完成**，上述代码、自测与文档均由 WorkBuddy 在本次开发会话中生成并经本地运行验证。
- 本文件不包含任何 MCP Token 或个人信息。
