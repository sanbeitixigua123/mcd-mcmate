#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""麦当劳中国 MCP Server 轻量客户端（零第三方依赖，仅使用 Python 标准库）。

为什么单独写一个客户端？
    WorkBuddy / Cursor / Cherry Studio 等 MCP 客户端会自动处理协议握手。
    但在「命令行复现」「CI 冒烟测试」「本地调试」场景下，我们需要一个
    不依赖任何框架的最小实现，用来直接验证 Token 是否有效、工具是否可用。

传输协议：Streamable HTTP
    接入地址 : https://mcp.mcd.cn
    鉴权     : Authorization: Bearer <MCD_MCP_TOKEN>
    请求     : POST application/json （JSON-RPC 2.0）
    响应     : application/json 或 text/event-stream（SSE）

用法::

    # 只读列出全部工具
    MCD_MCP_TOKEN=xxx python mcd_client.py --list

    # 调用单个工具（只读示例）
    MCD_MCP_TOKEN=xxx python mcd_client.py --call now-time-info
    MCD_MCP_TOKEN=xxx python mcd_client.py --call query-nearby-stores \
        --args '{"city":"上海市","keyword":"人民广场"}'

    # 作为库使用
    from mcd_client import McdMcpClient
    with McdMcpClient.from_env() as c:
        tools = c.list_tools()
        print(len(tools))

注意：本客户端默认不做任何写操作。涉及下单 / 抽奖 / 领券等会产生实际
业务后果的工具，请显式使用 `--allow-write` 并在交互确认后调用。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Optional

__all__ = ["McdMcpClient", "McdMcpError", "TOKEN_ENV", "DEFAULT_URL"]

DEFAULT_URL = "https://mcp.mcd.cn"
TOKEN_ENV = "MCD_MCP_TOKEN"
PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "mcd-mcmate", "version": "1.0.0"}

# 会产生真实业务后果的工具（下单 / 领券 / 抽奖 / 兑换 / 取消）
WRITE_TOOLS = frozenset(
    {
        "create-order",
        "cancel-order",
        "auto-bind-coupons",
        "mall-create-order",
        "draw-lottery",
        "party-order-create",
        "delivery-create-address",
    }
)


class McdMcpError(RuntimeError):
    """MCP 调用或传输层错误。"""

    def __init__(self, message: str, code: Optional[int] = None) -> None:
        super().__init__(message)
        self.code = code


class McdMcpClient:
    """极简 MCP Streamable HTTP 客户端。"""

    def __init__(self, token: str, url: str = DEFAULT_URL, timeout: int = 30) -> None:
        if not token:
            raise McdMcpError(
                f"未提供 MCP Token。请先到 https://open.mcd.cn/mcp 申请，"
                f"然后设置环境变量 {TOKEN_ENV}。"
            )
        self.token = token
        self.url = url
        self.timeout = timeout
        self.session_id: Optional[str] = None
        self.server_info: Dict[str, Any] = {}
        self._req_id = 0

    # ------------------------------------------------------------------ #
    # 构造
    # ------------------------------------------------------------------ #
    @classmethod
    def from_env(cls, url: str = DEFAULT_URL) -> "McdMcpClient":
        token = os.environ.get(TOKEN_ENV, "").strip()
        return cls(token=token, url=url)

    # ------------------------------------------------------------------ #
    # 上下文管理
    # ------------------------------------------------------------------ #
    def __enter__(self) -> "McdMcpClient":
        self.initialize()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.session_id = None

    # ------------------------------------------------------------------ #
    # 传输层
    # ------------------------------------------------------------------ #
    def _next_id(self) -> int:
        self._req_id += 1
        return self._req_id

    def _post(self, payload: Dict[str, Any], expect_response: bool = True) -> Optional[Dict[str, Any]]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": f"{CLIENT_INFO['name']}/{CLIENT_INFO['version']}",
        }
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                sid = resp.headers.get("Mcp-Session-Id") or resp.headers.get("mcp-session-id")
                if sid:
                    self.session_id = sid
                ctype = (resp.headers.get("Content-Type") or "").lower()
                raw = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:  # 401 / 429 / 5xx
            body = exc.read().decode("utf-8", errors="replace")
            code = exc.code
            if code == 401:
                raise McdMcpError("MCP Token 无效、已过期或未提供（401）。", code) from exc
            if code == 429:
                raise McdMcpError("触发限流：超过 600 次/分钟（429），请降低频率。", code) from exc
            raise McdMcpError(f"HTTP {code}: {body[:500]}", code) from exc
        except urllib.error.URLError as exc:
            raise McdMcpError(f"网络错误：无法连接 {self.url}（{exc.reason}）。") from exc

        if not expect_response or not raw.strip():
            return None

        if "text/event-stream" in ctype:
            return self._parse_sse(raw)
        return json.loads(raw)

    @staticmethod
    def _parse_sse(raw: str) -> Dict[str, Any]:
        """从 SSE 文本中提取最后一个 data: 事件并解析为 JSON。"""
        result: Optional[Dict[str, Any]] = None
        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                chunk = line[len("data:"):].strip()
                if chunk and chunk != "[DONE]":
                    try:
                        result = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue
        if result is None:
            raise McdMcpError(f"无法从 SSE 响应中解析 JSON：{raw[:300]}")
        return result

    # ------------------------------------------------------------------ #
    # 协议层
    # ------------------------------------------------------------------ #
    def initialize(self) -> Dict[str, Any]:
        resp = self._post(
            {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "initialize",
                "params": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": CLIENT_INFO,
                },
            }
        )
        result = (resp or {}).get("result", {})
        self.server_info = result.get("serverInfo", {})
        # 按 MCP 规范发送 initialized 通知（无需等待响应）
        self._post(
            {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            expect_response=False,
        )
        return result

    def list_tools(self) -> List[Dict[str, Any]]:
        resp = self._post(
            {"jsonrpc": "2.0", "id": self._next_id(), "method": "tools/list", "params": {}}
        )
        return ((resp or {}).get("result", {}) or {}).get("tools", []) or []

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None, allow_write: bool = False) -> Any:
        if name in WRITE_TOOLS and not allow_write:
            raise McdMcpError(
                f"工具 `{name}` 会产生真实业务后果（下单/领券/抽奖/兑换）。"
                f"如需执行，请显式传入 allow_write=True。"
            )
        resp = self._post(
            {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments or {}},
            }
        )
        payload = resp or {}
        if "error" in payload:
            err = payload["error"]
            raise McdMcpError(f"调用 `{name}` 失败：{err.get('message', err)}")
        return payload.get("result", {})

    # ------------------------------------------------------------------ #
    # 便捷方法：把 MCP 返回的 content 拍平成纯文本
    # ------------------------------------------------------------------ #
    @staticmethod
    def extract_text(result: Any) -> str:
        """把 tools/call 的 result.content 拍平成可读文本。"""
        if not isinstance(result, dict):
            return str(result)
        parts: List[str] = []
        for block in result.get("content", []) or []:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        if not parts and "structuredContent" in result:
            parts.append(json.dumps(result["structuredContent"], ensure_ascii=False, indent=2))
        return "\n".join(parts) if parts else json.dumps(result, ensure_ascii=False)


# ---------------------------------------------------------------------- #
# CLI
# ---------------------------------------------------------------------- #
def _print_tools(tools: Iterable[Dict[str, Any]]) -> None:
    tools = list(tools)
    print(f"共 {len(tools)} 个工具：\n")
    for t in tools:
        flag = "  [写]" if t.get("name") in WRITE_TOOLS else ""
        print(f"- {t.get('name')}{flag}\n    {t.get('description', '')}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="麦当劳 MCP 极简客户端")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"MCP 接入地址（默认 {DEFAULT_URL}）")
    parser.add_argument("--list", action="store_true", help="列出全部工具后退出")
    parser.add_argument("--call", metavar="TOOL", help="调用指定工具")
    parser.add_argument("--args", default="{}", help="工具参数，JSON 字符串")
    parser.add_argument("--allow-write", action="store_true", help="允许调用下单/领券等写操作")
    args = parser.parse_args(argv)

    try:
        client = McdMcpClient.from_env(url=args.url)
    except McdMcpError as exc:
        print(f"[错误] {exc}", file=sys.stderr)
        return 2

    try:
        client.initialize()
        info = client.server_info or {}
        print(f"[OK] 已连接 {info.get('name', 'mcd-mcp')}@{info.get('version', '?')}\n")

        if args.list:
            _print_tools(client.list_tools())
            return 0

        if args.call:
            try:
                arguments = json.loads(args.args)
            except json.JSONDecodeError as exc:
                print(f"[错误] --args 不是合法 JSON：{exc}", file=sys.stderr)
                return 2
            result = client.call_tool(args.call, arguments, allow_write=args.allow_write)
            print(McdMcpClient.extract_text(result))
            return 0

        parser.print_help()
        return 0
    except McdMcpError as exc:
        print(f"[错误] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
