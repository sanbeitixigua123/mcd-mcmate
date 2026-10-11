#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把本地文件推送到 GitHub 仓库（走 REST API，零依赖）。

用法：
  python push.py <repo> <branch> <local_path>:<remote_path> [<local_path>:<remote_path> ...]

Token 读取顺序（先命中者优先）：
  1. 环境变量 GITHUB_TOKEN
  2. 环境变量 GH_TOKEN
  3. 命令行 --token-file <path>
  4. 仓库根目录的 .github-token（已在 .gitignore 中）
  5. 用户主目录的 ~/.github-token

推荐把 token 放进文件而不是写进命令行 —— 避免出现在 shell 历史和进程列表里。

示例：
  python push.py sanbeitixigua123/mcd-mcmate main docs/index.html:docs/index.html
  python push.py sanbeitixigua123/mcd-mcmate main --token-file ~/.github-token a.html:a.html
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"


def load_token(argv):
    """按优先级找到 token；找不到就报错退出。"""
    for key in ("GITHUB_TOKEN", "GH_TOKEN"):
        v = os.environ.get(key, "").strip()
        if v:
            return v, key

    candidates = []
    # --token-file 显式指定
    for i, a in enumerate(argv):
        if a == "--token-file" and i + 1 < len(argv):
            candidates.append(argv[i + 1])
        elif a.startswith("--token-file="):
            candidates.append(a.split("=", 1)[1])
    # 约定位置
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates.append(os.path.join(here, ".github-token"))
    candidates.append(os.path.join(os.path.expanduser("~"), ".github-token"))

    for p in candidates:
        if p and os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as f:
                v = f.read().strip()
            if v:
                return v, p

    sys.stderr.write(
        "找不到 GitHub token。请任选一种方式提供：\n"
        "  1) export GITHUB_TOKEN=<token>\n"
        "  2) 把 token 写进 <repo>/.github-token\n"
        "  3) 把 token 写进 ~/.github-token\n"
        "  4) python push.py ... --token-file <path>\n"
    )
    sys.exit(2)


TOKEN, TOKEN_SRC = load_token(sys.argv)


def req(method, path, body=None):
    url = API + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    r.add_header("Accept", "application/vnd.github+json")
    r.add_header("X-GitHub-Api-Version", "2022-11-28")
    r.add_header("User-Agent", "mcd-mcmate-push")
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main():
    argv = [a for a in sys.argv[1:] if not a.startswith("--token-file")]
    # --token-file <path> 是两段式，需要把它的值也一并剔除
    cleaned, skip = [], False
    for a in sys.argv[1:]:
        if skip:
            skip = False
            continue
        if a == "--token-file":
            skip = True
            continue
        if a.startswith("--token-file="):
            continue
        cleaned.append(a)
    argv = cleaned

    if len(argv) < 3:
        print(__doc__)
        return 1
    repo, branch = argv[0], argv[1]
    mapping = []
    for a in argv[2:]:
        lp, _, rp = a.partition(":")
        mapping.append((lp, rp or lp))

    print(f"token 来源：{TOKEN_SRC}")

    # 1) 取分支 HEAD
    st, ref = req("GET", f"/repos/{repo}/git/ref/heads/{branch}")
    if st != 200:
        print("取分支失败", st, ref)
        return 1
    parent = ref["object"]["sha"]

    st, commit = req("GET", f"/repos/{repo}/git/commits/{parent}")
    base_tree = commit["tree"]["sha"]

    # 2) 上传 blob
    tree_items = []
    for lp, rp in mapping:
        with open(lp, "rb") as f:
            content = f.read()
        st, blob = req("POST", f"/repos/{repo}/git/blobs",
                       {"content": base64.b64encode(content).decode(), "encoding": "base64"})
        if st not in (200, 201):
            print("blob 失败", lp, st, blob)
            return 1
        tree_items.append({"path": rp, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print(f"  blob  {rp}  {len(content)}B  {blob['sha'][:8]}")

    # 3) 建 tree
    st, tree = req("POST", f"/repos/{repo}/git/trees",
                   {"base_tree": base_tree, "tree": tree_items})
    if st not in (200, 201):
        print("tree 失败", st, tree)
        return 1

    # 4) 建 commit
    st, newc = req("POST", f"/repos/{repo}/git/commits",
                   {"message": "docs: 菜品库扩充至 59 项 + second_half 券 + 搜索筛选",
                    "tree": tree["sha"], "parents": [parent]})
    if st not in (200, 201):
        print("commit 失败", st, newc)
        return 1

    # 5) 移动 ref
    st, upd = req("PATCH", f"/repos/{repo}/git/refs/heads/{branch}", {"sha": newc["sha"]})
    if st != 200:
        print("ref 更新失败", st, upd)
        return 1
    print(f"\n已推送 {repo}@{branch} → {newc['sha'][:12]}")
    print("commit:", newc["sha"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
