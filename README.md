# Claude CLI Provider

将 Claude Code CLI 包装为 HTTP API，支持 OpenAI 兼容模式和 Agent 模式。

## 特性

### OpenAI 兼容模式
- ✅ **OpenAI 兼容 API** - 兼容 `/v1/chat/completions` 接口
- ✅ **真流式输出** - 使用 Claude CLI 的原生流式功能
- ✅ **简单易用** - 标准化请求格式，兼容 OpenAI SDK

### Agent 模式 (新增!)
- ✅ **完整工具调用** - 支持 Bash, Edit, Read, Write 等所有工具
- ✅ **自动会话管理** - 多轮对话上下文自动维护
- ✅ **实时事件流** - SSE (Server-Sent Events) 流式响应
- ✅ **工具调用检测** - 自动检测和报告工具调用

### 通用特性
- ✅ **API Key 认证** - 生产环境安全保护
- ✅ **多部署方式** - 支持 Docker 和 PM2 部署
- ✅ **环境变量配置** - 灵活的配置管理
- ✅ **健康检查** - 内置监控端点

## 快速开始

### 1. 安装依赖

```bash
cd /path/to/claude-cli-provider
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，设置 API_KEY（生产环境必需）
```

### 3. 启动服务器

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

输出：
```
[INFO] ✅ Claude CLI Provider Server running
[INFO]    URL: http://0.0.0.0:3912
[INFO]    Health: http://0.0.0.0:3912/health
[INFO]    Environment: development
[INFO]    Using: claude
[INFO]    API Authentication: enabled
```

### 4. 测试 API

#### OpenAI 兼容模式 (简单问答)

```bash
# 健康检查
curl http://localhost:3912/health

# 聊天测试（流式输出）
curl -X POST http://localhost:3912/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"你好！"}]}'

# 查看可用模型
curl http://localhost:3912/v1/models \
  -H "Authorization: Bearer your-api-key"
```

#### Agent 模式 (工具调用和会话管理)

```bash
# 发送消息（支持工具调用）
curl -X POST http://localhost:3912/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "content": "创建一个 test.txt 文件",
    "options": {
      "model": "sonnet",
      "allowedTools": ["Bash", "Write", "Read"]
    }
  }'

# 列出所有会话
curl http://localhost:3912/v1/agent/sessions

# 获取会话详情
curl http://localhost:3912/v1/agent/sessions/<session-id>

# 删除会话
curl -X DELETE http://localhost:3912/v1/agent/sessions/<session-id>

# Agent 模式健康检查
curl http://localhost:3912/v1/agent/health
```

**详细文档:**
- [Agent 模式使用指南](./docs/agent-mode-guide.md) - Agent 模式完整文档
- [混合模式设计文档](./docs/design/hybrid-mode-design.md) - 架构设计说明

## 项目结构

```
claude-cli-provider/
├── server.js              # HTTP 服务器核心
├── package.json           # 依赖配置
├── .env.example           # 环境变量示例
├── Dockerfile             # Docker 镜像定义
├── docker-compose.yml     # Docker Compose 配置
├── ecosystem.config.cjs   # PM2 配置
├── nginx.conf.example     # Nginx 反向代理示例
├── docs/                  # 项目文档
│   ├── README.md          # 文档导航和索引
│   ├── guides/            # 使用指南（部署指南等）
│   ├── architecture/      # 架构文档
│   ├── development/       # 开发文档
│   ├── references/        # 技术参考
│   ├── reports/           # 项目报告
│   └── archive/           # 归档文档
├── DEPLOYMENT.md          # 部署指南（已迁移到 docs/guides/）
└── README.md              # 本文档
```

> 📖 **完整文档**: 查看 [docs/README.md](docs/README.md) 获取完整的项目文档索引。

## API 端点

### POST /v1/chat/completions

OpenAI 兼容的聊天完成接口，默认使用流式输出。

**请求示例：**
```json
{
  "model": "sonnet",
  "messages": [
    { "role": "user", "content": "你好！请介绍一下自己。" }
  ],
  "stream": true
}
```

**参数说明：**
- `model` (string, 必需) - 模型名称：`sonnet` | `opus` | `haiku`
- `messages` (array, 必需) - 对话消息数组
- `stream` (boolean, 可选) - 是否使用流式输出，默认 `true`

**流式响应示例：**
```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk",...}
data: [DONE]
```

**非流式响应示例：**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-sonnet",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "你好！我是 Claude，由 Anthropic 创建的 AI 助手。"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### GET /health

健康检查端点，无需认证。

**响应示例：**
```json
{
  "status": "ok",
  "service": "claude-cli-provider",
  "version": "1.0.0",
  "claude_bin": "claude",
  "auth_enabled": true
}
```

### GET /v1/models

列出可用模型。

**响应示例：**
```json
{
  "object": "list",
  "data": [
    { "id": "sonnet", "name": "Claude Sonnet (via CLI)" },
    { "id": "opus", "name": "Claude Opus (via CLI)" },
    { "id": "haiku", "name": "Claude Haiku (via CLI)" }
  ]
}
```

## 环境变量配置

| 变量 | 说明 | 默认值 | 生产环境建议 |
|------|------|--------|-------------|
| `PORT` | 服务监听端口 | `3912` | `3912` |
| `HOST` | 绑定地址 | `0.0.0.0` | `0.0.0.0` |
| `CLAUDE_BIN` | Claude CLI 路径 | `claude` | `claude` |
| `API_KEY` | API 认证密钥 | 空 | **必须设置强密钥** |
| `LOG_LEVEL` | 日志级别 | `info` | `info` |
| `NODE_ENV` | 运行环境 | `development` | `production` |

### 生成安全的 API Key

```bash
# 使用 OpenSSL
openssl rand -hex 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 部署

### PM2 部署

```bash
# 启动
npm run pm2:start

# 查看状态
npm run pm2:monit

# 查看日志
npm run pm2:logs

# 重启
npm run pm2:restart

# 停止
npm run pm2:stop
```

### Docker 部署

```bash
# 构建镜像
npm run docker:build

# 启动容器
API_KEY="your-secret-key" npm run docker:up

# 查看日志
npm run docker:logs

# 停止容器
npm run docker:down
```

详细部署指南请参考 [docs/guides/deployment-guide.md](docs/guides/deployment-guide.md)。

## 支持的模型

- **sonnet** - Claude Sonnet 4.5（推荐，平衡性能和速度）
- **opus** - Claude Opus 4.5（最强性能）
- **haiku** - Claude Haiku 4（最快速度）

## 技术实现

### 真流式输出

使用 Claude CLI 的原生流式功能：

```bash
claude -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose
```

实时处理并转发每个数据块，而非等待完整响应后分块发送。

### API 认证

支持两种认证方式：

1. **Authorization Header**：
   ```
   Authorization: Bearer your-api-key
   ```

2. **X-API-Key Header**：
   ```
   X-API-Key: your-api-key
   ```

开发环境（未设置 `API_KEY`）会跳过认证。

## 故障排查

### claude: command not found

确保 Claude CLI 已全局安装：

```bash
which claude
npm install -g @anthropic-ai/claude-code
```

### Port 3912 already in use

修改端口或停止占用进程：

```bash
# 查找占用进程
lsof -i :3912

# 或修改端口
PORT=3913 npm start
```

### API 返回 401 错误

检查 API Key 配置：

```bash
# 确认 API_KEY 已设置
echo $API_KEY

# 测试请求
curl -X POST http://localhost:3912/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"test"}]}'
```

### Docker 容器启动失败

```bash
# 查看日志
docker-compose logs

# 重新构建
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 安全建议

1. **生产环境必须设置 API_KEY** - 保护 API 访问
2. **使用 HTTPS** - 通过 Nginx 配置 SSL
3. **限制访问来源** - 配置防火墙规则
4. **定期更新依赖** - 保持安全性
5. **日志脱敏** - 避免记录敏感内容

## 注意事项

1. **会话管理** - 当前版本不支持多轮对话上下文
2. **工具调用** - 已禁用 Claude CLI 的工具功能
3. **性能** - 每次请求启动新的 Claude CLI 进程

## License

MIT
