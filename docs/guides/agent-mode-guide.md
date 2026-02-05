# Agent 模式使用指南

> **版本**: 1.0.0
> **创建日期**: 2026-02-05
> **状态**: ✅ 已实施
> **适用对象**: 用户、开发者
> **最后更新**: 2026-02-05

---

## 概述

Agent 模式提供了完整的 Claude CLI 功能,包括工具调用、会话管理和流式响应。与 OpenAI 兼容模式相比,Agent 模式更适合复杂的交互场景。

## 主要特性

- ✅ **完整的工具调用支持** - Bash, Edit, Read, Write 等所有工具
- ✅ **自动会话管理** - 多轮对话上下文自动维护
- ✅ **实时事件流** - SSE (Server-Sent Events) 流式响应
- ✅ **工具调用检测** - 自动检测和报告工具调用
- ✅ **会话持久化** - 支持会话恢复和查询

## API 端点

### 1. 发送消息 - POST /v1/agent/chat

发送消息到 Claude 并获取流式响应。

**请求格式:**

```bash
curl -X POST http://localhost:3912/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "content": "请帮我创建一个简单的 HTTP 服务器",
    "session_id": null,
    "options": {
      "model": "sonnet",
      "allowedTools": ["Bash", "Write", "Read", "Edit"],
      "workingDirectory": "/path/to/project"
    }
  }'
```

**请求参数:**

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `content` | string | ✅ | 用户消息内容 |
| `session_id` | string | ❌ | 会话 ID,不提供则创建新会话 |
| `options` | object | ❌ | 会话选项 |
| `options.model` | string | ❌ | 模型名称 (默认: sonnet) |
| `options.allowedTools` | array | ❌ | 允许的工具列表 |
| `options.workingDirectory` | string | ❌ | 工作目录 (默认: 当前目录) |

**响应格式 (SSE 流):**

```
event: session
data: {"session_id":"550e8400-e29b-41d4-a716-446655440000"}

event: content
data: {"content":"好的,我来帮您创建","timestamp":"2026-02-05T01:00:00.000Z"}

event: tool_call
data: {"tool":"Write","input":{"file_path":"server.js","content":"..."},"timestamp":"2026-02-05T01:00:01.000Z"}

event: content
data: {"content":"我已经创建了 HTTP 服务器文件","timestamp":"2026-02-05T01:00:02.000Z"}

event: done
data: {"status":"stable","timestamp":"2026-02-05T01:00:03.000Z"}
```

**事件类型:**

| 事件 | 描述 |
|------|------|
| `session` | 会话创建事件,包含 session_id |
| `content` | 内容增量事件,包含新增的文本 |
| `tool_call` | 工具调用事件,包含工具名和参数 |
| `done` | 完成事件,表示响应结束 |
| `error` | 错误事件,包含错误信息 |

**客户端示例 (JavaScript):**

```javascript
const response = await fetch('http://localhost:3912/v1/agent/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: '创建一个 test.txt 文件',
    options: {
      model: 'sonnet',
      allowedTools: ['Bash', 'Write']
    }
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      const event = line.slice(7);
      continue;
    }
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log('Event:', event, 'Data:', data);
    }
  }
}
```

### 2. 列出会话 - GET /v1/agent/sessions

获取所有活动会话列表。

**请求:**

```bash
curl http://localhost:3912/v1/agent/sessions
```

**响应:**

```json
{
  "sessions": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2026-02-05T01:00:00.000Z",
      "last_activity": "2026-02-05T01:05:00.000Z",
      "message_count": 15,
      "status": "ready",
      "model": "sonnet",
      "has_pty_process": true
    }
  ]
}
```

### 3. 获取会话详情 - GET /v1/agent/sessions/:id

获取特定会话的详细信息和消息历史。

**请求:**

```bash
curl http://localhost:3912/v1/agent/sessions/550e8400-e29b-41d4-a716-446655440000
```

**响应:**

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-02-05T01:00:00.000Z",
  "last_activity": "2026-02-05T01:05:00.000Z",
  "status": "ready",
  "message_count": 15,
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "创建一个 HTTP 服务器",
      "timestamp": "2026-02-05T01:00:00.000Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "好的,我来帮您创建...",
      "timestamp": "2026-02-05T01:00:01.000Z",
      "tool_calls": [
        {
          "tool": "Write",
          "input": {"file_path": "server.js"},
          "output": "文件已创建"
        }
      ]
    }
  ],
  "options": {
    "model": "sonnet",
    "allowedTools": ["Bash", "Write", "Read"],
    "workingDirectory": "/path/to/project"
  },
  "has_pty_process": true,
  "process_id": "proc_1234567890_abc123"
}
```

### 4. 删除会话 - DELETE /v1/agent/sessions/:id

删除会话并清理相关资源。

**请求:**

```bash
curl -X DELETE http://localhost:3912/v1/agent/sessions/550e8400-e29b-41d4-a716-446655440000
```

**响应:**

```json
{
  "ok": true,
  "message": "Session deleted"
}
```

### 5. 健康检查 - GET /v1/agent/health

检查 Agent 模式的健康状态。

**请求:**

```bash
curl http://localhost:3912/v1/agent/health
```

**响应:**

```json
{
  "status": "ok",
  "service": "agent-mode",
  "adapter": "pty",
  "healthy": true,
  "processes": {
    "cliProcesses": 0,
    "ptyProcesses": 2,
    "total": 2,
    "limit": 5
  },
  "sessions": {
    "total": 2,
    "active": 1,
    "initializing": 0,
    "with_pty": 2,
    "total_messages": 25
  }
}
```

## 使用场景

### 场景 1: 代码生成和文件操作

```bash
curl -X POST http://localhost:3912/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "content": "创建一个 Express 服务器,监听 3000 端口,返回 Hello World",
    "options": {
      "allowedTools": ["Write", "Read", "Bash"],
      "workingDirectory": "/myproject"
    }
  }'
```

### 场景 2: 持续对话

```bash
# 第一次请求
RESPONSE1=$(curl -X POST http://localhost:3912/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"content": "创建一个 package.json 文件"}')

# 提取 session_id
SESSION_ID=$(echo $RESPONSE1 | jq -r '.session_id')

# 第二次请求,使用同一个 session
curl -X POST http://localhost:3912/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"添加 express 依赖\",
    \"session_id\": \"$SESSION_ID\"
  }"
```

### 场景 3: 执行命令和脚本

```bash
curl -X POST http://localhost:3912/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "content": "运行 npm install 并查看结果",
    "options": {
      "allowedTools": ["Bash", "Read"],
      "workingDirectory": "/myproject"
    }
  }'
```

## 工具调用

Agent 模式支持完整的 Claude CLI 工具:

| 工具 | 描述 | 示例 |
|------|------|------|
| `Bash` | 执行 shell 命令 | `ls -la`, `npm install` |
| `Read` | 读取文件内容 | `读取 package.json` |
| `Write` | 创建或写入文件 | `创建 server.js` |
| `Edit` | 编辑文件 | `修改端口为 8080` |
| `Glob` | 文件匹配 | `查找所有 .js 文件` |
| `Grep` | 内容搜索 | `搜索 console.log` |

**工具调用事件示例:**

```
event: tool_call
data: {
  "tool": "Bash",
  "input": "ls -la",
  "timestamp": "2026-02-05T01:00:00.000Z"
}
```

## 会话管理

### 会话生命周期

1. **创建** - 首次请求时自动创建
2. **初始化** - 启动 PTY 进程
3. **就绪** - 等待用户输入
4. **处理中** - 正在生成响应
5. **稳定** - 响应完成,等待新输入
6. **删除** - 手动删除或超时清理

### 会话超时

- 默认超时时间: 24 小时
- 超时会话每小时自动清理
- 可通过环境变量配置

### 最佳实践

1. **复用会话** - 多轮对话使用同一 session_id
2. **限制工具** - 生产环境限制危险工具 (Bash, Write, Edit)
3. **监控资源** - 定期检查 `/v1/agent/health`
4. **清理会话** - 完成任务后及时删除

## 错误处理

### 错误响应格式

```json
{
  "error": {
    "message": "Session not found",
    "type": "not_found_error"
  }
}
```

### 常见错误

| 错误类型 | 描述 | 解决方案 |
|---------|------|----------|
| `invalid_request_error` | 请求参数无效 | 检查 content 是否为空 |
| `not_found_error` | 会话不存在 | 检查 session_id 或创建新会话 |
| `agent_error` | Agent 执行错误 | 查看日志获取详细信息 |
| `server_error` | 服务器内部错误 | 联系管理员或查看日志 |

## 性能优化

### 1. 会话池管理

```javascript
// 限制并发会话数
const MAX_SESSIONS = 5;
```

### 2. 工具限制

```javascript
// 只允许必要的工具
{
  "allowedTools": ["Read", "Glob", "Grep"]  // 只读工具
}
```

### 3. 工作目录

```javascript
// 指定工作目录,避免路径问题
{
  "workingDirectory": "/path/to/safe/directory"
}
```

## 安全建议

### 1. 生产环境配置

```bash
# 设置 API Key
export API_KEY=your-secret-key

# 限制危险工具
export ALLOW_DANGEROUS_TOOLS=false

# 限制会话数量
export MAX_PTY_PROCESSES=3
```

### 2. 网络隔离

- 使用反向代理 (Nginx)
- 启用 HTTPS
- 配置防火墙规则

### 3. 资源限制

- 限制工作目录范围
- 设置超时时间
- 监控内存使用

## 故障排查

### 问题 1: 会话创建失败

**症状:** 请求返回错误

**检查:**
```bash
# 检查 node-pty 是否安装
npm list node-pty

# 检查 Claude CLI 是否可用
claude --version
```

**解决:**
```bash
# 重新安装 node-pty
npm rebuild node-pty

# 或使用预编译版本
npm install node-pty --build-from-source
```

### 问题 2: 响应超时

**症状:** 长时间无响应

**检查:**
```bash
# 检查会话状态
curl http://localhost:3912/v1/agent/sessions/<session_id>
```

**解决:**
- 检查 Claude CLI 是否正常运行
- 查看服务器日志
- 增加超时时间

### 问题 3: 内存泄漏

**症状:** 内存持续增长

**解决:**
```bash
# 定期清理过期会话
curl -X DELETE http://localhost:3912/v1/agent/sessions/<old-session-id>

# 重启服务
pm2 restart claude-cli-provider
```

## 对比: OpenAI 模式 vs Agent 模式

| 特性 | OpenAI 兼容模式 | Agent 模式 |
|------|----------------|-----------|
| **格式** | OpenAI 标准格式 | 自定义格式 |
| **工具调用** | ❌ 不支持 | ✅ 完整支持 |
| **会话管理** | ⚠️ 手动构建 | ✅ 自动管理 |
| **响应格式** | SSE chunks | SSE events |
| **多轮对话** | ⚠️ 有限支持 | ✅ 完整支持 |
| **适用场景** | 简单问答 | 复杂任务 |
| **兼容性** | OpenAI SDK | 自定义客户端 |

## 高级用法

### 自定义事件处理

```javascript
async function chatWithClaude(content, sessionId = null) {
  const response = await fetch('http://localhost:3912/v1/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, session_id: sessionId })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let fullContent = '';
  const toolCalls = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const [eventLine, dataLine] = line.split('\n');
      const event = eventLine.replace('event: ', '');
      const data = JSON.parse(dataLine.replace('data: ', ''));

      switch (event) {
        case 'session':
          console.log('Session ID:', data.session_id);
          break;
        case 'content':
          fullContent += data.content;
          process.stdout.write(data.content);
          break;
        case 'tool_call':
          toolCalls.push(data);
          console.log('\n[Tool Call]', data.tool);
          break;
        case 'done':
          console.log('\n[Done]', data.status);
          break;
        case 'error':
          console.error('[Error]', data.message);
          break;
      }
    }
  }

  return { fullContent, toolCalls };
}
```

### 集成到应用

```javascript
// Express.js 集成示例
import express from 'express';
import { PTYAdapter } from './lib/adapters/pty-adapter.js';

const app = express();
const adapter = new PTYAdapter();

app.post('/api/ask', async (req, res) => {
  const { question, sessionId } = req.body;

  // 获取或创建会话
  const session = await adapter.getOrCreateSession(sessionId);

  // 发送消息
  await adapter.sendMessage(session.sessionId, question);

  // 流式响应
  res.setHeader('Content-Type', 'text/event-stream');

  for await (const event of adapter.streamResponse(session.sessionId)) {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }

  res.end();
});
```

## 参考资料

- [混合模式设计文档](./design/hybrid-mode-design.md)
- [OpenAI 兼容性分析](./openai-compatibility-analysis.md)
- [Claude CLI 官方文档](https://docs.anthropic.com/claude-code/overview)

---

**最后更新:** 2026-02-05
**版本:** 2.0.0
