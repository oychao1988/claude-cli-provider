# 安全设计文档 - Claude CLI Provider

> **版本**: 1.0.0
> **创建日期**: 2026-02-05
> **状态**: ✅ 已完成
> **最后更新**: 2026-02-05
> **适用对象**: 安全工程师、架构师

本文档描述 Claude CLI Provider 的安全设计、威胁模型和安全最佳实践。

---

## 目录

1. [威胁模型](#威胁模型)
2. [安全控制](#安全控制)
3. [输入验证](#输入验证)
4. [进程隔离](#进程隔离)
5. [资源限制](#资源限制)
6. [安全检查清单](#安全检查清单)

---

## 威胁模型

### 潜在威胁

1. **未授权访问**
   - 攻击者无 API Key 访问服务
   - 弱 API Key 被破解

2. **注入攻击**
   - 命令注入通过用户输入
   - 路径遍历攻击

3. **资源耗尽**
   - DoS 攻击耗尽进程池
   - 内存泄漏导致服务器崩溃

4. **数据泄露**
   - 日志中暴露敏感信息
   - 错误消息泄露系统信息

5. **会话劫持**
   - Session ID 被猜测
   - 会话未正确过期

---

## 安全控制

### 1. 认证

**API Key 认证** (`routes/openai.js`, `routes/agent.js`):

```javascript
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') ||
                 req.headers['x-api-key'];

  if (!process.env.API_KEY) {
    // Dev mode: skip authentication
    return next();
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  next();
}
```

**安全特性**:
- 支持Bearer Token 和 X-API-Key 两种方式
- 生产环境必须配置 API_KEY
- 开发环境可跳过认证
- 认证失败不泄露具体原因

**最佳实践**:
```bash
# 生成强随机 API Key
openssl rand -hex 32

# 设置环境变量（不提交到 Git）
export API_KEY="<generated-key>"

# 或使用 .env 文件（已加入 .gitignore）
echo "API_KEY=<generated-key>" > .env
```

### 2. 输入验证

**消息验证** (`lib/formatters/message-formatter.js`):

```javascript
validateMessages(messages) {
  // 1. 类型检查
  if (!Array.isArray(messages)) {
    throw new ValidationError('Messages must be an array');
  }

  // 2. 非空检查
  if (messages.length === 0) {
    throw new ValidationError('Messages array is required');
  }

  // 3. 结构验证
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      throw new ValidationError('Invalid message format');
    }

    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      throw new ValidationError('Invalid role');
    }
  }

  // 4. 至少一个用户消息
  const hasUserMessage = messages.some(m => m.role === 'user');
  if (!hasUserMessage) {
    throw new ValidationError('No user message found');
  }

  return true;
}
```

**路由层验证** (`routes/openai.js`):

```javascript
router.post('/chat/completions', authenticateApiKey, async (req, res) => {
  const { messages, model, stream } = req.body;

  // 验证消息数组
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'Messages array is required and must not be empty',
        type: 'invalid_request_error'
      }
    });
  }

  // 验证模型名称（可选）
  if (model && typeof model !== 'string') {
    return res.status(400).json({
      error: {
        message: 'Model must be a string',
        type: 'invalid_request_error'
      }
    });
  }

  // 验证 stream 标志
  if (stream !== undefined && typeof stream !== 'boolean') {
    return res.status(400).json({
      error: {
        message: 'Stream must be a boolean',
        type: 'invalid_request_error'
      }
    });
  }

  // 继续处理...
});
```

### 3. 命令注入防护

**参数化命令** (`lib/claude/process-manager.js`):

```javascript
async _spawnProcess(args, options = {}) {
  // ✅ 安全：使用数组参数，避免 shell 注入
  const process = spawn(this.claudeBin, args, {
    env: { ...process.env, ...options.env },
    timeout: options.timeout || this.processTimeout
  });

  // ❌ 危险：不要使用字符串拼接
  // const command = `${this.claudeBin} ${userInput}`;
  // const process = spawn(command); // 可被注入

  return process;
}
```

**路径验证** (Agent 模式):

```javascript
// 当用户通过工具访问文件时
function validatePath(path) {
  // 规范化路径
  const normalized = path.normalize(path);

  // 检查路径遍历
  if (normalized.includes('..')) {
    throw new ValidationError('Path traversal not allowed');
  }

  // 限制在特定目录（可选）
  const allowedDir = '/workspace';
  const resolved = path.resolve(allowedDir, normalized);

  if (!resolved.startsWith(allowedDir)) {
    throw new ValidationError('Access denied');
  }

  return resolved;
}
```

### 4. 输出编码

**JSON 转义**:

```javascript
// 自动转义（通过 Express res.json）
res.json({
  message: userInput  // 自动转义特殊字符
});

// 手动转义（如果需要）
const safeOutput = JSON.stringify(userInput);
```

**日志脱敏**:

```javascript
// 避免记录敏感内容
logger.info('Request received', {
  requestId: req.id,
  path: req.path,
  messagesCount: req.body.messages.length,  // ✅ 不记录内容
  // ❌ 不要记录: messages: req.body.messages
});

// 脱敏 API Key
function maskAPIKey(key) {
  if (!key || key.length < 8) return '***';
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}
```

---

## 进程隔离

### 进程池隔离

```javascript
class ProcessManager {
  constructor(config) {
    this.activeProcesses = new Map();  // 进程ID → 进程对象
    this.maxProcesses = config.maxProcesses;
  }

  async spawnProcess(args) {
    // 检查进程限制
    if (this.activeProcesses.size >= this.maxProcesses) {
      throw new ProcessError('Maximum process limit reached');
    }

    // 创建隔离的子进程
    const proc = spawn(this.claudeBin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // 继承环境但可以添加隔离
      }
    });

    // 设置超时
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
    }, this.processTimeout);

    // 清理
    proc.on('exit', () => {
      clearTimeout(timeout);
      this.activeProcesses.delete(proc.pid);
    });

    this.activeProcesses.set(proc.pid, proc);
    return proc;
  }
}
```

### PTY 隔离 (Agent Mode)

```javascript
class PTYAdapter {
  async _createPTYProcess(sessionId) {
    // PTY 进程完全隔离
    const ptyProcess = spawn(this.claudeBin, ['--stdio'], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env
    });

    // 每个会话独立的 PTY
    // 会话之间无法互相访问
  }
}
```

---

## 资源限制

### 1. 进程池限制

```javascript
// 环境变量配置
MAX_PROCESSES = 10        // OpenAI 模式
MAX_PTY_PROCESSES = 5     // Agent 模式

// 代码实现
if (this.activeProcesses.size >= this.maxProcesses) {
  throw new ProcessError('Maximum process limit reached', {
    current: this.activeProcesses.size,
    max: this.maxProcesses
  });
}
```

**推荐配置**:

| 环境 | CPU 核心数 | MAX_PROCESSES | MAX_PTY_PROCESSES |
|------|-----------|---------------|-------------------|
| 开发 | 2-4 | 5 | 3 |
| 生产 | 8-16 | 10-20 | 5-10 |

### 2. 请求超时

```javascript
const REQUEST_TIMEOUT = 120000; // 2 分钟

// CLI Adapter
async processRequest(options) {
  const proc = await this._spawnProcess(args);

  const timeout = setTimeout(() => {
    proc.kill('SIGTERM');
    logger.warn('Process timeout', { pid: proc.pid });
  }, REQUEST_TIMEOUT);

  // ...
}
```

### 3. 会话超时

```javascript
// Session Manager
SESSION_MAX_AGE = 30 * 60 * 1000;  // 30 分钟
CLEANUP_INTERVAL = 5 * 60 * 1000;  // 5 分钟检查一次

// 自动清理过期会话
cleanupExpired(maxAge = SESSION_MAX_AGE) {
  const now = Date.now();
  const expired = [];

  for (const [id, session] of this.sessions) {
    const age = now - session.lastActivity;
    if (age > maxAge) {
      expired.push(id);
      this.deleteSession(id);
    }
  }

  return expired.length;
}
```

### 4. 内存限制

**PM2 配置** (`ecosystem.config.cjs`):

```javascript
module.exports = {
  apps: [{
    name: 'claude-cli-provider',
    script: './server.js',
    max_memory_restart: '500M',  // 超过 500MB 重启
    // ...
  }]
};
```

**Docker 配置** (`docker-compose.yml`):

```yaml
services:
  claude-cli-provider:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

---

## 安全检查清单

### 部署前检查

- [ ] **认证**
  - [ ] 已设置强随机 API_KEY
  - [ ] API_KEY 未提交到 Git
  - [ ] 生产环境 NODE_ENV=production

- [ ] **输入验证**
  - [ ] 所有输入参数已验证
  - [ ] 消息数组验证生效
  - [ ] 路径遍历防护已实现

- [ ] **进程隔离**
  - [ ] 进程池限制已配置
  - [ ] PTY 进程隔离生效
  - [ ] 超时机制已启用

- [ ] **资源限制**
  - [ ] MAX_PROCESSES 已设置
  - [ ] MAX_PTY_PROCESSES 已设置
  - [ ] 内存限制已配置

- [ ] **日志和监控**
  - [ ] 敏感信息不记录
  - [ ] 错误消息不泄露系统信息
  - [ ] 健康检查端点可用

- [ ] **网络安全**
  - [ ] HTTPS 已配置（生产）
  - [ ] 防火墙规则已设置
  - [ ] CORS 配置正确

### 运行时检查

- [ ] **定期审查**
  - [ ] 日志中无异常错误
  - [ ] 进程池使用率正常
  - [ ] 无未授权访问尝试

- [ ] **更新维护**
  - [ ] 依赖包定期更新
  - [ ] 安全漏洞扫描
  - [ ] Claude CLI 版本更新

---

## 常见安全问题

### 1. API Key 泄露

**问题**: API Key 提交到 Git

**解决**:
```bash
# 确保 .env 在 .gitignore 中
echo ".env" >> .gitignore

# 使用环境变量
export API_KEY="your-key"

# 或使用密钥管理服务
# AWS Secrets Manager, HashiCorp Vault, etc.
```

### 2. 命令注入

**问题**: 用户输入未经验证直接用于命令

**防止**:
```javascript
// ✅ 安全
spawn(claudeBin, ['--model', model]);

// ❌ 危险
spawn(`sh -c "claude --model ${model}"`);
```

### 3. 日志注入

**问题**: 用户输入包含控制字符污染日志

**防止**:
```javascript
// 转义换行符
function sanitizeLog(input) {
  return String(input)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

logger.info('User input', {
  input: sanitizeLog(userInput)
});
```

### 4. 路径遍历

**问题**: 访问预期之外的文件

**防止**:
```javascript
import path from 'path';

function safeResolve(base, target) {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
```

---

## 安全监控

### 入侵检测

**监控指标**:
```javascript
// 异常检测
if (metrics.errorRate > 0.1) {
  alert('High error rate - possible attack');
}

if (metrics.requestsPerSecond > 1000) {
  alert('High traffic - possible DoS');
}

// 认证失败
if (authFailures > 10) {
  alert('Multiple authentication failures');
}
```

### 审计日志

```javascript
// 记录关键操作
logger.info('API access', {
  timestamp: new Date().toISOString(),
  ip: req.ip,
  endpoint: req.path,
  method: req.method,
  success: true,
  userAgent: req.headers['user-agent']
});
```

---

## 合规性

### 数据保护

- **不存储**: 服务不存储用户对话内容
- **不传输**: 内容直接传输给 Claude CLI，不存储
- **日志**: 仅记录元数据，不记录消息内容

### 隐私

- **会话数据**: 仅在内存中，服务重启后清空
- **过期清理**: 自动清理过期会话
- **无追踪**: 不使用追踪或分析工具

---

## 参考资料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**返回**: [架构文档首页](./README.md)
