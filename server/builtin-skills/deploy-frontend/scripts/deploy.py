#!/usr/bin/env python3
"""
部署前端项目到共享的 nginx 容器（通过 conf.d 配置隔离）
"""
import os
import sys
import subprocess
import socket
from pathlib import Path
import shutil
import json
import time

# 默认 nginx 基础目录（可在这里修改）
DEFAULT_NGINX_BASE_DIR = "/home/xubuntu001/AI/nginx"

def find_available_port(start_port=8080, max_attempts=100):
    """查找可用端口"""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                return port
        except OSError:
            continue
    raise RuntimeError(f"无法在 {start_port}-{start_port + max_attempts} 范围内找到可用端口")

def get_local_ip():
    """获取本机内网 IP"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"

def generate_project_id():
    """生成项目 ID"""
    return f"project-{int(time.time())}"

def create_nginx_conf(project_id, port, nginx_base_dir):
    """创建项目的 nginx 配置文件"""
    config_content = f"""server {{
    listen {port};
    server_name localhost;

    root /usr/share/nginx/html/{project_id};
    index index.html index.htm;

    location / {{
        try_files $uri $uri/ /index.html;
    }}

    # 启用 gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;

    # 缓存静态资源
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {{
        expires 1y;
        add_header Cache-Control "public, immutable";
    }}
}}
"""
    conf_dir = nginx_base_dir / "config" / "conf.d"
    conf_dir.mkdir(parents=True, exist_ok=True)

    conf_file = conf_dir / f"{project_id}.conf"
    conf_file.write_text(config_content)
    return conf_file

def reload_nginx(nginx_base_dir):
    """重新加载 nginx 配置"""
    compose_file = nginx_base_dir / "docker-compose.yml"
    if not compose_file.exists():
        raise RuntimeError(f"docker-compose.yml 不存在: {compose_file}")

    # 检查容器是否运行
    result = subprocess.run(
        ["docker", "ps", "--filter", "name=nginx-web", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        cwd=nginx_base_dir
    )

    if "nginx-web" not in result.stdout:
        # 容器未运行，启动它
        print("启动 nginx 容器...")
        subprocess.run(
            ["docker-compose", "up", "-d"],
            cwd=nginx_base_dir,
            check=True
        )
    else:
        # 重新加载配置
        print("重新加载 nginx 配置...")
        subprocess.run(
            ["docker", "exec", "nginx-web", "nginx", "-s", "reload"],
            check=True
        )

def deploy_frontend(source_dir, nginx_base_dir=None):
    """
    部署前端项目

    Args:
        source_dir: 源代码目录路径
        nginx_base_dir: nginx docker-compose 所在目录，默认为 DEFAULT_NGINX_BASE_DIR

    Returns:
        dict: 包含部署信息的字典
    """
    source_path = Path(source_dir).resolve()
    if not source_path.exists():
        raise ValueError(f"源目录不存在: {source_dir}")

    # 设置 nginx 基础目录
    if nginx_base_dir is None:
        nginx_base_dir = Path(DEFAULT_NGINX_BASE_DIR)
    else:
        nginx_base_dir = Path(nginx_base_dir).resolve()

    # 生成项目信息
    project_id = generate_project_id()

    # 查找可用端口
    port = find_available_port()

    # 复制前端文件到 html/project-id/
    html_dir = nginx_base_dir / "html" / project_id
    if html_dir.exists():
        shutil.rmtree(html_dir)
    shutil.copytree(source_path, html_dir)

    # 创建 nginx 配置
    conf_file = create_nginx_conf(project_id, port, nginx_base_dir)

    # 重新加载 nginx
    reload_nginx(nginx_base_dir)

    # 获取访问 URL
    local_ip = get_local_ip()
    url = f"http://{local_ip}:{port}"

    # 保存部署信息到部署目录
    deployments_dir = nginx_base_dir / "deployments"
    deployments_dir.mkdir(exist_ok=True)

    deploy_info = {
        "project_id": project_id,
        "port": port,
        "url": url,
        "html_dir": str(html_dir),
        "conf_file": str(conf_file),
        "source_dir": str(source_path),
        "deployed_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    info_file = deployments_dir / f"{project_id}.json"
    info_file.write_text(json.dumps(deploy_info, indent=2, ensure_ascii=False))

    return deploy_info

def main():
    if len(sys.argv) < 2:
        print("用法: python deploy.py <前端项目目录> [nginx基础目录]")
        print(f"默认 nginx 目录: {DEFAULT_NGINX_BASE_DIR}")
        print("示例: python deploy.py ./my-app")
        sys.exit(1)

    source_dir = sys.argv[1]
    nginx_base_dir = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        info = deploy_frontend(source_dir, nginx_base_dir)
        print(f"\n✅ 部署成功!")
        print(f"项目 ID: {info['project_id']}")
        print(f"端口: {info['port']}")
        print(f"访问地址: {info['url']}")
        print(f"HTML 目录: {info['html_dir']}")
        print(f"配置文件: {info['conf_file']}")
    except Exception as e:
        print(f"\n❌ 部署失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
