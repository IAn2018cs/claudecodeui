# 多用户模式设计方案

## 概述

将 Claude Code UI 从单用户模式改造为支持多用户使用的模式。核心思路是利用 `CLAUDE_CONFIG_DIR` 环境变量为每个用户隔离 Claude 配置和项目空间。

## 目录结构

```
data/
├── user-data/                              # 用户 Claude 配置
│   └── {user-uuid}/
│       ├── .claude/
│       │   └── settings.json               # 从 ~/.claude/settings.json 拷贝
│       └── .claude.json                    # Claude 自动生成，需监听并修改
│
└── user-projects/                          # 用户项目空间
    └── {user-uuid}/
        ├── ProjectA/
        └── ProjectB/
```

### 初始化流程

**用户注册时**：
1. 生成用户 UUID
2. 创建 `data/user-data/{uuid}/.claude/` 目录
3. 拷贝 `~/.claude/settings.json` 到用户目录（若存在）
4. 创建 `data/user-projects/{uuid}/` 目录
5. 启动文件监听器，等待 `.claude.json` 创建

**`.claude.json` 监听处理**：
- 当 Claude 首次运行自动创建 `.claude.json` 后
- 读取文件，设置 `hasCompletedOnboarding: true`
- 写回文件

### 环境变量注入

启动 Claude 进程时，设置：
```bash
CLAUDE_CONFIG_DIR=data/user-data/{user-uuid}
```

## 数据库 Schema 变更

### 用户表扩展

```sql
ALTER TABLE users ADD COLUMN uuid TEXT UNIQUE;             -- 用户唯一标识，用于目录命名
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';     -- 'admin' 或 'user'
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'; -- 'active' 或 'disabled'
ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
```

### 角色判定逻辑

```javascript
// 注册时判断是否为首个用户
const isFirstUser = await db.get('SELECT COUNT(*) as count FROM users').count === 0;
const role = isFirstUser ? 'admin' : 'user';
```

### 用户状态检查

- 登录时检查 `status`，`disabled` 用户拒绝登录
- 删除用户时同时清理用户目录

### 数据迁移策略

全新开始，不迁移现有数据：
- 升级时清空 `users` 表
- 删除旧的 `data/` 目录内容（如有）

## API 接口变更

### 认证接口调整

**注册接口 `POST /api/auth/register`**：
- 移除"只允许一个用户"的限制
- 新增：生成 UUID、判定角色、创建用户目录、拷贝配置

```javascript
// 响应增加字段
{
  token: "...",
  user: {
    id, username, uuid, role  // 新增 uuid 和 role
  }
}
```

**登录接口 `POST /api/auth/login`**：
- 新增：检查用户状态是否为 `disabled`
- 响应包含 `uuid` 和 `role`

### 新增管理员接口

```
GET    /api/admin/users          # 获取用户列表（分页）
PATCH  /api/admin/users/:id      # 更新用户状态 { status: 'active' | 'disabled' }
DELETE /api/admin/users/:id      # 删除用户（同时清理目录）
```

所有 `/api/admin/*` 接口需要中间件校验 `role === 'admin'`。

### 项目接口调整

**`GET /api/projects`**：
- 所有用户（包括管理员）：只返回 `data/user-projects/{自己的uuid}/` 下的项目

**`POST /api/projects`**：
- 项目创建在 `data/user-projects/{当前用户uuid}/` 下

**`DELETE /api/projects/:name`**：
- 只能删除自己的项目

## 前端界面变更

### 用户信息展示

- 显示当前登录用户名
- 管理员用户显示角色标识

### 管理员面板

在 Settings 中新增 **用户管理** 标签页（仅管理员可见）：

```
┌─────────────────────────────────────────────────┐
│ 用户管理                                         │
├─────────────────────────────────────────────────┤
│ 用户名        角色      状态      操作           │
│ ─────────────────────────────────────────────── │
│ admin_user   管理员    活跃      -              │
│ user_a       普通用户  活跃      [禁用] [删除]   │
│ user_b       普通用户  已禁用    [启用] [删除]   │
└─────────────────────────────────────────────────┘
```

**功能**：
- 用户列表展示（用户名、角色、状态、创建时间）
- 禁用/启用切换按钮
- 删除按钮（带确认弹窗，提示将删除用户所有数据）
- 不能对自己执行禁用/删除操作

### 权限控制

- 前端根据 `user.role` 控制管理员标签页的显示/隐藏
- 路由守卫：非管理员访问管理页面时重定向

## Claude 进程集成

### 环境变量注入

```javascript
const userConfigDir = path.join(process.cwd(), 'data/user-data', user.uuid);

spawn('claude', args, {
  env: {
    ...process.env,
    CLAUDE_CONFIG_DIR: userConfigDir
  },
  cwd: projectPath  // data/user-projects/{uuid}/{projectName}
});
```

### .claude.json 监听服务

新增 `server/services/user-config-watcher.js`：

```javascript
function watchUserConfig(userUuid) {
  const configPath = path.join(DATA_DIR, 'user-data', userUuid, '.claude.json');

  const watcher = chokidar.watch(configPath, { ignoreInitial: false });

  watcher.on('add', async (filePath) => {
    const config = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (!config.hasCompletedOnboarding) {
      config.hasCompletedOnboarding = true;
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
    }
    watcher.close();
  });
}
```

### 服务启动时恢复监听

服务器重启时，检查所有用户的 `.claude.json` 是否已设置，未设置的重新启动监听。

## 边界情况与错误处理

### 用户删除清理

删除用户时需清理：
1. 数据库中的用户记录
2. `data/user-data/{uuid}/` 整个目录
3. `data/user-projects/{uuid}/` 整个目录
4. 停止该用户的 `.claude.json` 监听器（如有）
5. 终止该用户正在运行的 Claude 进程（如有）

### 禁用用户处理

- 拒绝新的登录请求
- 已登录会话：JWT 验证时检查用户状态，`disabled` 返回 401
- 正在运行的 Claude 进程：保持运行直到自然结束

### 配置文件缺失

若 `~/.claude/settings.json` 不存在：
- 创建空的 `.claude/` 目录
- 不拷贝配置，让 Claude 使用默认配置

## API Key 管理

服务器统一配置 API Key，所有用户共享，用户无需自己配置。
