---
name: html-deploy
description: 将 HTML 内容部署为可访问的网页。使用场景：(1) 用户要求将生成的 HTML/网页部署上线或发布，(2) 用户要求更新已部署的页面内容，(3) 用户提到"部署"、"发布"、"上线"HTML 页面，(4) 用户要求预览生成的网页效果。
---

# HTML Deploy

将 HTML 内容部署到远程服务，生成可访问的 URL。

## 使用流程

1. 根据用户需求生成完整的 HTML 页面，写入文件
2. 调用脚本部署或更新，传入该文件路径
3. 将返回的访问 URL 告知用户

### 部署新页面

```bash
python3 skills/html-deploy/scripts/deploy.py <html_file>
```

### 更新已有页面

从之前的部署 URL 中提取 page_id（UUID 部分）：

```bash
python3 skills/html-deploy/scripts/update.py <page_id> <html_file>
```

page_id 不存在时会报 404 错误。
