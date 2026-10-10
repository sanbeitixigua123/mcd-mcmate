#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把本地文件推送到 GitHub 仓库（走 REST API，零依赖）。
用法：
  python push.py <repo> <branch> <local_path>:<remote_path> [<local_path>:<remote_path> ...]
示例：
  python push.py sanbeitixigua123/mcd-mcmate main docs/index.html:docs/index.html
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = "https://api.github.com"


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
    if len(sys.argv) < 4:
        print(__doc__)
        return 1
    repo, branch = sys.argv[1], sys.argv[2]
    mapping = []
    for a in sys.argv[3:]:
        lp, _, rp = a.partition(":")
        mapping.append((lp, rp or lp))

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
