#!/usr/bin/env python3
"""
清理部署的前端项目
"""
import subprocess
import sys
from pathlib import Path
import shutil
import json

# 默认 nginx 基础目录（与 deploy.py 保持一致）
DEFAULT_NGINX_BASE_DIR = "/home/xubuntu001/AI/nginx"

def cleanup_deployment(project_id, nginx_base_dir=None):
    """
    清理指定部署

    Args:
        project_id: 项目 ID
        nginx_base_dir: nginx 基础目录，默认为 DEFAULT_NGINX_BASE_DIR
    """
    if nginx_base_dir is None:
        nginx_base_dir = Path(DEFAULT_NGINX_BASE_DIR)
    else:
        nginx_base_dir = Path(nginx_base_dir)

    deployments_dir = nginx_base_dir / "deployments"
    info_file = deployments_dir / f"{project_id}.json"

    if not info_file.exists():
        print(f"❌ 项目不存在: {project_id}")
        return False

    try:
        with open(info_file) as f:
            info = json.load(f)

        # 删除 HTML 目录
        html_dir = Path(info['html_dir'])
        if html_dir.exists():
            print(f"删除 HTML 目录: {html_dir}")
            shutil.rmtree(html_dir)

        # 删除 nginx 配置文件
        conf_file = Path(info['conf_file'])
        if conf_file.exists():
            print(f"删除配置文件: {conf_file}")
            conf_file.unlink()

        # 重新加载 nginx
        print("重新加载 nginx 配置...")
        subprocess.run(
            ["docker", "exec", "nginx-web", "nginx", "-s", "reload"],
            check=True
        )

        # 删除部署信息文件
        info_file.unlink()

        print(f"✅ 清理完成: {project_id}")
        return True

    except Exception as e:
        print(f"❌ 清理失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def list_deployments(nginx_base_dir=None):
    """列出所有部署"""
    if nginx_base_dir is None:
        nginx_base_dir = Path(DEFAULT_NGINX_BASE_DIR)
    else:
        nginx_base_dir = Path(nginx_base_dir)

    deployments_dir = nginx_base_dir / "deployments"

    if not deployments_dir.exists() or not list(deployments_dir.glob("*.json")):
        print("没有找到部署")
        return

    print("\n当前部署:")
    print("-" * 80)

    for info_file in sorted(deployments_dir.glob("*.json")):
        with open(info_file) as f:
            info = json.load(f)

        print(f"项目 ID: {info['project_id']}")
        print(f"  部署时间: {info.get('deployed_at', 'N/A')}")
        print(f"  访问地址: {info['url']}")
        print(f"  HTML 目录: {info['html_dir']}")
        print()

def cleanup_all(nginx_base_dir=None):
    """清理所有部署"""
    if nginx_base_dir is None:
        nginx_base_dir = Path(DEFAULT_NGINX_BASE_DIR)
    else:
        nginx_base_dir = Path(nginx_base_dir)

    deployments_dir = nginx_base_dir / "deployments"

    if not deployments_dir.exists():
        print("没有找到部署")
        return

    for info_file in deployments_dir.glob("*.json"):
        project_id = info_file.stem
        print(f"\n清理项目: {project_id}")
        cleanup_deployment(project_id, nginx_base_dir)

def main():
    if len(sys.argv) < 2:
        print("用法:")
        print(f"  默认 nginx 目录: {DEFAULT_NGINX_BASE_DIR}")
        print("  列出所有部署: python cleanup.py list [nginx基础目录]")
        print("  清理指定项目: python cleanup.py <project_id> [nginx基础目录]")
        print("  清理所有项目: python cleanup.py all [nginx基础目录]")
        sys.exit(1)

    command = sys.argv[1]
    nginx_base_dir = sys.argv[2] if len(sys.argv) > 2 else None

    if command == "list":
        list_deployments(nginx_base_dir)
    elif command == "all":
        cleanup_all(nginx_base_dir)
    else:
        cleanup_deployment(command, nginx_base_dir)

if __name__ == "__main__":
    main()
