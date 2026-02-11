#!/usr/bin/env python3
"""部署 HTML 文件为网页。

用法: deploy.py <html_file>
输出: 部署成功后的访问 URL
"""
import sys
import json
import urllib.request

API_BASE = "http://10.0.0.252:11004"


def main():
    if len(sys.argv) != 2:
        print(f"用法: {sys.argv[0]} <html_file>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        html = f.read()

    data = json.dumps({"html": html}).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/deploy",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        print(result["url"])


if __name__ == "__main__":
    main()
