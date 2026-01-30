---
name: deploy-frontend
description: 将生成的 HTML 或前端页面部署到 Docker nginx 容器。用于快速部署和预览前端项目，自动配置端口隔离，返回可访问的内网 URL。使用场景：(1) 部署刚生成的 HTML/React/Vue 等前端项目 (2) 需要让用户通过浏览器查看前端页面 (3) 需要为不同项目分配独立的访问端口 (4) 清理或列出已部署的项目
---

# Deploy Frontend

将前端项目部署到共享的 nginx Docker 容器，通过不同端口和配置文件实现项目隔离。

## 快速开始

```bash
# 1. 确保你有一个包含 index.html 的目录
mkdir my-project
echo "<h1>Hello World</h1>" > my-project/index.html

# 2. 使用 python3 部署（注意：是目录，不是文件）
python3 /path/to/deploy-frontend/scripts/deploy.py my-project

# 3. 访问输出的 URL，例如 http://10.0.1.133:8080
```

## 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `python: command not found` | 使用了 `python` 而不是 `python3` | 使用 `python3` 命令 |
| `NotADirectoryError` | 传入了单个文件而不是目录 | 传入包含 index.html 的目录路径 |
| `404 Not Found` | 主文件不叫 index.html | 将主 HTML 文件重命名为 index.html |
| 本地能访问，其他设备不能 | IP 地址或网络问题 | 使用内网 IP，检查防火墙 |

## 配置

默认 nginx 目录已配置为：`/home/xubuntu001/AI/nginx`

如需修改，编辑脚本文件中的 `DEFAULT_NGINX_BASE_DIR` 变量：
- `scripts/deploy.py` 第 14 行
- `scripts/cleanup.py` 第 10 行

## 工作原理

- **单容器架构**：所有项目共享一个 nginx 容器（节省资源）
- **配置隔离**：每个项目在 `config/conf.d/` 下有独立的 `.conf` 文件
- **端口隔离**：自动分配不同端口（从 8080 开始递增）
- **目录隔离**：每个项目的文件存放在 `html/project-{timestamp}/`

## 部署前端项目

使用 `scripts/deploy.py` 部署项目：

```bash
python3 scripts/deploy.py <前端项目目录>
```

**重要说明：**
- 必须使用 `python3` 命令（不是 `python`）
- `<前端项目目录>`：必须是一个**目录**（不能是单个文件）
- 目录中必须包含 `index.html` 作为入口文件（nginx 默认查找 index.html）
- 如果你的 HTML 文件不叫 `index.html`，需要先重命名

**参数说明：**
- `<前端项目目录>`：包含 index.html 等前端文件的目录（必需）

默认使用 `/home/xubuntu001/AI/nginx` 作为 nginx 基础目录，无需额外指定。

**脚本执行流程：**
1. 生成唯一的项目 ID（project-{timestamp}）
2. 查找可用端口（从 8080 开始）
3. 复制前端文件到 `html/{project_id}/`
4. 在 `config/conf.d/` 创建 nginx 配置文件
5. 重新加载 nginx（如果容器未运行则启动）
6. 返回访问 URL（内网IP:端口）
7. 保存部署信息到 `deployments/{project_id}.json`

**示例：**
```bash
# 部署前端项目（使用默认 nginx 目录）
python3 .claude/skills/deploy-frontend/scripts/deploy.py ./my-frontend-app

# 错误示例 - 不要这样做：
# python3 deploy.py ./my-app/index.html  ❌ 不能传单个文件
# python deploy.py ./my-app              ❌ 必须使用 python3

# 正确示例：
# python3 deploy.py ./my-app             ✅ 传目录，使用 python3
```

**输出示例：**
```
✅ 部署成功!
项目 ID: project-1738151234
端口: 8080
访问地址: http://192.168.1.100:8080
HTML 目录: /path/to/nginx/html/project-1738151234
配置文件: /path/to/nginx/config/conf.d/project-1738151234.conf
```

## 管理部署

使用 `scripts/cleanup.py` 管理已部署的项目。

### 列出所有部署

```bash
python3 scripts/cleanup.py list
```

### 清理指定项目

```bash
python3 scripts/cleanup.py <project_id>
```

会删除：
- HTML 目录
- nginx 配置文件
- 部署信息文件

并重新加载 nginx 配置。

### 清理所有项目

```bash
python3 scripts/cleanup.py all
```

## 目录结构

部署后的 nginx 基础目录结构：

```
nginx-base/
├── docker-compose.yml          # nginx 容器配置
├── html/                       # 前端文件
│   ├── project-1738151234/    # 项目1
│   │   ├── index.html
│   │   └── ...
│   └── project-1738151456/    # 项目2
│       ├── index.html
│       └── ...
├── config/
│   └── conf.d/                # nginx 配置
│       ├── project-1738151234.conf
│       └── project-1738151456.conf
├── logs/                      # nginx 日志
└── deployments/               # 部署信息
    ├── project-1738151234.json
    └── project-1738151456.json
```

## 使用流程

### 典型工作流

1. **生成前端代码**：创建 HTML/React/Vue 项目
2. **调用部署脚本**：
   ```python
   from pathlib import Path
   import subprocess

   result = subprocess.run([
       "python3",  # 必须使用 python3
       str(Path.home() / ".claude/skills/deploy-frontend/scripts/deploy.py"),
       "./frontend-output"  # 必须是目录，不能是单个文件
   ], capture_output=True, text=True)

   print(result.stdout)
   ```
3. **提取访问 URL**：从输出中获取 URL 返回给用户
4. **提醒用户访问**：告知用户可以通过浏览器访问该 URL

### 在对话中使用

当用户要求生成前端页面时：

1. 生成前端代码（HTML/CSS/JS 等）
2. 将文件写入目录（确保主文件命名为 index.html）
3. 调用 deploy.py 部署
4. 将访问 URL 返回给用户

示例代码模式：
```python
# 1. 创建输出目录
output_dir = Path("/tmp/frontend-{timestamp}")
output_dir.mkdir(parents=True, exist_ok=True)

# 2. 写入前端文件（重要：主文件必须命名为 index.html）
(output_dir / "index.html").write_text(html_content)  # ✅ 使用 index.html
(output_dir / "style.css").write_text(css_content)

# 3. 部署（使用 python3，传目录而不是文件）
deploy_script = Path.home() / ".claude/skills/deploy-frontend/scripts/deploy.py"
result = subprocess.run(
    ["python3", str(deploy_script), str(output_dir)],  # ✅ python3 + 目录路径
    capture_output=True,
    text=True
)

# 4. 提取 URL（从输出中解析）
for line in result.stdout.split('\n'):
    if line.startswith('访问地址:'):
        url = line.split(':', 1)[1].strip()
        print(f"您的前端页面已部署: {url}")
```

## 前置要求

- Docker 和 docker-compose 已安装
- nginx 基础目录位于 `/home/xubuntu001/AI/nginx`
- docker-compose.yml 使用 `network_mode: host`
- Python 3.6+

## Docker 权限处理

脚本已内置自动权限处理机制：

1. **自动检测权限**：脚本会首先尝试直接运行 docker 命令
2. **自动降级处理**：如果遇到权限错误，会自动使用 `sg docker -c` 运行
3. **无需手动干预**：用户无需关心是否在 docker 组中

**注意**：如果您刚刚被添加到 docker 组，可能需要重新登录或使用以下命令激活组权限：
```bash
newgrp docker
```

## 更新日志

### v1.2 (2026-01-30)
- ✅ 更新文档：明确必须使用 `python3` 而不是 `python`
- ✅ 更新文档：强调必须传入目录而不是单个文件
- ✅ 更新文档：说明主文件必须命名为 `index.html`
- ✅ 添加常见错误示例和最佳实践
- ✅ 新增部署后文件重命名的故障排查说明

### v1.1 (2026-01-30)
- ✅ 修复正则表达式转义警告
- ✅ 添加自动 Docker 权限处理（`run_docker_command` 函数）
- ✅ 使用 `docker compose` 替代旧版 `docker-compose` 命令
- ✅ deploy.py 和 cleanup.py 都支持自动权限处理

### v1.0
- 初始版本：支持多项目部署和端口隔离

## 故障排查

**容器未启动**：脚本会自动执行 `docker compose up -d`

**端口冲突**：脚本会自动查找可用端口（8080-8179 范围）

**权限问题**：脚本会自动使用 `sg docker -c` 处理权限问题

**找不到 python 命令**：
```bash
# 错误：python: command not found
# 解决：使用 python3
python3 scripts/deploy.py ./my-app
```

**传入单个文件报错**：
```bash
# 错误：NotADirectoryError
# 原因：传入的是文件而不是目录
# 解决：传入包含 index.html 的目录
python3 scripts/deploy.py ./my-app/  # 正确
# 而不是
python3 scripts/deploy.py ./my-app/index.html  # 错误
```

**页面无法访问（404 Not Found）**：
```bash
# 检查是否存在 index.html
ls /home/xubuntu001/AI/nginx/html/project-*/

# 如果文件名不是 index.html，重命名它：
cd /home/xubuntu001/AI/nginx/html/project-xxxxxxxxxx/
mv yourfile.html index.html

# 重新加载 nginx
sg docker -c "docker exec nginx-web nginx -s reload"
```

**配置未生效**：手动重新加载 nginx：
```bash
docker exec nginx-web nginx -s reload
# 或如果有权限问题：
sg docker -c "docker exec nginx-web nginx -s reload"
```

**查看 nginx 日志**：
```bash
docker logs nginx-web
```

**本地能访问，其他设备访问不了**：
- 检查防火墙设置
- 确认设备在同一网络
- 使用正确的内网 IP（不要用 localhost）
- 确认路由器没有阻止端口
