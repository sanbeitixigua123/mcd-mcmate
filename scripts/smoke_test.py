#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""麦麦全能搭子 · MCP 冒烟测试（只读，可复现）。

用途：在不产生任何业务后果的前提下，验证你的 MCP Token 是否可用、
官方工具清单是否与 Skill 预期一致、核心只读链路是否打通。

本脚本**只调用只读工具**，绝不会下单、领券、抽奖或消耗积分。

用法::

    MCD_MCP_TOKEN=你的Token python smoke_test.py --city 上海市 --keyword 人民广场

输出示例::

    ✅ initialize    — mcd-mcp@1.0.9
    ✅ tools/list    — 35 个工具
    ✅ now-time-info — 2026-10-09 21:20 (周五)
    ✅ list-nutrition-foods — 160 条营养数据
    ✅ query-nearby-stores  — 5 家门店，首选=...（3450149）
    ✅ query-meals          — 13 个分类 / 122 个餐品
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Any, Dict, List, Optional

try:
    from mcd_client import DEFAULT_URL, TOKEN_ENV, McdMcpClient, McdMcpError
except ImportError:  # 允许从上级目录直接运行
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from mcd_client import DEFAULT_URL, TOKEN_ENV, McdMcpClient, McdMcpError


class Recorder:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def ok(self, label: str, detail: str = "") -> None:
        self.passed += 1
        print(f"✅ {label:<26} — {detail}")

    def fail(self, label: str, detail: str = "") -> None:
        self.failed += 1
        print(f"❌ {label:<26} — {detail}")


def _first_store_id(text: str) -> Optional[str]:
    """从门店查询文本里粗略抓一个门店编号（官方返回为 Markdown）。"""
    m = re.search(r"[（(](\d{5,})[)）]", text)
    if m:
        return m.group(1)
    m = re.search(r"\b(\d{7,})\b", text)
    return m.group(1) if m else None


def run(city: str, keyword: str, url: str) -> int:
    rec = Recorder()
    try:
        client = McdMcpClient.from_env(url=url)
    except McdMcpError as exc:
        print(f"[错误] {exc}", file=sys.stderr)
        return 2

    try:
        # 1) 握手
        info = client.initialize()
        si = (info or {}).get("serverInfo", {})
        rec.ok("initialize", f"{si.get('name', 'mcd-mcp')}@{si.get('version', '?')}")

        # 2) 工具清单
        tools: List[Dict[str, Any]] = client.list_tools()
        names = {t.get("name") for t in tools}
        rec.ok("tools/list", f"{len(tools)} 个工具")

        expected = {"list-nutrition-foods", "query-meals", "calculate-price", "create-order",
                    "query-nearby-stores", "campaign-calendar", "query-my-account"}
        missing = expected - names
        if missing:
            rec.fail("关键工具齐全性", f"缺少 {sorted(missing)}")
        else:
            rec.ok("关键工具齐全性", "核心链路所需工具全部在线")

        # 3) 当前时间（最轻量的只读调用）
        try:
            t = McdMcpClient.extract_text(client.call_tool("now-time-info"))
            rec.ok("now-time-info", t.strip().replace("\n", " ")[:48])
        except McdMcpError as exc:
            rec.fail("now-time-info", str(exc))

        # 4) 营养库
        try:
            n = McdMcpClient.extract_text(client.call_tool("list-nutrition-foods"))
            rec.ok("list-nutrition-foods", f"{len(n)} 字符营养数据")
        except McdMcpError as exc:
            rec.fail("list-nutrition-foods", str(exc))

        # 5) 附近门店
        store_id: Optional[str] = None
        try:
            s = McdMcpClient.extract_text(
                client.call_tool("query-nearby-stores", {"city": city, "keyword": keyword})
            )
            store_id = _first_store_id(s)
            rec.ok("query-nearby-stores", f"命中门店，storeCode={store_id or '未识别'}")
        except McdMcpError as exc:
            rec.fail("query-nearby-stores", str(exc))

        # 6) 菜单（若拿到门店编号）
        if store_id:
            try:
                meals = McdMcpClient.extract_text(
                    client.call_tool("query-meals", {"storeCode": store_id})
                )
                rec.ok("query-meals", f"{len(meals)} 字符菜单数据")
            except McdMcpError as exc:
                rec.fail("query-meals", str(exc))
        else:
            print("⚠️  跳过 query-meals（未识别到门店编号）")

    except McdMcpError as exc:
        print(f"[错误] {exc}", file=sys.stderr)
        return 1
    finally:
        client.session_id = None

    print()
    total = rec.passed + rec.failed
    print(f"冒烟测试完成：{rec.passed}/{total} 通过")
    return 0 if rec.failed == 0 else 1


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="麦当劳 MCP 只读冒烟测试")
    parser.add_argument("--city", default="上海市", help="用于门店查询的城市")
    parser.add_argument("--keyword", default="人民广场", help="用于门店查询的商圈/地标关键词")
    parser.add_argument("--url", default=DEFAULT_URL, help="MCP 接入地址")
    args = parser.parse_args(argv)

    if not os.environ.get(TOKEN_ENV, "").strip():
        print(
            f"[提示] 未检测到环境变量 {TOKEN_ENV}。\n"
            f"       请先到 https://open.mcd.cn/mcp 申请 MCP Token，然后：\n"
            f"       MCD_MCP_TOKEN=你的Token python smoke_test.py",
            file=sys.stderr,
        )
        return 2
    return run(args.city, args.keyword, args.url)


if __name__ == "__main__":
    raise SystemExit(main())
