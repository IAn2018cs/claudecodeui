#!/bin/bash

# Claude Code UI - PM2 管理脚本
# 用法: ./pm2.sh [start|stop|restart|logs|status]

APP_NAME="agenthub"
# 当前工作目录（用于读取 .env 和存储数据）
WORK_DIR="$(pwd)"
ENV_FILE="$WORK_DIR/.env"

# 查找 agenthub 全局安装路径
find_agenthub_path() {
    # 方法1: 通过 npm root -g 查找
    local npm_global_root
    npm_global_root="$(npm root -g 2>/dev/null)"
    if [ -n "$npm_global_root" ]; then
        local pkg_path="$npm_global_root/@ian2018cs/agenthub"
        if [ -d "$pkg_path" ] && [ -f "$pkg_path/server/index.js" ]; then
            echo "$pkg_path"
            return 0
        fi
    fi

    # 方法2: 通过 which agenthub 解析符号链接
    local bin_path
    bin_path="$(which agenthub 2>/dev/null)"
    if [ -n "$bin_path" ]; then
        # 解析符号链接获取真实路径
        local real_path
        real_path="$(readlink -f "$bin_path" 2>/dev/null || realpath "$bin_path" 2>/dev/null)"
        if [ -n "$real_path" ]; then
            # bin 文件在 server/cli.js，向上两级是包根目录
            local pkg_path="$(dirname "$(dirname "$real_path")")"
            if [ -f "$pkg_path/server/index.js" ]; then
                echo "$pkg_path"
                return 0
            fi
        fi
    fi

    # 方法3: 检查脚本所在目录（开发模式）
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$script_dir/server/index.js" ]; then
        echo "$script_dir"
        return 0
    fi

    return 1
}

# 获取 agenthub 安装路径
AGENTHUB_PATH="$(find_agenthub_path)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查 pm2 是否安装
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        error "pm2 未安装，请先安装: npm install -g pm2"
        exit 1
    fi
}

# 检查 agenthub 是否安装
check_agenthub() {
    if [ -z "$AGENTHUB_PATH" ]; then
        error "未找到 agenthub 安装路径"
        echo ""
        echo "请确保已全局安装 agenthub:"
        echo "  npm install -g @ian2018cs/agenthub"
        echo ""
        echo "或在开发模式下将此脚本放在项目根目录运行"
        exit 1
    fi
    info "agenthub 路径: $AGENTHUB_PATH"
}

# 加载 .env 文件并导出环境变量
load_env() {
    if [ -f "$ENV_FILE" ]; then
        info "加载环境变量: $ENV_FILE"
        # 读取 .env 文件，忽略注释和空行
        while IFS= read -r line || [ -n "$line" ]; do
            # 跳过空行和注释
            if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
                continue
            fi
            # 提取 key=value
            if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
                key="${BASH_REMATCH[1]}"
                value="${BASH_REMATCH[2]}"
                # 移除值两端的引号
                value="${value%\"}"
                value="${value#\"}"
                value="${value%\'}"
                value="${value#\'}"
                export "$key=$value"
            fi
        done < "$ENV_FILE"
        success "环境变量加载完成"
    else
        warn ".env 文件不存在: $ENV_FILE"
        warn "将使用默认配置"
    fi
}

# 生成 pm2 ecosystem 配置
generate_ecosystem() {
    load_env

    # 构建环境变量 JSON
    ENV_JSON="{"
    ENV_JSON+="\"PORT\": \"${PORT:-3001}\","
    ENV_JSON+="\"DATA_DIR\": \"${DATA_DIR:-$WORK_DIR/data}\","

    [ -n "$DATABASE_PATH" ] && ENV_JSON+="\"DATABASE_PATH\": \"$DATABASE_PATH\","
    [ -n "$CLAUDE_CLI_PATH" ] && ENV_JSON+="\"CLAUDE_CLI_PATH\": \"$CLAUDE_CLI_PATH\","
    [ -n "$CONTEXT_WINDOW" ] && ENV_JSON+="\"CONTEXT_WINDOW\": \"$CONTEXT_WINDOW\","
    [ -n "$ANTHROPIC_AUTH_TOKEN" ] && ENV_JSON+="\"ANTHROPIC_AUTH_TOKEN\": \"$ANTHROPIC_AUTH_TOKEN\","
    [ -n "$ANTHROPIC_BASE_URL" ] && ENV_JSON+="\"ANTHROPIC_BASE_URL\": \"$ANTHROPIC_BASE_URL\","

    # 移除最后一个逗号并闭合
    ENV_JSON="${ENV_JSON%,}}"

    cat > "$WORK_DIR/ecosystem.config.cjs" << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: '$AGENTHUB_PATH/server/index.js',
    cwd: '$AGENTHUB_PATH',
    env: $ENV_JSON,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '$WORK_DIR/logs/error.log',
    out_file: '$WORK_DIR/logs/out.log',
    merge_logs: true
  }]
};
EOF

    # 确保 logs 目录存在
    mkdir -p "$WORK_DIR/logs"

    success "PM2 配置已生成: $WORK_DIR/ecosystem.config.cjs"
}

# 启动服务
start() {
    check_pm2
    check_agenthub
    generate_ecosystem

    info "启动 $APP_NAME..."
    pm2 start "$WORK_DIR/ecosystem.config.cjs"

    if [ $? -eq 0 ]; then
        success "$APP_NAME 启动成功"
        echo ""
        pm2 show "$APP_NAME"
        echo ""
        info "访问地址: http://localhost:${PORT:-3001}"
        info "查看日志: ./pm2.sh logs"
    else
        error "启动失败"
        exit 1
    fi
}

# 停止服务
stop() {
    check_pm2
    info "停止 $APP_NAME..."
    pm2 stop "$APP_NAME" 2>/dev/null
    pm2 delete "$APP_NAME" 2>/dev/null
    success "$APP_NAME 已停止"
}

# 重启服务
restart() {
    check_pm2
    check_agenthub

    # 检查是否在运行
    if pm2 list | grep -q "$APP_NAME"; then
        info "重启 $APP_NAME..."
        generate_ecosystem
        pm2 restart "$WORK_DIR/ecosystem.config.cjs"
        success "$APP_NAME 已重启"
    else
        warn "$APP_NAME 未在运行，执行启动..."
        start
    fi
}

# 查看日志
logs() {
    check_pm2
    info "查看 $APP_NAME 日志 (Ctrl+C 退出)"
    pm2 logs "$APP_NAME" --lines 100
}

# 查看状态
status() {
    check_pm2
    info "$APP_NAME 状态:"
    echo ""
    pm2 show "$APP_NAME" 2>/dev/null || warn "$APP_NAME 未在运行"
}

# 显示帮助
show_help() {
    echo ""
    echo "Claude Code UI - PM2 管理脚本"
    echo ""
    echo "用法: ./pm2.sh [命令]"
    echo ""
    echo "命令:"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  logs      查看日志"
    echo "  status    查看状态"
    echo "  help      显示帮助"
    echo ""
    echo "示例:"
    echo "  ./pm2.sh start    # 启动服务"
    echo "  ./pm2.sh logs     # 查看日志"
    echo "  ./pm2.sh restart  # 重启服务"
    echo ""
}

# 主入口
case "${1:-help}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "未知命令: $1"
        show_help
        exit 1
        ;;
esac
