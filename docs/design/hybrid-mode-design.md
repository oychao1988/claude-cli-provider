# 混合模式架构设计文档

> **版本**: 1.0.0
> **创建日期**: 2026-02-04
> **状态**: ✅ 已实施
> **优先级**: P0
> **适用对象**: 架构师、开发者

---

## 📋 文档概述

本文档定义了 Claude CLI Provider 的混合模式架构，同时支持：
1. **OpenAI 兼容模式** - 标准化 API，适合简单场景
2. **Agent 模式** - 完整功能，适合复杂交互场景

---

## 🎯 设计目标

### 核心目标

1. ✅ **向后兼容** - 保持现有 OpenAI API 不变
2. ✅ **功能完整** - Agent 模式支持所有 Claude CLI 功能
3. ✅ **代码复用** - 两种模式共享核心组件
4. ✅ **易于维护** - 清晰的模块化设计
5. ✅ **性能优化** - 避免重复资源占用

### 非目标

- ❌ 统一两种接口的请求格式
- ❌ 在两种模式间共享会话状态
- ❌ Agent 模式支持 OpenAI 格式

---

## 🏗️ 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         HTTP Server (Express)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │  OpenAI 兼容模式      │      │   Agent 模式         │        │
│  │  /v1/chat/completions│      │   /v1/agent/*        │        │
│  └──────────┬───────────┘      └──────────┬───────────┘        │
│             │                             │                      │
│             ▼                             ▼                      │
│  ┌──────────────────────┐      ┌──────────────────────┐        │
│  │  CLI Params Adapter  │      │  PTY Adapter         │        │
│  │  (现有实现)          │      │  (新增)              │        │
│  └──────────┬───────────┘      └──────────┬───────────┘        │
│             │                             │                      │
│             │        ┌─────────────────────┴────────┐           │
│             │        │                              │           │
│             ▼        ▼                              ▼           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Shared Components Layer                    │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  • Message Formatter      • Claude Process Manager      │   │
│  │  • Response Transformer   • Session Manager             │   │
│  │  • Tool Handler           • Event Emitter               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                  │
│                             ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Claude CLI                           │   │
│  │  • Process 1: CLI 参数模式 (--print --output-format)    │   │
│  │  • Process 2: 交互模式 (默认 TUI)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 目录结构

```
claude-cli-provider/
├── server.js                 # HTTP 服务器主入口
├── lib/                      # 新增：共享组件库
│   ├── adapters/
│   │   ├── cli-adapter.js           # CLI 参数适配器（重构现有代码）
│   │   ├── pty-adapter.js           # PTY 适配器（新增）
│   │   └── base-adapter.js          # 基类适配器接口
│   ├── formatters/
│   │   ├── message-formatter.js     # 消息格式化
│   │   └── response-transformer.js # 响应转换
│   ├── claude/
│   │   ├── process-manager.js       # Claude 进程管理
│   │   ├── session-manager.js       # 会话管理（Agent 模式）
│   │   └── tool-detector.js         # 工具调用检测
│   └── utils/
│       ├── logger.js                # 日志工具
│       └── errors.js                # 错误定义
├── routes/                   # 新增：路由模块
│   ├── openai.js               # OpenAI 兼容路由
│   └── agent.js                # Agent 模式路由
└── docs/
    └── design/
        └── hybrid-mode-design.md  # 本文档
```

---

## 📡 接口设计

### 模式 1: OpenAI 兼容接口（现有）

#### POST /v1/chat/completions

**用途**: OpenAI 标准格式，适合简单问答和单轮对话

**特点**:
- ✅ OpenAI 标准格式
- ✅ 无状态（每次请求独立）
- ⚠️  有限的多轮对话支持（手动构建上下文）
- ⚠️  无工具调用

**请求格式**:
```json
{
  "model": "sonnet",
  "messages": [
    { "role": "system", "content": "你是一个助手" },
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好！" },
    { "role": "user", "content": "介绍一下自己" }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 1000,
  "stop": ["\n\n", "END"]
}
```

**响应格式** (流式):
```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk",...}
data: [DONE]
```

**实现要点**:
```javascript
// 1. 提取系统提示词
const systemMessage = messages.find(m => m.role === 'system');
if (systemMessage) {
  args.push('--system-prompt', systemMessage.content);
}

// 2. 构建对话上下文
const conversation = messages
  .filter(m => ['user', 'assistant'].includes(m.role))
  .map(m => `${m.role}: ${m.content}`)
  .join('\n');

// 3. 忽略不支持但接受的参数
const unsupportedParams = ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty'];
// 记录警告日志，但继续处理

// 4. 启动 Claude CLI（print 模式）
spawn('claude', [
  '-p',
  '--output-format', stream ? 'stream-json' : 'json',
  '--system-prompt', systemPrompt,
  '--model', model,
  '--no-session-persistence'
])
```

**支持的参数增强**:

| 参数 | 支持情况 | 实现方式 |
|------|----------|----------|
| `messages` | ✅ 增强 | 提取 system 消息 |
| `model` | ✅ 完整 | `--model` |
| `stream` | ✅ 完整 | `--output-format` |
| `max_tokens` | ⚠️  有限 | 后处理截断 |
| `stop` | ✅ 新增 | 后处理检测 |
| `temperature` | ⚠️  忽略 | 记录警告 |
| `top_p` | ⚠️  忽略 | 记录警告 |
| `response_format` | ⚠️  计划 | `--json-schema` |
| `tools` | ❌ 不支持 | 建议使用 Agent 模式 |

---

### 模式 2: Agent 接口（新增）

#### POST /v1/agent/chat

**用途**: 完整功能，支持工具调用和多轮对话

**特点**:
- ✅ 完整工具调用支持
- ✅ 自动会话管理
- ✅ 实时事件流
- ❌ 非 OpenAI 格式

**请求格式**:
```json
{
  "content": "请帮我创建一个简单的 HTTP 服务器",
  "session_id": "optional-session-id",  // 可选，用于恢复会话
  "options": {
    "model": "sonnet",
    "allowed_tools": ["Bash", "Edit", "Read", "Write"],
    "working_directory": "/path/to/project"
  }
}
```

**响应格式** (SSE):
```
event: status
data: {"status": "running", "message": "正在处理..."}

event: message_delta
data: {"content": "好的，我来帮您创建"}

event: tool_call
data: {"tool": "Write", "input": {"file_path": "server.js", ...}}

event: tool_result
data: {"tool": "Write", "output": "文件已创建"}

event: message_done
data: {"content": "完整的消息内容", "role": "assistant"}

event: status
data: {"status": "stable", "message": "等待输入"}
```

**实现要点**:

```javascript
// 1. 使用 node-pty 创建伪终端
import pty from 'node-pty';

// 2. 启动 Claude CLI（交互模式）
const ptyProcess = pty.spawn('claude', [
  '--model', options.model,
  '--allowed-tools', options.allowed_tools.join(',')
], {
  name: 'xterm-color',
  cols: 80,
  rows: 24,
  cwd: options.working_directory,
  env: process.env
});

// 3. 发送消息（使用 bracketed paste mode）
function sendMessage(content) {
  // 发送 bracketed paste 开始序列
  ptyProcess.write('\x1b[200~');

  // 发送内容
  ptyProcess.write(content);

  // 发送 bracketed paste 结束序列
  ptyProcess.write('\x1b[201~');

  // 发送回车
  ptyProcess.write('\r');
}

// 4. 监听输出，解析消息
ptyProcess.on('data', (data) => {
  const screen = updateScreen(data);
  const message = extractMessage(screen);

  if (message) {
    // 检测工具调用
    const toolCalls = detectToolCalls(message);

    // 发送 SSE 事件
    sendSSE('message_delta', { content: message });
  }
});
```

#### GET /v1/agent/sessions

**用途**: 列出所有活动会话

**响应**:
```json
{
  "sessions": [
    {
      "session_id": "uuid",
      "created_at": "2026-02-04T10:00:00Z",
      "last_activity": "2026-02-04T10:30:00Z",
      "message_count": 15,
      "status": "stable"
    }
  ]
}
```

#### GET /v1/agent/sessions/:id

**用途**: 获取会话详情和消息历史

**响应**:
```json
{
  "session_id": "uuid",
  "created_at": "2026-02-04T10:00:00Z",
  "status": "stable",
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "创建一个 HTTP 服务器",
      "timestamp": "2026-02-04T10:00:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "好的，我来帮您...",
      "timestamp": "2026-02-04T10:00:15Z",
      "tool_calls": [
        {
          "tool": "Write",
          "input": {"file_path": "server.js"},
          "output": "文件已创建"
        }
      ]
    }
  ]
}
```

#### DELETE /v1/agent/sessions/:id

**用途**: 删除会话并清理资源

**响应**:
```json
{
  "ok": true,
  "message": "会话已删除"
}
```

#### POST /v1/agent/sessions/:id/attach

**用途**: 附加到现有会话（WebSocket 连接）

**用途**: 实时查看终端输出，用于调试

---

## 🔧 共享组件设计

### 1. Message Formatter (lib/formatters/message-formatter.js)

**用途**: 统一的消息格式化工具

```javascript
class MessageFormatter {
  /**
   * 格式化 OpenAI messages 为 CLI 输入
   */
  static formatForCLI(messages) {
    const systemMessage = messages.find(m => m.role === 'system');
    const conversation = messages
      .filter(m => ['user', 'assistant'].includes(m.role))
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    return { systemPrompt: systemMessage?.content, conversation };
  }

  /**
   * 格式化为 bracketed paste mode（用于 PTY）
   */
  static formatForPTY(content) {
    return `\x1b[200~${content}\x1b[201~`;
  }

  /**
   * 移除 TUI 元素
   */
  static stripUIElements(text, userInput) {
    // 移除用户输入回显
    let result = text.replace(new RegExp(userInput, 'g'), '');

    // 移除输入框等 TUI 元素
    result = result.split('\n')
      .filter(line => !this.isTUIElement(line))
      .join('\n');

    return result.trim();
  }

  static isTUIElement(line) {
    const tuiPatterns = [
      /^>$/,
      /^─+$/,
      /^\s*$/,
      /^\[.*\]$/,  // 状态栏
    ];
    return tuiPatterns.some(pattern => pattern.test(line));
  }
}
```

### 2. Response Transformer (lib/formatters/response-transformer.js)

**用途**: Claude CLI 输出转换为 API 响应

```javascript
class ResponseTransformer {
  /**
   * 转换为 OpenAI 格式
   */
  static toOpenAIFormat(events, model, stream) {
    const content = this.extractContent(events);

    if (stream) {
      return this.toSSEChunk(content, model);
    } else {
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: `claude-${model}`,
        choices: [{
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop'
        }],
        usage: this.estimateTokens(content)
      };
    }
  }

  /**
   * 转换为 Agent 事件
   */
  static toAgentEvents(screen, previousScreen) {
    const newContent = this.diff(previousScreen, screen);
    const toolCalls = this.detectToolCalls(newContent);

    return {
      message_delta: { content: newContent },
      tool_calls: toolCalls,
      status: this.detectStatus(screen)
    };
  }

  static extractContent(events) {
    for (const event of events) {
      if (event.type === 'result' && event.result) {
        return event.result;
      }
    }
    return null;
  }

  static detectToolCalls(text) {
    // 检测 Claude CLI 的工具调用模式
    const toolCallPattern = /Tool call: (\w+)\((.*)\)/g;
    const calls = [];
    let match;

    while ((match = toolCallPattern.exec(text)) !== null) {
      calls.push({
        tool: match[1],
        input: match[2]
      });
    }

    return calls;
  }

  static diff(oldScreen, newScreen) {
    const oldLines = oldScreen.split('\n');
    const newLines = newScreen.split('\n');
    const oldLinesSet = new Set(oldLines);

    // 找到新增的行
    const addedLines = newLines.filter(line => !oldLinesSet.has(line));

    return addedLines.join('\n').trim();
  }
}
```

### 3. Claude Process Manager (lib/claude/process-manager.js)

**用途**: 统一的 Claude CLI 进程管理

```javascript
import { spawn } from 'child_process';
import pty from 'node-pty';

class ClaudeProcessManager {
  constructor() {
    this.cliProcesses = new Map();  // CLI 模式进程池
    this.ptyProcesses = new Map();  // PTY 模式进程池
  }

  /**
   * 创建 CLI 模式进程（用于 OpenAI 兼容接口）
   */
  createCLIProcess(options) {
    const args = [
      '-p',
      '--output-format', options.stream ? 'stream-json' : 'json',
      '--model', options.model,
      '--no-session-persistence',
      '--dangerously-skip-permissions'
    ];

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    const process = spawn('claude', args, {
      env: process.env
    });

    const processId = this.generateId();
    this.cliProcesses.set(processId, process);

    return { process, processId };
  }

  /**
   * 创建 PTY 模式进程（用于 Agent 接口）
   */
  createPTYProcess(options) {
    const args = ['--model', options.model];

    if (options.allowedTools) {
      args.push('--allowed-tools', options.allowedTools.join(','));
    }

    const ptyProcess = pty.spawn('claude', args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: options.workingDirectory,
      env: process.env
    });

    const processId = this.generateId();
    this.ptyProcesses.set(processId, ptyProcess);

    return { ptyProcess, processId };
  }

  /**
   * 清理进程
   */
  cleanup(processId, type = 'cli') {
    const processes = type === 'cli' ? this.cliProcesses : this.ptyProcesses;
    const process = processes.get(processId);

    if (process) {
      if (type === 'cli') {
        process.kill('SIGTERM');
      } else {
        process.kill('SIGTERM');
      }
      processes.delete(processId);
    }
  }

  /**
   * 清理所有进程
   */
  cleanupAll() {
    this.cliProcesses.forEach(p => p.kill('SIGTERM'));
    this.ptyProcesses.forEach(p => p.kill('SIGTERM'));
    this.cliProcesses.clear();
    this.ptyProcesses.clear();
  }

  generateId() {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default ClaudeProcessManager;
```

### 4. Session Manager (lib/claude/session-manager.js)

**用途**: Agent 模式的会话管理

```javascript
import { v4 as uuidv4 } from 'uuid';

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * 创建新会话
   */
  createSession(options) {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'initializing',
      messages: [],
      ptyProcess: null,  // 由外部设置
      screenHistory: [],
      options
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * 添加消息到会话
   */
  addMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const msg = {
      id: session.messages.length + 1,
      ...message,
      timestamp: new Date()
    };

    session.messages.push(msg);
    session.lastActivity = new Date();

    return msg;
  }

  /**
   * 更新会话状态
   */
  updateStatus(sessionId, status) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivity = new Date();
    }
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.ptyProcess) {
      session.ptyProcess.kill('SIGTERM');
    }
    return this.sessions.delete(sessionId);
  }

  /**
   * 列出所有会话
   */
  listSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      session_id: session.sessionId,
      created_at: session.createdAt,
      last_activity: session.lastActivity,
      message_count: session.messages.length,
      status: session.status
    }));
  }

  /**
   * 清理过期会话
   */
  cleanupExpired(maxAge = 24 * 60 * 60 * 1000) {  // 默认 24 小时
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity.getTime();
      if (age > maxAge) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(id => this.deleteSession(id));
    return expiredSessions.length;
  }
}

export default SessionManager;
```

---

## 🔄 请求流程

### OpenAI 兼容模式流程

```
Client Request
    │
    ▼
┌─────────────────────────────────────────┐
│  1. 验证和解析请求                       │
│     - 检查 API Key                      │
│     - 解析 messages                     │
│     - 提取系统提示词                     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  2. 格式化消息                           │
│     - 构建对话上下文                     │
│     - 准备 CLI 参数                      │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  3. 创建 CLI 进程                        │
│     - spawn('claude', ['-p', ...])      │
│     - 使用 --output-format stream-json  │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  4. 发送输入并流式处理输出               │
│     - 写入 prompt 到 stdin              │
│     - 监听 stdout                       │
│     - 逐块解析 JSON                     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  5. 转换为 OpenAI 格式响应               │
│     - 构建 SSE chunk                    │
│     - 或构建 JSON 响应                  │
└─────────────────────────────────────────┘
    │
    ▼
Client Response
```

### Agent 模式流程

```
Client Request
    │
    ▼
┌─────────────────────────────────────────┐
│  1. 验证和解析请求                       │
│     - 检查 API Key                      │
│     - 解析 content 和 options           │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  2. 获取或创建会话                       │
│     - 如果提供 session_id，恢复会话     │
│     - 否则创建新会话                    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  3. 创建/获取 PTY 进程                   │
│     - 使用 node-pty                     │
│     - 启动 claude (交互模式)            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  4. 发送消息到 PTY                       │
│     - 使用 bracketed paste mode         │
│     - 发送回车符                        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  5. 持续监控终端输出                     │
│     - 每 25ms 截取屏幕                  │
│     - 检测屏幕稳定性                    │
│     - 提取新内容                        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  6. 解析并发送事件                       │
│     - 检测工具调用                      │
│     - 发送 SSE 事件流                   │
│     - 保存消息历史                      │
└─────────────────────────────────────────┘
    │
    ▼
Client SSE Stream
```

---

## 📦 依赖项

### 新增依赖

```json
{
  "dependencies": {
    "node-pty": "^1.0.0",           // PTY 伪终端支持
    "uuid": "^9.0.0"                // 会话 ID 生成
  },
  "devDependencies": {
    "@types/node-pty": "^1.0.0"     // TypeScript 类型定义
  }
}
```

### node-pty 说明

**安装注意事项**:
- 需要原生编译，可能需要构建工具
- macOS: 需要安装 Xcode Command Line Tools
- Linux: 需要安装 build-essential
- Windows: 需要安装 Windows SDK

**替代方案**: 如果 node-pty 安装困难，可考虑：
- `pty.js` (较旧，但更易安装)
- 自己实现简单的 PTY 封装

---

## 🧪 测试策略

### 单元测试

```javascript
// tests/lib/formatters/message-formatter.test.js
describe('MessageFormatter', () => {
  test('formatForCLI 提取系统提示词', () => {
    const messages = [
      { role: 'system', content: 'You are a helper' },
      { role: 'user', content: 'Hello' }
    ];

    const result = MessageFormatter.formatForCLI(messages);
    expect(result.systemPrompt).toBe('You are a helper');
  });

  test('stripUIElements 移除 TUI 元素', () => {
    const text = 'Hello\n>\n─\nWorld';
    const result = MessageFormatter.stripUIElements(text, '');
    expect(result).toBe('Hello\nWorld');
  });
});
```

### 集成测试

```javascript
// tests/integration/openai-mode.test.js
describe('OpenAI 兼容模式', () => {
  test('支持系统提示词', async () => {
    const response = await axios.post('http://localhost:3912/v1/chat/completions', {
      model: 'sonnet',
      messages: [
        { role: 'system', content: '你只说法语' },
        { role: 'user', content: 'Hello' }
      ]
    });

    expect(response.data.choices[0].message.content).toContain('Bonjour');
  });
});

// tests/integration/agent-mode.test.js
describe('Agent 模式', () => {
  test('支持工具调用', async () => {
    const response = await axios.post('http://localhost:3912/v1/agent/chat', {
      content: '创建一个文件 test.txt',
      options: { allowed_tools: ['Bash', 'Write'] }
    });

    expect(response.data.tool_calls).length.toBeGreaterThan(0);
  });
});
```

---

## 📅 实施计划

### 阶段 1: 基础重构（2-3天）

**任务**:
1. ✅ 创建 `lib/` 目录结构
2. ✅ 重构现有代码到 `lib/adapters/cli-adapter.js`
3. ✅ 实现共享组件（MessageFormatter, ResponseTransformer）
4. ✅ 实现 ClaudeProcessManager（CLI 部分）
5. ✅ 单元测试覆盖

**验收标准**:
- 现有功能不受影响
- 代码组织更清晰
- 测试通过

### 阶段 2: OpenAI 模式增强（1-2天）

**任务**:
1. ✅ 支持系统提示词提取
2. ✅ 支持多轮对话上下文
3. ✅ 支持 `max_tokens` 后处理
4. ✅ 支持 `stop` 序列
5. ✅ 不支持参数的友好提示
6. ✅ 文档更新

**验收标准**:
- 系统提示词生效
- 多轮对话正常工作
- 参数警告日志正常

### 阶段 3: PTY 适配器实现（3-4天）

**任务**:
1. ✅ 安装和配置 node-pty
2. ✅ 实现 `lib/adapters/pty-adapter.js`
3. ✅ 实现屏幕快照和稳定性检测
4. ✅ 实现消息提取和 TUI 过滤
5. ✅ 实现工具调用检测
6. ✅ 单元测试

**验收标准**:
- PTY 进程正常启动
- 屏幕内容正确捕获
- 消息提取准确

### 阶段 4: Agent 接口实现（2-3天）

**任务**:
1. ✅ 实现 SessionManager
2. ✅ 实现 `/v1/agent/chat` 路由
3. ✅ 实现 SSE 事件流
4. ✅ 实现会话管理路由（GET/DELETE sessions）
5. ✅ 集成测试

**验收标准**:
- Agent 接口可用
- 会话管理正常
- 工具调用工作

### 阶段 5: 测试和优化（2-3天）

**任务**:
1. ✅ 端到端测试
2. ✅ 性能测试和优化
3. ✅ 错误处理完善
4. ✅ 日志和监控
5. ✅ 文档完善

**验收标准**:
- 所有测试通过
- 性能满足要求
- 文档完整

### 阶段 6: 部署和发布（1天）

**任务**:
1. ✅ 更新部署文档
2. ✅ 版本发布
3. ✅ 更新 CHANGELOG

**总计**: 11-16 天

---

## ⚠️ 风险评估

### 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| node-pty 安装失败 | 中 | 高 | 提前验证，准备替代方案 |
| PTY 解析脆弱性 | 中 | 中 | 参考 AgentAPI 经验，充分测试 |
| 性能问题 | 低 | 中 | 进程池管理，资源限制 |
| 会话状态泄漏 | 中 | 中 | 定期清理，监控告警 |

### 兼容性风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| OpenAI API 破坏性变更 | 低 | 高 | 版本锁定，充分测试 |
| Claude CLI 更新破坏解析 | 中 | 高 | 持续跟踪上游，及时适配 |
| 不同平台行为差异 | 中 | 中 | 跨平台测试 |

---

## 📊 性能考量

### 资源管理

```javascript
// 进程池限制
const MAX_CLI_PROCESSES = 10;
const MAX_PTY_PROCESSES = 5;

// 会话清理
setInterval(() => {
  sessionManager.cleanupExpired(24 * 60 * 60 * 1000);
}, 60 * 60 * 1000);  // 每小时清理一次

// 内存监控
function checkMemoryUsage() {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 500 * 1024 * 1024) {  // 500MB
    logger.warn('High memory usage', usage);
  }
}
```

### 性能指标

| 指标 | 目标值 | 监控方式 |
|------|--------|----------|
| OpenAI 模式首字节延迟 | < 200ms | 日志统计 |
| Agent 模式首字节延迟 | < 500ms | 日志统计 |
| PTY 进程启动时间 | < 1s | 性能测试 |
| 会话内存占用 | < 10MB | 进程监控 |

---

## 🔐 安全考虑

### API 认证

两种模式统一使用现有的 API Key 认证：

```javascript
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') ||
                 req.headers['x-api-key'];

  if (!config.API_KEY) {
    return next();  // 开发环境跳过
  }

  if (apiKey !== config.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
```

### 权限控制

```javascript
// Agent 模式：限制可访问的工具
const defaultAllowedTools = ['Read', 'Grep', 'Glob'];
const dangerousTools = ['Bash', 'Write', 'Edit'];

function validateTools(tools) {
  // 生产环境需要显式允许危险工具
  if (config.NODE_ENV === 'production') {
    const hasDangerous = dangerousTools.some(t => tools.includes(t));
    if (hasDangerous && !config.ALLOW_DANGEROUS_TOOLS) {
      throw new Error('Dangerous tools not allowed in production');
    }
  }
}
```

### 资源限制

```javascript
// 限制会话数量
const MAX_SESSIONS_PER_CLIENT = 5;

// 限制消息历史长度
const MAX_MESSAGES_PER_SESSION = 100;

// 请求超时
const REQUEST_TIMEOUT = 5 * 60 * 1000;  // 5 分钟
```

---

## 📝 文档需求

### API 文档

1. **OpenAI 兼容接口**
   - 支持的参数列表
   - 与标准 OpenAI API 的差异
   - 示例代码

2. **Agent 接口**
   - 完整的 API 参考
   - 事件流格式说明
   - 会话管理指南

### 部署文档

1. **node-pty 安装指南**
   - 各平台的安装步骤
   - 常见问题解决

2. **配置说明**
   - 新增的环境变量
   - 性能调优建议

### 开发文档

1. **架构说明**
   - 模块职责划分
   - 数据流图

2. **贡献指南**
   - 代码规范
   - 测试要求

---

## 🎯 成功标准

### 功能完整性

- ✅ OpenAI 兼容模式支持系统提示词和多轮对话
- ✅ Agent 模式支持完整的工具调用
- ✅ 会话管理功能正常工作
- ✅ 两种模式可以独立使用

### 性能标准

- ✅ OpenAI 模式首字节延迟 < 200ms
- ✅ Agent 模式首字节延迟 < 500ms
- ✅ 内存占用 < 500MB（空载）

### 质量标准

- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试覆盖主要场景
- ✅ 无已知严重 Bug
- ✅ 文档完整

---

## 🔗 参考资料

- [OpenAI 兼容性分析](./openai-compatibility-analysis.md)
- [AgentAPI 实现分析](./agentapi-implementation-analysis.md)
- [AgentAPI GitHub](https://github.com/coder/agentapi)
- [node-pty 文档](https://github.com/microsoft/node-pty)
- [Claude CLI 文档](https://docs.anthropic.com/claude-code/overview)

---

**最后更新**: 2026-02-04
**状态**: 待评审
**下一步**: 创建实施任务清单
