# Claude CLI Provider - 项目文档

> **版本**: 1.0.0
> **最后更新**: 2026-02-04
> **项目状态**: 生产就绪

---

## 📖 文档导航

### 快速开始

- **项目主文档**: [../README.md](../README.md) - 项目概述和快速入门
- **部署指南**: [guides/deployment-guide.md](guides/deployment-guide.md) - 生产环境部署完整指南

---

## 🎯 按角色查看

### 开发者

- [API 端点文档](#api-端点文档)
- [技术架构](architecture/)
- [开发指南](development/)

### 运维人员

- [部署指南](guides/deployment-guide.md)
- [环境配置](#环境配置)
- [故障排查](guides/deployment-guide.md#故障排查)

### 用户

- [快速开始](../README.md#快速开始)
- [使用指南](guides/)
- [API 示例](#api-使用示例)

---

## 📚 文档分类

### [guides/](guides/) - 使用指南

面向用户的操作文档和指南。

| 文档 | 状态 | 描述 |
|------|------|------|
| [deployment-guide.md](guides/deployment-guide.md) | ✅ 已完成 | PM2/Docker 生产部署完整指南 |
| [api-guide.md](guides/api-guide.md) | ✅ 已完成 | API 使用指南和最佳实践 |
| [agent-mode-guide.md](guides/agent-mode-guide.md) | ✅ 已完成 | Agent 模式使用指南和配置说明 |

### [design/](design/) - 设计文档

功能设计文档和实施方案。

| 文档 | 状态 | 描述 |
|------|------|------|
| [openai-compatibility-analysis.md](design/openai-compatibility-analysis.md) | ✅ 已实施 | OpenAI 兼容性分析报告 |
| [agentapi-implementation-analysis.md](design/agentapi-implementation-analysis.md) | ✅ 已实施 | Agent API 实现分析 |
| [hybrid-mode-design.md](design/hybrid-mode-design.md) | ✅ 已实施 | 混合模式架构设计 |

### [architecture/](architecture/) - 架构文档

系统设计和技术架构文档。

| 文档 | 状态 | 描述 |
|------|------|------|
| [system-architecture.md](architecture/system-architecture.md) | ✅ 已完成 | 系统架构设计文档 |
| [security-design.md](architecture/security-design.md) | ✅ 已完成 | 安全设计文档 |

### [development/](development/) - 开发相关

开发计划和总结文档。

| 文档 | 状态 | 描述 |
|------|------|------|
| [HYBRID-MODE-IMPLEMENTATION-PLAN.md](development/HYBRID-MODE-IMPLEMENTATION-PLAN.md) | ✅ 已完成 | 混合模式实施计划 |

### [references/](references/) - 技术参考

工具使用和技术参考文档。

| 文档 | 状态 | 描述 |
|------|------|------|
| [CATEGORIES.md](references/CATEGORIES.md) | ✅ 已完成 | 文档分类定义 |
| [LIFECYCLE.md](references/LIFECYCLE.md) | ✅ 已完成 | 文档生命周期管理 |
| [TEMPLATES.md](references/TEMPLATES.md) | ✅ 已完成 | 文档模板说明 |

### [reports/](reports/) - 项目报告

里程碑完成报告和项目总结。

| 文档 | 状态 | 完成时间 | 描述 |
|------|------|----------|------|
| [final-project-summary.md](reports/final-project-summary.md) | ✅ 已完成 | 2026-02-05 | 项目总体总结和成果展示 |
| [stage4-completion-report.md](reports/stage4-completion-report.md) | ✅ 已完成 | 2026-02-05 | 阶段 4 完成详细报告 |
| [STAGE4_COMPLETION_SUMMARY.md](reports/STAGE4_COMPLETION_SUMMARY.md) | ✅ 已完成 | 2026-02-05 | 阶段 4 完成总结报告 |
| [TEST-COVERAGE-REPORT.md](reports/TEST-COVERAGE-REPORT.md) | ✅ 已完成 | 2026-02-05 | 测试覆盖率详细报告 |
| [test-plan.md](reports/test-plan.md) | ✅ 已完成 | 2026-02-05 | 综合测试计划文档 |
| [Agent 模式报告](reports/agent-mode/README.md) | ✅ 已完成 | 2025-02-05 | Agent 模式完整报告集 |

---

## 🔧 API 端点文档

### POST /v1/chat/completions

OpenAI 兼容的聊天完成接口，支持流式和非流式输出。

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

---

## 💻 环境配置

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

---

## 🚀 快速命令

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

---

## 📊 支持的模型

- **sonnet** - Claude Sonnet 4.5（推荐，平衡性能和速度）
- **opus** - Claude Opus 4.5（最强性能）
- **haiku** - Claude Haiku 4（最快速度）

---

## 🔐 安全建议

1. ✅ **生产环境必须设置 API_KEY** - 保护 API 访问
2. ✅ **使用 HTTPS** - 通过 Nginx 配置 SSL
3. ✅ **限制访问来源** - 配置防火墙规则
4. ✅ **定期更新依赖** - 保持安全性
5. ✅ **日志脱敏** - 避免记录敏感内容

---

## 📝 技术实现

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

---

## 🛠️ 故障排查

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

更多故障排查请参考 [部署指南](guides/deployment-guide.md#故障排查)。

---

## 📋 项目状态

- **当前版本**: 1.0.0
- **最后更新**: 2026-02-04
- **项目状态**: ✅ 生产就绪
- **文档完整度**: 80%

### 已实现功能

- ✅ OpenAI 兼容 API 接口
- ✅ 真流式输出支持
- ✅ API Key 认证机制
- ✅ Docker 和 PM2 部署支持
- ✅ 健康检查端点
- ✅ 完整的部署文档

### 待完善功能

- ⏳ 多轮对话上下文管理
- ⏳ 工具调用支持
- ⏳ 速率限制
- ⏳ 请求日志记录
- ⏳ 系统架构文档
- ⏳ 开发指南

---

## 📄 License

MIT

---

## 🔗 相关链接

- [GitHub 项目](https://github.com/your-username/claude-cli-provider)
- [Claude CLI 官方文档](https://docs.anthropic.com/claude-code/overview)
- [OpenAI API 文档](https://platform.openai.com/docs/api-reference)
