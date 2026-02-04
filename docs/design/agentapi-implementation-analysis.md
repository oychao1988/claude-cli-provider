# AgentAPI 实现方式分析

> **版本**: 1.0.0
> **创建日期**: 2026-02-04
> **来源**: https://github.com/coder/agentapi
> **分析对象**: Claude CLI 包装方式对比

---

## 📊 两种实现方式对比

### 方式 1: CLI 参数方式（当前项目）

**核心思想**: 通过 Claude CLI 的标准化参数控制行为

```
HTTP Request → 解析参数 → 构建 CLI 命令 → Spawn 子进程 → 解析 JSON 输出
```

**优点**:
- ✅ 实现简单，代码量少
- ✅ 直接使用 Claude CLI 的 `--output-format json/stream-json`
- ✅ 输出结构化，易于解析
- ✅ 符合 OpenAI 格式规范

**缺点**:
- ❌ **不支持交互式功能** - 无法利用 Claude CLI 的工具调用能力
- ❌ **参数映射受限** - OpenAI 参数无法完全映射到 CLI 参数
- ❌ **无法传递复杂上下文** - 多轮对话需要手动构建
- ❌ **无法使用系统提示词** - `--system-prompt` 需要特殊处理

**当前实现**:
```javascript
const child = spawn(config.CLAUDE_BIN, [
  '-p',
  '--output-format', stream ? 'stream-json' : 'json',
  '--verbose',
  '--include-partial-messages',
  '--no-session-persistence',
  '--model', model,
  '--tools', '',  // ❌ 禁用了所有工具
  '--dangerously-skip-permissions'
]);
```

---

### 方式 2: 终端模拟器方式（AgentAPI）

**核心思想**: 运行伪终端（PTY），将 API 调用转换为键盘输入，解析终端输出

```
HTTP Request → 转换为键盘输入 → PTY → Claude CLI (交互模式)
                                ↓
                         解析终端屏幕内容
                                ↓
                         提取消息内容
```

**架构图**:
```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ HTTP Client │ ───> │  HTTP Server │ ───> │   PTY       │
└─────────────┘      └──────────────┘      │   xpty      │
                            │             └─────────────┘
                            │                    │
                            ▼                    ▼
                     ┌──────────────┐      ┌─────────────┐
                     │ Screen       │ ───> │ Claude CLI  │
                     │ Tracker      │ <──> │ (TUI Mode)  │
                     └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Messages    │
                     │  API         │
                     └──────────────┘
```

**关键组件**:

1. **终端执行器** (`termexec/termexec.go`)
   - 使用 `xpty` 创建伪终端
   - 启动 Claude CLI 进程（默认交互模式）
   - 读写终端数据

2. **屏幕追踪器** (`screentracker/conversation.go`)
   - 持续截取终端屏幕内容（25ms 间隔）
   - 检测屏幕稳定性（48ms 无变化视为稳定）
   - 解析终端输出，提取消息内容

3. **消息格式化** (`httpapi/claude.go`)
   - 将用户消息转换为键盘输入序列
   - 使用 bracketed paste mode（`\x1b[200~` / `\x1b[201~`）
   - 去除 TUI 元素（输入框、用户输入回显等）

**优点**:
- ✅ **完整功能支持** - 可以使用 Claude CLI 的所有功能，包括工具调用
- ✅ **真正的多轮对话** - 保持会话状态，支持上下文
- ✅ **无需参数映射** - 直接通过终端交互
- ✅ **支持多个 agent** - 统一的接口支持 Claude、Aider、Goose 等

**缺点**:
- ❌ **实现复杂** - 需要终端模拟、屏幕解析等
- ❌ **脆弱性** - 依赖 TUI 布局，CLI 更新可能破坏解析
- ❌ **非标准输出** - 需要从终端屏幕提取内容，格式不固定
- ❌ **资源占用** - 需要持续运行和屏幕监控

**核心代码示例**:

```go
// 启动进程（termexec/termexec.go:37-55）
func StartProcess(ctx context.Context, args StartProcessConfig) (*Process, error) {
    xp, err := xpty.New(args.TerminalWidth, args.TerminalHeight, false)
    execCmd := exec.Command(args.Program, args.Args...)
    execCmd.Env = append(os.Environ(), "TERM=vt100")
    xp.StartProcessInTerminal(execCmd)

    // 持续读取终端输出
    go func() {
        for {
            r, _, err := pp.ReadRune()
            xp.Term.WriteRune(r)  // 更新终端状态
            process.lastScreenUpdate = clock.Now()
        }
    }()
}

// 发送消息（screentracker/conversation.go:376-410）
func (c *Conversation) SendMessage(messageParts ...MessagePart) error {
    // 1. 等待屏幕稳定
    screenBeforeMessage := c.cfg.AgentIO.ReadScreen()

    // 2. 写入键盘输入
    ExecuteParts(c.cfg.AgentIO, messageParts...)

    // 3. 等待处理开始
    util.WaitFor(ctx, func() bool {
        screen := c.cfg.AgentIO.ReadScreen()
        return screen != screenBeforeMessage
    })

    // 4. 保存用户消息
    c.messages = append(c.messages, ConversationMessage{
        Message: message,
        Role:    ConversationRoleUser,
    })
}

// 截取新消息（screentracker/conversation.go:160-206）
func FindNewMessage(oldScreen, newScreen string, agentType msgfmt.AgentType) string {
    oldLines := strings.Split(oldScreen, "\n")
    newLines := strings.Split(newScreen, "\n")

    // 找到第一个不同的行
    firstNonMatchingLine := len(newLines)
    for i, line := range newLines {
        if !oldLinesMap[line] {
            firstNonMatchingLine = i
            break
        }
    }

    // 返回新增内容
    return strings.Join(newLines[firstNonMatchingLine:], "\n")
}
```

---

## 🎯 API 接口对比

### 当前项目（OpenAI 兼容）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | OpenAI 格式聊天接口 |
| `/v1/models` | GET | 列出模型 |
| `/health` | GET | 健康检查 |

**请求格式**:
```json
{
  "model": "sonnet",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true
}
```

**特点**:
- ✅ OpenAI 标准格式
- ✅ 支持流式和非流式
- ❌ 无状态（每次请求独立）
- ❌ 不支持工具调用

### AgentAPI（专有格式）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/message` | POST | 发送消息 |
| `/messages` | GET | 获取对话历史 |
| `/status` | GET | 获取状态（stable/running） |
| `/events` | GET | SSE 事件流 |

**请求格式**:
```json
{
  "content": "Hello, agent!",
  "type": "user"  // 或 "raw"
}
```

**特点**:
- ✅ 有状态（保持会话）
- ✅ 支持工具调用
- ✅ 实时事件流
- ❌ 非 OpenAI 格式

---

## 💡 关键差异分析

### 1. 会话管理

| 特性 | 当前项目 | AgentAPI |
|------|----------|----------|
| 会话状态 | ❌ 无状态 | ✅ 有状态 |
| 多轮对话 | ❌ 每次独立 | ✅ 保持上下文 |
| 对话历史 | ❌ 不保存 | ✅ 自动保存 |
| 恢复会话 | ❌ 不支持 | ✅ 支持 |

**AgentAPI 实现**:
```go
type Conversation struct {
    messages []ConversationMessage  // 保存所有消息
    screenBeforeLastUserMessage string  // 用于提取新内容
    lock sync.Mutex
}
```

### 2. 工具调用支持

| 特性 | 当前项目 | AgentAPI |
|------|----------|----------|
| Bash 工具 | ❌ 禁用 | ✅ 完整支持 |
| Edit 工具 | ❌ 禁用 | ✅ 完整支持 |
| 文件操作 | ❌ 禁用 | ✅ 完整支持 |
| 自定义工具 | ❌ 不支持 | ✅ 支持 |

**AgentAPI 优势**:
- 通过终端交互，Claude CLI 可以使用所有工具
- 工具调用会显示在终端输出中
- 自动检测和记录工具调用

### 3. 消息格式化

**当前项目**:
```javascript
// 直接发送最后一条用户消息
let prompt = userMessages.pop().content;
child.stdin.write(prompt);
```

**AgentAPI**:
```go
// 使用 bracketed paste mode
func formatClaudeCodeMessage(message string) []MessagePart {
    return []MessagePart{
        MessagePartText{Content: "\x1b[200~", Hidden: true},  // 开始
        MessagePartText{Content: message},
        MessagePartText{Content: "\x1b[201~", Hidden: true},  // 结束
    }
}

// 去除 TUI 元素
func FormatMessage(message string, userInput string) string {
    // 移除用户输入回显
    // 移除输入框等 TUI 元素
}
```

### 4. 输出解析

**当前项目**:
```javascript
// 直接解析 JSON 输出
const events = parseClaudeOutput(stdout);
const reply = extractAssistantReply(events);
```

**AgentAPI**:
```go
// 从终端屏幕提取内容
func FindNewMessage(oldScreen, newScreen string) string {
    // 1. 比较两个屏幕快照
    // 2. 找到新增的行
    // 3. 去除空白行
    // 4. 返回新消息
}
```

---

## 🔧 实现复杂度对比

| 组件 | 当前项目 | AgentAPI | 复杂度差异 |
|------|----------|----------|-----------|
| 进程管理 | ✅ spawn() | ✅ xpty + spawn() | AgentAPI 多 PTY 层 |
| 输入处理 | ✅ stdin | ✅ 键盘序列 + bracketed paste | AgentAPI 更复杂 |
| 输出解析 | ✅ JSON 解析 | ⚠️ 屏幕快照 + 文本 diff | AgentAPI 复杂得多 |
| 状态管理 | ❌ 不需要 | ✅ 屏幕稳定性检测 | AgentAPI 独有 |
| 消息提取 | ✅ 直接提取 | ⚠️ TUI 元素过滤 | AgentAPI 需要处理 |
| 代码行数 | ~450 行 | ~2000+ 行 | AgentAPI 4-5 倍 |

---

## 📈 功能对比总结

### OpenAI 兼容性

| 功能 | 当前项目 | AgentAPI | 说明 |
|------|----------|----------|------|
| OpenAI 格式 | ✅ 完整 | ❌ 不支持 | 当前项目优势 |
| 流式输出 | ✅ 支持 | ✅ 支持（SSE） | 两者都支持 |
| 多轮对话 | ⚠️ 需手动 | ✅ 自动 | AgentAPI 优势 |
| 工具调用 | ❌ 不支持 | ✅ 完整支持 | AgentAPI 优势 |

### Claude CLI 功能利用

| 功能 | 当前项目 | AgentAPI | 利用率 |
|------|----------|----------|--------|
| 工具调用 | ❌ 禁用 | ✅ 100% | AgentAPI 完胜 |
| 系统提示词 | ⚠️ 需添加 | ✅ 自动 | AgentAPI 更好 |
| 会话持久化 | ❌ 禁用 | ✅ 支持 | AgentAPI 优势 |
| 多文件操作 | ❌ 不支持 | ✅ 支持 | AgentAPI 优势 |
| 交互式功能 | ❌ 不支持 | ✅ 支持 | AgentAPI 优势 |

---

## 💭 结论与建议

### 适用场景

**选择当前项目（CLI 参数方式）如果**:
- ✅ 需要 OpenAI 标准格式
- ✅ 简单的问答场景
- ✅ 不需要工具调用
- ✅ 追求实现简单

**选择 AgentAPI（终端模拟方式）如果**:
- ✅ 需要完整的 Claude CLI 功能
- ✅ 需要工具调用（文件操作、代码执行等）
- ✅ 需要多轮对话和会话管理
- ✅ 可以接受非标准 API 格式

### 改进建议

#### 对于当前项目

1. **保持现有架构** - CLI 参数方式更适合 OpenAI 兼容
2. **补充核心功能**:
   ```javascript
   // 1. 支持系统提示词
   if (messages.find(m => m.role === 'system')) {
     args.push('--system-prompt', systemMessage.content);
   }

   // 2. 支持多轮对话（构建完整上下文）
   const conversation = messages
     .filter(m => ['user', 'assistant'].includes(m.role))
     .map(m => `${m.role}: ${m.content}`)
     .join('\n');
   ```

3. **考虑混合模式**:
   - 默认：CLI 参数方式（OpenAI 兼容）
   - 可选：添加 `/agent` 路由（终端模拟方式，完整功能）

#### 参考 AgentAPI 的设计

1. **屏幕稳定性检测** - 如果使用终端模式
2. **消息格式化** - bracketed paste mode
3. **TUI 元素过滤** - 如果需要解析终端输出

---

## 🔗 参考资料

- **AgentAPI 仓库**: https://github.com/coder/agentapi
- **xpty 库**: https://github.com/ActiveState/termtest
- **当前项目**: ../server.js

---

**最后更新**: 2026-02-04
**状态**: 分析完成
