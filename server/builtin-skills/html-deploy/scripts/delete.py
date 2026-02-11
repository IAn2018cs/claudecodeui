#!/usr/bin/env python3
"""删除已部署的页面。

用法: delete.py <page_id>
输出: 删除结果
"""
import sys
import json
import urllib.request

API_BASE = "http://10.0.0.252:11004"


def main():
    if len(sys.argv) != 2:
        print(f"用法: {sys.argv[0]} <page_id>", file=sys.stderr)
        sys.exit(1)

    page_id = sys.argv[1]
    req = urllib.request.Request(
        f"{API_BASE}/deploy/{page_id}",
        method="DELETE",
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        print(result["detail"])


if __name__ == "__main__":
    main()
