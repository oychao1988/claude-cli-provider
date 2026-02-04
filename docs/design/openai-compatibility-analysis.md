# OpenAI 兼容性分析报告

> **版本**: 1.0.0
> **创建日期**: 2026-02-04
> **状态**: 分析阶段
> **适用对象**: 开发者

本文档分析当前 `/v1/chat/completions` 接口与 OpenAI 标准格式的差距，以及 Claude CLI 功能适配方案。

---

## 📊 当前实现状态

### 已支持的参数

| OpenAI 参数 | 当前支持 | 映射到 Claude CLI | 代码位置 |
|------------|---------|------------------|----------|
| `messages` | ✅ 完整支持 | stdin 输入 | server.js:158-171 |
| `model` | ✅ 完整支持 | `--model` | server.js:182 |
| `stream` | ✅ 完整支持 | `--output-format stream-json/json` | server.js:178 |

---

## 📋 OpenAI 标准参数对比

### 核心参数（必填）

| 参数 | 类型 | OpenAI 说明 | 当前支持 | Claude CLI 映射 | 优先级 |
|------|------|-----------|----------|----------------|--------|
| `messages` | array | 对话消息数组 | ✅ | stdin | - |
| `model` | string | 模型名称 | ✅ | `--model` | - |

### 可选参数 - 生成控制

| 参数 | 类型 | OpenAI 说明 | 当前支持 | Claude CLI 映射 | 优先级 |
|------|------|-----------|----------|----------------|--------|
| `temperature` | number | 采样温度 (0-2) | ❌ | ❌ 不支持 | 🔴 高 |
| `top_p` | number | 核采样 (0-1) | ❌ | ❌ 不支持 | 🔴 高 |
| `max_tokens` | integer | 最大 token 数 | ❌ | ❌ 不支持 | 🟡 中 |
| `n` | integer | 生成 choices 数量 | ❌ | ❌ 不支持 | 🟢 低 |
| `stop` | string/array | 停止序列 | ❌ | ❌ 不支持 | 🟡 中 |
| `presence_penalty` | number | 存在惩罚 (-2.0~2.0) | ❌ | ❌ 不支持 | 🟡 中 |
| `frequency_penalty` | number | 频率惩罚 (-2.0~2.0) | ❌ | ❌ 不支持 | 🟡 中 |

### 可选参数 - 输出格式

| 参数 | 类型 | OpenAI 说明 | 当前支持 | Claude CLI 映射 | 优先级 |
|------|------|-----------|----------|----------------|--------|
| `response_format` | object | 响应格式（如 JSON mode） | ❌ | `--json-schema` | 🔴 高 |
| `stream` | boolean | 是否流式输出 | ✅ | `--output-format` | - |
| `stream_options` | object | 流式选项 | ❌ | 部分支持 | 🟢 低 |

### 可选参数 - 工具调用

| 参数 | 类型 | OpenAI 说明 | 当前支持 | Claude CLI 映射 | 优先级 |
|------|------|-----------|----------|----------------|--------|
| `tools` | array | 工具列表 | ❌ | `--tools` | 🔴 高 |
| `tool_choice` | string/object | 工具选择策略 | ❌ | ❌ 不支持 | 🔴 高 |

### 可选参数 - 其他

| 参数 | 类型 | OpenAI 说明 | 当前支持 | Claude CLI 映射 | 优先级 |
|------|------|-----------|----------|----------------|--------|
| `user` | string | 用户标识 | ❌ | ❌ 不支持 | 🟢 低 |
| `seed` | integer | 随机种子 | ❌ | ❌ 不支持 | 🟢 低 |
| `logprobs` | boolean | 是否返回 log probabilities | ❌ | ❌ 不支持 | 🟢 低 |
| `top_logprobs` | integer | 返回 top log probs 数量 | ❌ | ❌ 不支持 | 🟢 低 |
| `logit_bias` | map | logit 偏置 | ❌ | ❌ 不支持 | 🟢 低 |

---

## 🔧 Claude CLI 独有功能

| Claude CLI 参数 | 说明 | OpenAI 对应 | 建议处理 |
|-----------------|------|------------|----------|
| `--system-prompt` | 系统 prompt | `messages[0].role='system'` | ✅ 已支持 |
| `--allowed-tools` | 允许的工具白名单 | ❌ 无 | 🟡 可扩展 |
| `--disallowed-tools` | 禁止的工具黑名单 | ❌ 无 | 🟡 可扩展 |
| `--max-budget-usd` | 最大 API 花费 | ❌ 无 | 🟢 可选 |
| `--include-partial-messages` | 包含部分消息 | ❌ 无（流式已包含） | ✅ 已使用 |
| `--no-session-persistence` | 不保存会话 | ❌ 无 | ✅ 已使用 |
| `--verbose` | 详细输出 | ❌ 无 | ✅ 已使用 |

---

## 🎯 功能差距总结

### 🔴 高优先级缺失功能

1. **系统提示词处理** ❌
   - **问题**: 当前从 `messages` 中提取最后一条用户消息，忽略了 `system` 角色
   - **影响**: 无法设置系统提示词
   - **解决方案**: 提取 `messages` 中的 `system` 消息，使用 `--system-prompt`

2. **工具调用支持** ❌
   - **问题**: 当前使用 `--tools ""` 禁用所有工具
   - **影响**: 无法使用 Claude 强大的工具功能
   - **解决方案**: 映射 OpenAI `tools` 格式到 Claude CLI `--tools`

3. **JSON Mode / 结构化输出** ❌
   - **问题**: 不支持 `response_format={"type": "json_object"}`
   - **影响**: 无法保证输出 JSON 格式
   - **解决方案**: 使用 Claude CLI 的 `--json-schema`

4. **采样参数** ❌
   - **问题**: 不支持 `temperature`、`top_p` 等基础采样参数
   - **影响**: 无法控制生成随机性
   - **解决方案**: 暂时忽略（Claude CLI 不支持），文档说明

### 🟡 中优先级缺失功能

5. **最大 tokens 限制** ❌
   - **问题**: 不支持 `max_tokens`
   - **影响**: 无法控制输出长度
   - **解决方案**: 需确认 Claude CLI 是否支持

6. **停止序列** ❌
   - **问题**: 不支持 `stop` 参数
   - **影响**: 无法自定义停止词
   - **解决方案**: 后处理或文档说明

7. **惩罚参数** ❌
   - **问题**: 不支持 `presence_penalty`、`frequency_penalty`
   - **影响**: 无法调整重复性惩罚
   - **解决方案**: 文档说明 Claude CLI 不支持

### 🟢 低优先级功能

8. **多个 choices** ❌
   - **说明**: OpenAI 支持一次生成多个变体
   - **建议**: 文档说明当前仅支持单个 choice

9. **用户标识** ❌
10. **随机种子** ❌
11. **Log probabilities** ❌

---

## 💡 适配方案建议

### 方案 1: 系统提示词支持（高优先级）

**当前代码** (server.js:152-158):
```javascript
// 获取最后一条用户消息
const userMessages = messages.filter(m => m.role === 'user');
if (userMessages.length === 0) {
  return res.status(400).json({ error: 'No user message found' });
}
```

**改进方案**:
```javascript
// 1. 提取系统提示词
const systemMessage = messages.find(m => m.role === 'system');

// 2. 获取用户消息（保持历史对话上下文）
const userMessages = messages.filter(m => m.role === 'user');

// 3. 构建完整对话上下文
const conversation = messages
  .filter(m => ['user', 'assistant'].includes(m.role))
  .map(m => `${m.role}: ${m.content}`)
  .join('\n');

// 4. 添加 --system-prompt 参数
if (systemMessage) {
  args.push('--system-prompt', systemMessage.content);
}
```

### 方案 2: 工具调用支持（高优先级）

**OpenAI tools 格式**:
```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取天气",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**Claude CLI 工具列表**:
```
Bash, Edit, Read, Write, Grep, Glob, Task, etc.
```

**映射方案**:
```javascript
// 1. 解析 OpenAI tools
// 2. 映射到 Claude CLI 工具名称
// 3. 构建 --tools 参数
const toolMapping = {
  'code_interpreter': 'Bash',
  'file_operations': 'Edit,Read,Write',
  // ... 更多映射
};

if (tools && tools.length > 0) {
  const claudeTools = tools.map(t => toolMapping[t.type] || t.type).join(',');
  args.push('--tools', claudeTools);
}
```

### 方案 3: JSON Mode 支持（高优先级）

```javascript
// 检测 response_format
if (req.body.response_format?.type === 'json_object') {
  // 使用 Claude CLI 的 JSON schema 验证
  args.push('--json-schema', JSON.stringify({
    type: 'object',
    // 可以从 response_format 中提取 schema
  }));
}
```

### 方案 4: 不支持参数的处理

**策略**: 接受但忽略，记录警告日志

```javascript
const unsupportedParams = [
  'temperature', 'top_p', 'presence_penalty', 'frequency_penalty'
];

const foundUnsupported = unsupportedParams.filter(p => req.body[p] !== undefined);

if (foundUnsupported.length > 0) {
  logger.warn(`Unsupported parameters ignored: ${foundUnsupported.join(', ')}`);
}
```

---

## 📝 实施计划

### 阶段 1: 核心功能修复（必须）

| 任务 | 预计时间 | 优先级 |
|------|----------|--------|
| 支持系统提示词 | 2小时 | 🔴 P0 |
| 支持多轮对话上下文 | 4小时 | 🔴 P0 |
| 工具调用基础支持 | 8小时 | 🔴 P0 |

### 阶段 2: 高级功能（重要）

| 任务 | 预计时间 | 优先级 |
|------|----------|--------|
| JSON Mode / 结构化输出 | 4小时 | 🟡 P1 |
| max_tokens 支持 | 2小时 | 🟡 P1 |
| stop 序列支持 | 2小时 | 🟡 P1 |

### 阶段 3: 完善和优化（可选）

| 任务 | 预计时间 | 优先级 |
|------|----------|--------|
| 不支持参数的友好提示 | 2小时 | 🟢 P2 |
| 详细的参数映射文档 | 4小时 | 🟢 P2 |
| 单元测试覆盖 | 8小时 | 🟢 P2 |

---

## 🔗 参考资料

- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create)
- [Claude CLI 文档](https://docs.anthropic.com/claude-code/overview)
- [当前实现](../../server.js)

---

**最后更新**: 2026-02-04
**状态**: 待评审和实施
