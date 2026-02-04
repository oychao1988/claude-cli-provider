# 系统架构设计 - Claude CLI Provider

> **版本**: 2.0.0
> **创建日期**: 2026-02-05
> **状态**: 已完成
> **适用对象**: 架构师、开发者

本文档描述 Claude CLI Provider 的系统架构设计，包括模块职责、数据流和部署架构。

---

## 目录

1. [架构概览](#架构概览)
2. [模块设计](#模块设计)
3. [数据流](#数据流)
4. [部署架构](#部署架构)
5. [扩展性设计](#扩展性设计)

---

## 架构概览

### 系统层次结构

```
┌───────────────────────────────────────────────────────────┐
│                      HTTP Client Layer                    │
│                  (cURL, Postman, SDKs)                    │
└───────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                  Express HTTP Server                       │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Authentication Middleware (API Key)                │  │
│  └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Route Handlers                                      │  │
│  │  - /v1/chat/completions (OpenAI compatible)        │  │
│  │  - /v1/agent/chat (Agent mode)                      │  │
│  │  - /v1/agent/sessions (Session management)          │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                   Adapter Layer                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  CLIAdapter (OpenAI Mode)                           │  │
│  │  - ProcessPool management                           │  │
│  │  - Stream processing                                │  │
│  │  - Response formatting                              │  │
│  └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  PTYAdapter (Agent Mode)                            │  │
│  │  - PTY process management                           │  │
│  │  - Session management                               │  │
│  │  - Screen parsing                                   │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                   Processing Layer                         │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │ MessageFormatter │  │   ResponseTransformer        │  │
│  │ - CLI format     │  │   - OpenAI format            │  │
│  │ - Validation     │  │   - Agent events             │  │
│  └──────────────────┘  └──────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  SessionManager                                      │  │
│  │  - Session lifecycle                                 │  │
│  │  - Cleanup                                           │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│              Claude CLI (Subprocess)                       │
│  - AI processing (Sonnet, Haiku, Opus)                    │
│  - Tool invocation (Bash, Read, Write)                    │
│  - Streaming output                                       │
└───────────────────────────────────────────────────────────┘
```

### 技术栈

| 组件 | 技术 | 版本 | 用途 |
|------|------|------|------|
| HTTP Server | Node.js | >= 18.0.0 | 运行环境 |
| Web Framework | Express | ^4.18.2 | HTTP 服务 |
| PTY | node-pty | ^1.1.0 | 伪终端 |
| Process ID | uuid | ^13.0.0 | 唯一标识符 |
| CLI | @anthropic-ai/claude-code | latest | AI 能力 |

---

## 模块设计

### 1. HTTP Server Layer (`server.js`)

**职责**:
- 启动 Express 服务器
- 配置中间件
- 路由注册
- 优雅关闭

**关键功能**:
```javascript
// Health check
app.get('/health', ...)

// Metrics endpoint
app.get('/metrics', ...)

// Route registration
app.use('/v1', openaiRoutes);
app.use('/v1/agent', agentRoutes);
```

### 2. OpenAI Routes (`routes/openai.js`)

**职责**:
- 实现 OpenAI 兼容 API
- 请求验证
- 认证中间件
- 流式响应处理

**API 端点**:
- `POST /v1/chat/completions` - 聊天完成接口

**请求流程**:
```
1. Authentication (API Key)
2. Validate request (messages array)
3. Create CLIAdapter instance
4. Process request
5. Stream response or return complete response
6. Record metrics
```

### 3. Agent Routes (`routes/agent.js`)

**职责**:
- 实现 Agent 模式 API
- 会话管理
- PTY 进程管理
- SSE 事件流

**API 端点**:
- `POST /v1/agent/chat` - 发送消息
- `GET /v1/agent/sessions` - 列出会话
- `GET /v1/agent/sessions/:id` - 获取会话详情
- `DELETE /v1/agent/sessions/:id` - 删除会话

**事件类型**:
- `session` - 会话创建
- `content` - 内容片段
- `tool_use` - 工具调用
- `done` - 完成

### 4. CLI Adapter (`lib/adapters/cli-adapter.js`)

**职责**:
- 管理 CLI 进程池
- 处理 OpenAI 模式请求
- 流式输出处理
- 响应转换

**核心方法**:
```javascript
class CLIAdapter {
  async processRequest({ messages, model, stream })
  async _spawnProcess(args)
  async _readStream(process, stream)
}
```

### 5. PTY Adapter (`lib/adapters/pty-adapter.js`)

**职责**:
- 管理 PTY 进程池
- 处理 Agent 模式请求
- 屏幕解析
- 会话管理

**核心方法**:
```javascript
class PTYAdapter {
  async sendMessage(content, sessionId, options)
  async _createPTYProcess(sessionId)
  async _parseScreenOutput(screen)
}
```

### 6. Message Formatter (`lib/formatters/message-formatter.js`)

**职责**:
- 格式化消息为 CLI 格式
- 验证消息结构
- 提取系统提示词
- 去除 UI 元素

**方法**:
```javascript
formatForCLI(messages)  // OpenAI → CLI
formatForPTY(content)   // User content → PTY
stripUIElements(output) // Remove TUI artifacts
validateMessages(messages)
```

### 7. Response Transformer (`lib/formatters/response-transformer.js`)

**职责**:
- 转换 CLI 输出为 OpenAI 格式
- 创建 SSE 事件
- 解析 JSON 流
- 计算令牌数

**方法**:
```javascript
toOpenAIFormat(chunk, streaming)
toAgentEvents(content)
parseJSONOutput(output)
```

### 8. Session Manager (`lib/claude/session-manager.js`)

**职责**:
- 管理会话生命周期
- PTY 进程关联
- 消息历史
- 自动清理

**数据结构**:
```javascript
Session {
  id: string,
  createdAt: Date,
  lastActivity: Date,
  status: 'active' | 'idle' | 'error',
  ptyProcess: object,
  messages: Array,
  currentScreen: string,
  lastScreen: string
}
```

### 9. Process Manager (`lib/claude/process-manager.js`)

**职责**:
- 管理进程池
- 限制并发数量
- 进程回收
- 资源管理

**配置**:
```javascript
{
  claudeBin: 'claude',
  maxProcesses: 10,      // CLI processes
  maxPTYProcesses: 5,    // PTY processes
  processTimeout: 120000 // 2 minutes
}
```

---

## 数据流

### OpenAI Mode - 非流式

```
Client                  Server                  CLI Process
  │                       │                          │
  ├─ POST /v1/chat       │                          │
  │  completions ────────►│                          │
  │                       │                          │
  │                       ├─ Validate messages       │
  │                       ├─ Format for CLI          │
  │                       │                          │
  │                       ├─ Spawn process ────────►│
  │                       │                          ├─ Process with Claude
  │                       │                          │
  │                       │◄─ JSON output ───────────┤
  │                       │                          │
  │                       ├─ Transform to OpenAI     │
  │                       │                          │
  │◄─ JSON response ──────┤                          │
  │                       │                          │
  │◄─ Close ──────────────┤                          │
```

### OpenAI Mode - 流式

```
Client                  Server                  CLI Process
  │                       │                          │
  ├─ POST /v1/chat       │                          │
  │  completions          │                          │
  │  stream=true ────────►│                          │
  │                       │                          │
  │                       ├─ Validate & format       │
  │                       │                          │
  │                       ├─ Spawn process ────────►│
  │                       │                          ├─ Stream processing
  │                       │                          │
  │◄─ data: {} ───────────┤◄─ stream-json ──────────┤
  │◄─ data: {} ───────────┤                          │
  │◄─ data: {} ───────────┤                          │
  │                       │                          │
  │◄─ data: [DONE] ───────┤◄─ Process exit ─────────┤
  │                       │                          │
```

### Agent Mode

```
Client                  Server                  PTY Process
  │                       │                          │
  ├─ POST /v1/agent      │                          │
  │  chat ───────────────►│                          │
  │                       │                          │
  │                       ├─ Create/get session      │
  │                       ├─ Format content          │
  │                       │                          │
  │◄─ event: session ────┤                          │
  │                       │                          │
  │                       ├─ Write to PTY ─────────►│
  │                       │                          ├─ Interactive Claude
  │                       │                          │
  │◄─ event: content ────┤◄─ Screen output ─────────┤
  │◄─ event: content ────┤                          │
  │                       │                          │
  │◄─ event: tool_use ───┤◄─ Tool detection ────────┤
  │                       │                          │
  │◄─ event: done ───────┤◄─ Completion ────────────┤
  │                       │                          │
```

---

## 部署架构

### 开发环境

```
┌────────────────────────────┐
│  Developer Machine         │
│                            │
│  ┌──────────────────────┐ │
│  │ Node.js Server       │ │
│  │ - Port: 3912         │ │
│  │ - Auto-reload        │ │
│  │ - Debug logging      │ │
│  └──────────────────────┘ │
│                            │
│  ┌──────────────────────┐ │
│  │ Claude CLI           │ │
│  │ - Global install     │ │
│  └──────────────────────┘ │
└────────────────────────────┘
```

### 生产环境 - PM2

```
┌──────────────────────────────────────┐
│  Production Server                   │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Nginx (Port 80/443)            │ │
│  │ - SSL termination              │ │
│  │ - Reverse proxy                │ │
│  │ - Static files                 │ │
│  └────────────────────────────────┘ │
│              │                       │
│              ▼                       │
│  ┌────────────────────────────────┐ │
│  │ PM2 Process Manager            │ │
│  │ - Cluster mode (optional)      │ │
│  │ - Auto-restart                 │ │
│  │ - Log management               │ │
│  └────────────────────────────────┘ │
│              │                       │
│              ▼                       │
│  ┌────────────────────────────────┐ │
│  │ Node.js App (Port 3912)        │ │
│  │ - API Key authentication       │ │
│  │ - Process pools                │ │
│  │ - Metrics collection           │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Claude CLI Subprocesses        │ │
│  │ - Managed pools                │ │
│  │ - Auto cleanup                 │ │
│  └────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### 生产环境 - Docker

```
┌──────────────────────────────────────┐
│  Docker Host                         │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Docker Network                 │ │
│  │                                │ │
│  │  ┌──────────────────────────┐ │ │
│  │  │ Container                │ │ │
│  │  │ - Node.js App            │ │ │
│  │  │ - Claude CLI             │ │ │
│  │  │ - Port 3912              │ │ │
│  │  └──────────────────────────┘ │ │
│  │                                │ │
│  └────────────────────────────────┘ │
│                                      │
│  Volume mounts:                      │
│  - ./logs → /app/logs                │
│  - /home/user/.claude → /root/.claude│
└──────────────────────────────────────┘
```

---

## 扩展性设计

### 水平扩展

**当前限制**:
- 进程池在单机内管理
- 会话状态在内存中

**扩展方案**:
1. **负载均衡**: 使用 Nginx 或 HAProxy
2. **会话共享**: Redis 存储会话状态
3. **无状态设计**: 每个请求独立处理

### 垂直扩展

**优化方向**:
1. **增加进程池大小**: 根据 CPU 核心数
2. **集群模式**: PM2 cluster mode
3. **缓存**: Redis 缓存常见请求

### 插件化

**可扩展点**:
1. **Adapter 接口**: 支持新的适配器
2. **Formatter**: 自定义消息格式
3. **Middleware**: Express 中间件

---

## 性能考虑

### 进程池管理

```javascript
// OpenAI Mode
MAX_PROCESSES = 10
  - Each process handles one request
  - Processes are reused from pool
  - Excess processes are terminated

// Agent Mode
MAX_PTY_PROCESSES = 5
  - Each session has one PTY process
  - PTY processes are long-lived
  - Idle sessions are cleaned up
```

### 内存管理

1. **会话清理**: 每 5 分钟清理过期会话
2. **响应缓存**: 不缓存（实时生成）
3. **日志轮转**: PM2 自动轮转

### 并发处理

```
Request → Queue → Process Pool → CLI → Response

Queue depth: 50 requests
Concurrency: Limited by process pool size
Timeout: 120 seconds
```

---

## 安全架构

### 认证层

```
Client Request
    │
    ▼
API Key Check (Optional)
    │
    ├─ Valid → Proceed
    └─ Invalid → 401 Error
```

### 输入验证

```javascript
// Messages validation
- Must be array
- Must have at least one message
- Must have user message
- Fields validated

// Options validation
- Model name checked
- Stream flag boolean
- Max tokens limited
```

### 进程隔离

```
Each CLI Process:
- Separate subprocess
- Isolated environment
- Timeout protection
- Auto cleanup on error
```

---

## 监控和可观测性

### 指标收集

```javascript
{
  requestCount: 0,
  totalResponseTime: 0,
  errorCount: 0,
  processPoolUsage: 0,
  percentiles: {
    p50, p90, p95, p99
  }
}
```

### 日志级别

```
DEBUG - Detailed request/response info
INFO  - Request lifecycle events
WARN  - Performance issues
ERROR - Failures and exceptions
```

### 健康检查

```
GET /health
→ Status, version, Claude binary path
→ Used by load balancers
→ Monitored by orchestration
```

---

## 相关文档

- [API 指南](../guides/api-guide.md)
- [部署指南](../guides/deployment-guide.md)
- [Agent 模式指南](../guides/agent-mode-guide.md)
- [设计文档](../design/hybrid-mode-design.md)

---

**返回**: [架构文档首页](./README.md)
