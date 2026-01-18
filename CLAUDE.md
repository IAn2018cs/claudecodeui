# Claude Code UI

跨平台桌面和移动 Web UI，用于与 Claude Code CLI 交互。

## 技术栈

### 前端
- React 18 - UI 框架
- Vite 7 - 构建工具和开发服务器
- Tailwind CSS 3.4 - 样式框架
- CodeMirror 6 - 代码编辑器
- xterm.js 5.5 - Web 终端仿真
- react-markdown - Markdown 渲染

### 后端
- Node.js 20+ - 运行环境
- Express 4 - Web 服务器框架
- WebSocket (ws) - 实时双向通信
- SQLite 3 (better-sqlite3) - 本地数据库
- node-pty - 伪终端支持
- Chokidar - 文件系统监视

## 项目结构

```
/src                    # React 前端源代码
├── components/         # React 组件
│   ├── settings/       # 设置子组件
│   └── ui/             # 可复用 UI 组件
├── contexts/           # React Context (Auth, Theme, WebSocket)
├── hooks/              # 自定义 Hooks
├── utils/              # 工具函数
└── App.jsx             # 主应用组件

/server                 # Node.js 后端
├── index.js            # Express 服务器入口
├── cli.js              # CLI 命令入口
├── claude-sdk.js       # Claude SDK 集成
├── database/           # SQLite 数据库
├── middleware/         # Express 中间件
├── routes/             # API 路由
└── utils/              # 服务器工具

/public                 # 静态资源
/shared                 # 前后端共享代码
```

## 开发命令

```bash
npm run dev      # 开发模式（React 热重载 + Node 服务器）
npm run server   # 仅启动服务器
npm run client   # 仅启动 Vite dev 服务器
npm run build    # 生产构建
npm run preview  # 预览生产构建
npm run start    # 构建 + 启动服务器
```

## 重要文件

- `src/App.jsx` - 主应用组件，包含路由和全局状态
- `src/components/ChatInterface.jsx` - 聊天界面核心组件
- `src/components/Shell.jsx` - 集成终端组件
- `src/components/FileTree.jsx` - 文件浏览器组件
- `src/components/Settings.jsx` - 设置面板
- `src/contexts/WebSocketContext.jsx` - WebSocket 连接管理
- `server/index.js` - Express 服务器入口
- `server/claude-sdk.js` - Claude SDK 集成
- `server/routes/` - 所有 API 路由

## 代码规范

- 组件使用函数式组件和 React Hooks
- 样式使用 Tailwind CSS 实用类
- 使用 ES6+ 语法
- 文件命名使用 PascalCase (组件) 或 camelCase (工具函数)

## 核心功能

1. **会话管理** - 自动发现和管理 Claude Code 会话
2. **实时通信** - WebSocket 连接用于聊天和项目更新
3. **文件浏览** - 交互式文件树和代码编辑
4. **Shell 终端** - 集成的 Claude Code CLI 终端
5. **MCP 服务器** - 支持添加自定义 MCP 服务器
