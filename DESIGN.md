# Claude CLI Provider 设计文档

## 项目概述

将全局安装的 `claude` CLI 包装为 OpenClaw 可用的 Provider，通过 HTTP API 实现。

## 目标

- ✅ 零侵入：不修改 OpenClaw 源代码
- ✅ 简单：最小化实现，快速验证可行性
- ✅ 可用：支持基本的聊天功能

## 架构设计

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  OpenClaw   │────────▶│ HTTP Server  │────────▶│ Claude CLI  │
│  (Gateway)  │         │  (本项目)    │         │  (全局安装) │
└─────────────┘         └──────────────┘         └─────────────┘
                               │
                               ▼
                         OpenAI Compatible API
                         /v1/chat/completions
```

## 实现步骤

### Phase 1: 最小可行实现 (MVP)

**文件结构：**
```
claude-cli-provider/
├── server.js          # HTTP 服务器（核心）
├── package.json       # 依赖配置
├── DESIGN.md          # 本文档
├── README.md          # 使用说明
└── test.sh            # 快速测试脚本
```

**核心功能：**
1. 启动 HTTP 服务器监听 `127.0.0.1:3912`
2. 接收 OpenAI 格式的 `/v1/chat/completions` 请求
3. 调用 `claude -p --output-format json` 命令
4. 解析 JSON 输出，提取 assistant 回复
5. 返回 OpenAI 格式的响应

**API 端点：**
- `POST /v1/chat/completions` - 聊天完成（OpenAI 兼容）
- `GET /health` - 健康检查

### Phase 2: 增强功能（后续）

- [ ] 支持流式输出（SSE）
- [ ] 支持多轮对话（会话管理）
- [ ] 支持图片输入
- [ ] 支持工具调用
- [ ] 错误处理优化
- [ ] 日志和监控

## 技术细节

### 请求格式（OpenAI 兼容）

```json
{
  "model": "sonnet",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}
```

### 响应格式（OpenAI 兼容）

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

### Claude CLI 命令

```bash
echo "用户的问题" | claude -p \
  --model sonnet \
  --output-format json \
  --no-session-persistence \
  --tools "" \
  --dangerously-skip-permissions
```

### JSON 输出解析

Claude CLI 输出 JSON 数组，每个元素是一个事件：

```json
[
  {"type": "system", "subtype": "init", ...},
  {"type": "assistant", "message": {"content": [{"type": "text", "text": "回复内容"}]}},
  {"type": "result", "subtype": "success", ...}
]
```

提取 `assistant.message.content` 中所有 `type === "text"` 的内容。

## OpenClaw 配置

在 `~/.openclaw/openclaw.json` 中添加：

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

## 验证步骤

1. 启动服务器：`node server.js`
2. 健康检查：`curl http://127.0.0.1:3912/health`
3. 测试聊天：`bash test.sh`
4. 配置 OpenClaw
5. 在 OpenClaw 中使用

## 依赖项

- Node.js (>=18)
- 全局安装的 `claude` CLI
- npm 包：`express`

## 注意事项

1. **安全性**：服务器仅绑定 `127.0.0.1`，不接受外部请求
2. **性能**：每次请求都会启动新的 claude CLI 进程
3. **会话**：当前版本不支持多轮对话上下文
4. **工具**：已禁用 claude CLI 的工具调用功能

## 后续优化方向

1. 使用进程池复用 claude CLI 进程
2. 添加缓存机制减少重复调用
3. 支持会话历史管理
4. 添加 Prometheus 指标
5. Docker 化部署
