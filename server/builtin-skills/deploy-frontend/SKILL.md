---
name: deploy-frontend
description: 将生成的 HTML 或前端页面部署到 Docker nginx 容器。用于快速部署和预览前端项目，自动配置端口隔离，返回可访问的内网 URL。使用场景：(1) 部署刚生成的 HTML/React/Vue 等前端项目 (2) 需要让用户通过浏览器查看前端页面 (3) 需要为不同项目分配独立的访问端口 (4) 清理或列出已部署的项目
---

# Deploy Frontend

将前端项目部署到共享的 nginx Docker 容器，通过不同端口和配置文件实现项目隔离。

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
python scripts/deploy.py <前端项目目录>
```

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
python .claude/skills/deploy-frontend/scripts/deploy.py ./my-frontend-app
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
python scripts/cleanup.py list
```

### 清理指定项目

```bash
python scripts/cleanup.py <project_id>
```

会删除：
- HTML 目录
- nginx 配置文件
- 部署信息文件

并重新加载 nginx 配置。

### 清理所有项目

```bash
python scripts/cleanup.py all
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
       "python",
       str(Path.home() / ".claude/skills/deploy-frontend/scripts/deploy.py"),
       "./frontend-output"
   ], capture_output=True, text=True)

   print(result.stdout)
   ```
3. **提取访问 URL**：从输出中获取 URL 返回给用户
4. **提醒用户访问**：告知用户可以通过浏览器访问该 URL

### 在对话中使用

当用户要求生成前端页面时：

1. 生成前端代码（HTML/CSS/JS 等）
2. 将文件写入临时目录
3. 调用 deploy.py 部署
4. 将访问 URL 返回给用户

示例代码模式：
```python
# 1. 创建输出目录
output_dir = Path("/tmp/frontend-{timestamp}")
output_dir.mkdir(parents=True, exist_ok=True)

# 2. 写入前端文件
(output_dir / "index.html").write_text(html_content)
(output_dir / "style.css").write_text(css_content)

# 3. 部署
deploy_script = Path.home() / ".claude/skills/deploy-frontend/scripts/deploy.py"
result = subprocess.run(
    ["python", str(deploy_script), str(output_dir)],
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

## 故障排查

**容器未启动**：脚本会自动执行 `docker-compose up -d`

**端口冲突**：脚本会自动查找可用端口（8080-8179 范围）

**配置未生效**：手动重新加载 nginx：
```bash
docker exec nginx-web nginx -s reload
```

**查看 nginx 日志**：
```bash
docker logs nginx-web
```
