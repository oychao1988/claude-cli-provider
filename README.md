# Claude CLI Provider

将全局安装的 `claude` CLI 包装为 OpenClaw 可用的 HTTP Provider。

## 快速开始

### 1. 安装依赖

```bash
cd ~/Documents/Projects/claude-cli-provider
npm install
```

### 2. 启动服务器

```bash
npm start
```

输出：
```
✅ Claude CLI Provider Server running
   URL: http://127.0.0.1:3912
   Health: http://127.0.0.1:3912/health
   Using: claude
```

### 3. 测试

```bash
# 健康检查
curl http://127.0.0.1:3912/health

# 聊天测试
bash test.sh
```

### 4. 配置 OpenClaw

编辑 `~/.openclaw/openclaw.json`，添加：

```json5
{
  "models": {
    "providers": {
      "claude-cli": {
        "baseUrl": "http://127.0.0.1:3912/v1",
        "api": "openai-completions",
        "apiKey": "dummy",
        "models": [
          {
            "id": "sonnet",
            "name": "Claude Sonnet (CLI)",
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "claude-cli/sonnet" }
    }
  }
}
```

### 5. 在 OpenClaw 中使用

```bash
# 设置为默认模型
openclaw models set claude-cli/sonnet

# 测试发送消息
openclaw message send --channel telegram "Hello via Claude CLI!"
```

## 项目结构

```
claude-cli-provider/
├── server.js      # HTTP 服务器核心
├── package.json   # 依赖配置
├── DESIGN.md      # 设计文档
├── README.md      # 本文档
└── test.sh        # 测试脚本
```

## API 端点

### POST /v1/chat/completions

OpenAI 兼容的聊天完成接口。

**请求：**
```json
{
  "model": "sonnet",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}
```

**响应：**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-sonnet",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 9,
    "total_tokens": 19
  }
}
```

### GET /health

健康检查端点。

**响应：**
```json
{
  "status": "ok",
  "service": "claude-cli-provider",
  "version": "1.0.0-mvp",
  "claude_bin": "claude"
}
```

### GET /v1/models

列出可用模型。

**响应：**
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

## 支持的模型

- `sonnet` - Claude Sonnet 4.5（默认）
- `opus` - Claude Opus 4.5
- `haiku` - Claude Haiku 4

## 注意事项

1. **本地运行**：服务器仅绑定 `127.0.0.1`，不接受外部请求
2. **会话**：当前版本不支持多轮对话上下文
3. **工具**：已禁用 claude CLI 的工具调用功能
4. **性能**：每次请求都会启动新的 claude CLI 进程

## 故障排查

### claude: command not found

确保 claude CLI 已全局安装：

```bash
which claude
# 应该输出: /usr/local/bin/claude 或类似路径
```

### Port 3912 already in use

修改端口：

```bash
PORT=3913 node server.js
```

### OpenClaw 无法连接

1. 检查服务器是否运行：`curl http://127.0.0.1:3912/health`
2. 检查 OpenClaw 配置中的 baseUrl 是否正确
3. 查看 OpenClaw 日志：`tail -f ~/.openclaw/logs/gateway.log`

## 后续优化

- [ ] 支持流式输出（SSE）
- [ ] 支持多轮对话（会话管理）
- [ ] 进程池复用（性能优化）
- [ ] 支持图片输入
- [ ] Docker 部署
- [ ] 系统服务（launchd/systemd）

## License

MIT
