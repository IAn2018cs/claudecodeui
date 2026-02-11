#!/usr/bin/env python3
"""更新已部署的页面内容。

用法: update.py <page_id> <html_file>
输出: 更新成功后的访问 URL
"""
import sys
import json
import urllib.request

API_BASE = "http://10.0.0.252:11004"


def main():
    if len(sys.argv) != 3:
        print(f"用法: {sys.argv[0]} <page_id> <html_file>", file=sys.stderr)
        sys.exit(1)

    page_id = sys.argv[1]

    with open(sys.argv[2], "r", encoding="utf-8") as f:
        html = f.read()

    data = json.dumps({"html": html}).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/deploy/{page_id}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        print(result["url"])


if __name__ == "__main__":
    main()
