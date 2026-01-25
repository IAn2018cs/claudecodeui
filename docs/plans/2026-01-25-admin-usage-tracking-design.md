# Admin Usage Tracking Design

## Overview

为管理员用户增加用户用量统计功能，包括 token 用量、花费金额、模型分布、会话数量等。

## Requirements

| 维度 | 决定 |
|------|------|
| 统计粒度 | 用户总用量 + 日/周/月汇总 |
| 数据采集 | Hook 机制（SDK + CLI 统一） |
| Hook 配置 | 用户创建时自动配置 |
| 数据上报 | Hook 写入本地文件 |
| 扫描频率 | 每 5 分钟 |
| 日志保留 | 30 天 |
| 价格计算 | 后端硬编码价格表 |
| 前端展示 | 用户列表 + 独立仪表盘 |

## Database Design

### usage_records 表（原始记录）

```sql
CREATE TABLE usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  session_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  source TEXT DEFAULT 'sdk',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_records_user_uuid ON usage_records(user_uuid);
CREATE INDEX idx_usage_records_created_at ON usage_records(created_at);
```

### usage_daily_summary 表（日汇总）

```sql
CREATE TABLE usage_daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  date TEXT NOT NULL,
  model TEXT NOT NULL,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  UNIQUE(user_uuid, date, model)
);

CREATE INDEX idx_usage_daily_summary_user_date ON usage_daily_summary(user_uuid, date);
```

## Hook Configuration

### Hook 日志文件

每个用户的 Hook 将用量数据写入：
```
data/user-data/{uuid}/.claude/usage.jsonl
```

每行一条 JSON 记录：
```json
{"ts":1706180400,"model":"sonnet","in":1500,"out":800,"cache_read":500,"cache_create":0,"session":"abc123"}
```

### settings.json 中的 Hook 配置

```json
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "usage tracking hook command"
          }
        ]
      }
    ]
  }
}
```

## Backend Services

### Pricing Table

```javascript
const PRICING = {
  'claude-sonnet-4-20250514': {
    input: 3.00 / 1_000_000,
    output: 15.00 / 1_000_000,
    cacheRead: 0.30 / 1_000_000,
    cacheCreate: 3.75 / 1_000_000
  },
  'claude-opus-4-20250514': {
    input: 15.00 / 1_000_000,
    output: 75.00 / 1_000_000,
    cacheRead: 1.50 / 1_000_000,
    cacheCreate: 18.75 / 1_000_000
  },
  'claude-haiku-3-5-20241022': {
    input: 0.80 / 1_000_000,
    output: 4.00 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
    cacheCreate: 1.00 / 1_000_000
  }
};
```

### Usage Scanner Service

每 5 分钟执行：
1. 遍历 `data/user-data/*/.claude/usage.jsonl`
2. 解析新增记录（记录上次扫描位置）
3. 计算花费，写入 `usage_records`
4. 更新 `usage_daily_summary`
5. 清理 30 天前的 `usage_records`

## API Design

```
GET /api/admin/usage/summary          # 所有用户用量概览
GET /api/admin/usage/users/:uuid      # 单个用户详细统计
GET /api/admin/usage/dashboard        # 全局统计仪表盘数据
```

## Frontend Components

### 用户列表增强
- 用户表格新增「花费」列
- 悬停或点击可展开查看近 7 天趋势

### 独立仪表盘页面
- 路由: `/admin/usage`
- 组件: `src/components/UsageDashboard.jsx`
- 包含: 总花费卡片、日趋势图、模型分布图、用户排行榜

## Implementation Tasks

1. 数据库迁移：添加两张表
2. 价格表模块
3. Hook 配置：修改用户初始化
4. 用量扫描服务
5. 启动时注册定时任务
6. 用量 API 路由
7. 用户列表增加花费列
8. 用量仪表盘页面
9. 路由配置
