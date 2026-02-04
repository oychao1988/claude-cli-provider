# 混合模式实施计划

> **创建日期**: 2026-02-04
> **状态**: 进行中
> **当前分支**: feature/hybrid-mode-implementation
> **目标**: 根据设计文档实现混合模式架构

---

## 📋 任务概述

根据 `docs/design/hybrid-mode-design.md` 设计文档，将现有的 Claude CLI Provider 从单一 OpenAI 兼容模式改造为混合模式架构。

### 核心目标

1. ✅ 保持向后兼容 - 现有 OpenAI API 不变
2. ✅ 添加 Agent 模式 - 支持完整的工具调用
3. ✅ 代码模块化 - 清晰的组件分离
4. ✅ 功能增强 - 支持系统提示词和多轮对话

---

## 🚀 阶段划分

### ✅ 阶段 0: 准备工作 [已完成]
- **目标**: 创建开发分支和实施计划
- **任务**:
  - [x] 创建 feature 分支: `feature/hybrid-mode-implementation`
  - [x] 推送到远程仓库
  - [x] 创建任务列表
  - [x] 准备实施计划文档
- **完成时间**: 2026-02-04
- **执行结果**: 分支创建成功，任务列表已生成

---

### ✅ 阶段 1: 基础重构 [已完成]

**目标**: 建立模块化的代码结构，重构现有代码

**预计时间**: 2-3 天
**实际时间**: 1 天
**完成时间**: 2026-02-04

#### 任务清单

##### 1. 创建 lib/ 目录结构 ✅
- [x] 创建目录：
  ```
  lib/
  ├── adapters/
  ├── formatters/
  ├── claude/
  └── utils/
  ```
- [x] 创建 package.json 导出配置（type: module）
- [x] 添加各目录的 README.md 说明文件

**验收标准**:
- ✅ 目录结构完整
- ✅ 可以从 lib/ 导入模块

##### 2. 实现共享基础组件 ✅

**2.1 MessageFormatter** (`lib/formatters/message-formatter.js`)
- [x] 实现 `formatForCLI(messages)` - 格式化 OpenAI messages 为 CLI 输入
- [x] 实现 `formatForPTY(content)` - 格式化为 bracketed paste mode
- [x] 实现 `stripUIElements(text, userInput)` - 移除 TUI 元素
- [x] 实现 `isTUIElement(line)` - 检测 TUI 元素
- [x] 单元测试 (28 个测试)

**2.2 ResponseTransformer** (`lib/formatters/response-transformer.js`)
- [x] 实现 `toOpenAIFormat(events, model, stream)` - 转换为 OpenAI 格式
- [x] 实现 `toSSEChunk(content, model)` - 生成 SSE chunk
- [x] 实现 `extractContent(events)` - 提取内容
- [x] 实现 `detectToolCalls(text)` - 检测工具调用
- [x] 实现 `diff(oldScreen, newScreen)` - 屏幕差异检测
- [x] 单元测试 (29 个测试)

**2.3 Logger** (`lib/utils/logger.js`)
- [x] 实现结构化日志
- [x] 支持日志级别（error, warn, info, debug）
- [x] 支持格式化输出
- [x] 单元测试 (12 个测试)

**2.4 Errors** (`lib/utils/errors.js`)
- [x] 定义自定义错误类
- [x] 实现错误码映射
- [x] 错误格式化工具
- [x] 单元测试 (14 个测试)

**验收标准**:
- ✅ 所有组件有完整的单元测试
- ✅ 测试覆盖率 > 80% (核心组件 95%+)
- ✅ 代码符合 ESLint 规范

##### 3. 重构现有代码到 CLI Adapter ✅

**3.1 提取现有逻辑** (`lib/adapters/cli-adapter.js`)
- [x] 从 `server.js` 提取 chat/completions 路由逻辑
- [x] 封装为 `CLIAdapter` 类 (446 行)
- [x] 使用 `MessageFormatter` 和 `ResponseTransformer`
- [x] 保持 API 兼容性

**3.2 更新 server.js** ✅
- [x] 导入 `logger` 和 `openaiRoutes`
- [x] 替换内联逻辑为模块化调用
- [x] 验证现有功能不受影响

**验收标准**:
- ✅ 所有现有测试通过
- ✅ API 行为完全一致
- ✅ server.js 从 450 行减少到 155 行

##### 4. 实现 Claude Process Manager ✅

**4.1 基础实现** (`lib/claude/process-manager.js`)
- [x] 实现 `ClaudeProcessManager` 类 (400 行)
- [x] 实现 `createCLIProcess(options)` - CLI 模式进程
- [x] 实现 `cleanup(processId)` - 清理单个进程
- [x] 实现 `cleanupAll()` - 清理所有进程
- [x] 实现 `generateId()` - 生成唯一 ID
- [x] 实现 `getStats()` - 获取统计信息
- [x] 实现 `healthCheck()` - 健康检查
- [x] 实现 `gracefulShutdown()` - 优雅关闭

**4.2 错误处理**
- [x] 进程启动失败处理
- [x] 进程超时处理
- [x] 资源泄漏检测

**4.3 单元测试**
- [x] 进程创建测试 (11 个测试)
- [x] 进程清理测试
- [x] 错误处理测试

**验收标准**:
- ✅ 进程管理功能正常
- ✅ 资源清理无泄漏
- ✅ 错误处理完善

##### 5. 运行测试并验证功能 ✅

- [x] 运行所有单元测试 (94 个测试,100% 通过)
- [x] 检查代码覆盖率 (核心组件 > 80%)
- [x] 验证服务器启动
- [x] 验证路由配置

**验收标准**:
- ✅ 所有测试通过 (94/94)
- ✅ 代码覆盖率 > 80% (核心组件 95%+)
- ✅ 现有 API 功能无回归
- ✅ 性能无明显下降

**阶段 1 完成标准**:
- ✅ 目录结构清晰，代码模块化
- ✅ 现有功能完全保持
- ✅ 测试覆盖率达标
- ✅ 文档完整

---

### ⏳ 阶段 2: OpenAI 模式增强 [待开始]

**目标**: 增强 OpenAI 兼容模式，支持更多参数

**预计时间**: 1-2 天

#### 任务清单

##### 1. 支持系统提示词
- [ ] 从 messages 中提取 system 消息
- [ ] 使用 `--system-prompt` 参数
- [ ] 测试系统提示词生效

##### 2. 支持多轮对话上下文
- [ ] 构建对话历史字符串
- [ ] 测试上下文传递

##### 3. 支持 max_tokens 后处理
- [ ] 实现内容截断逻辑
- [ ] 添加 token 估算

##### 4. 支持 stop 序列
- [ ] 实现 stop 序列检测
- [ ] 测试 stop 功能

##### 5. 不支持参数的友好提示
- [ ] 检测不支持的参数
- [ ] 记录警告日志
- [ ] 返回友好错误信息

##### 6. 文档更新
- [ ] 更新 API 文档
- [ ] 添加参数支持列表
- [ ] 添加示例代码

**验收标准**:
- 系统提示词生效
- 多轮对话正常
- 参数警告日志正常
- 文档完整

---

### ⏳ 阶段 3: PTY 适配器实现 [待开始]

**目标**: 实现 PTY 适配器，支持交互模式

**预计时间**: 3-4 天

#### 任务清单

##### 1. 安装和配置 node-pty
- [ ] 安装 node-pty 和 uuid
- [ ] 配置构建环境
- [ ] 验证跨平台兼容性

##### 2. 实现 PTY Adapter
- [ ] 实现 `PTYAdapter` 类
- [ ] 实现进程创建
- [ ] 实现消息发送（bracketed paste mode）
- [ ] 实现屏幕捕获
- [ ] 实现稳定性检测

##### 3. 屏幕解析
- [ ] 实现屏幕快照
- [ ] 实现新内容提取
- [ ] 实现 TUI 元素过滤
- [ ] 实现工具调用检测

##### 4. 错误处理和重连
- [ ] PTY 进程崩溃处理
- [ ] 自动重启机制
- [ ] 会话恢复

##### 5. 单元测试
- [ ] PTY 创建测试
- [ ] 屏幕解析测试
- [ ] 工具调用检测测试

**验收标准**:
- PTY 进程正常启动
- 屏幕内容正确捕获
- 消息提取准确
- 工具调用检测正常

---

### ⏳ 阶段 4: Agent 接口实现 [待开始]

**目标**: 实现 Agent 模式的 API 接口

**预计时间**: 2-3 天

#### 任务清单

##### 1. 实现 SessionManager
- [ ] 会话创建和获取
- [ ] 消息历史管理
- [ ] 会话状态更新
- [ ] 会话清理（过期清理）

##### 2. 实现 Agent 路由
- [ ] `POST /v1/agent/chat` - 主聊天接口
- [ ] `GET /v1/agent/sessions` - 列出会话
- [ ] `GET /v1/agent/sessions/:id` - 获取会话详情
- [ ] `DELETE /v1/agent/sessions/:id` - 删除会话

##### 3. 实现 SSE 事件流
- [ ] 实现 status 事件
- [ ] 实现 message_delta 事件
- [ ] 实现 tool_call 事件
- [ ] 实现 tool_result 事件
- [ ] 实现 message_done 事件

##### 4. 集成测试
- [ ] Agent 模式端到端测试
- [ ] 工具调用测试
- [ ] 会话管理测试

**验收标准**:
- Agent 接口可用
- 会话管理正常
- 工具调用工作
- SSE 事件流正常

---

### ⏳ 阶段 5: 测试和优化 [待开始]

**目标**: 全面测试和性能优化

**预计时间**: 2-3 天

#### 任务清单

##### 1. 端到端测试
- [ ] OpenAI 模式完整测试
- [ ] Agent 模式完整测试
- [ ] 混合场景测试

##### 2. 性能测试
- [ ] 并发请求测试
- [ ] 内存占用测试
- [ ] 响应时间测试
- [ ] 进程池效率测试

##### 3. 错误处理完善
- [ ] 所有边界情况测试
- [ ] 错误信息优化
- [ ] 降级策略实现

##### 4. 日志和监控
- [ ] 结构化日志完善
- [ ] 性能指标收集
- [ ] 错误追踪

##### 5. 文档完善
- [ ] API 文档完整
- [ ] 部署文档更新
- [ ] 架构文档更新
- [ ] 示例代码

**验收标准**:
- 所有测试通过
- 性能满足要求
- 文档完整

---

### ⏳ 阶段 6: 部署和发布 [待开始]

**目标**: 部署到生产环境并发布版本

**预计时间**: 1 天

#### 任务清单

##### 1. 准备发布
- [ ] 更新版本号
- [ ] 更新 CHANGELOG
- [ ] 创建发布标签

##### 2. 创建 Pull Request
- [ ] 提交所有代码
- [ ] 创建 PR 到 main
- [ ] 代码审查

##### 3. 合并和部署
- [ ] 合并 PR
- [ ] 部署到生产环境
- [ ] 验证部署成功

##### 4. 发布公告
- [ ] GitHub Release
- [ ] 更新文档
- [ ] 通知用户

**验收标准**:
- 代码成功合并到 main
- 生产环境运行正常
- Release 发布成功

---

## 📊 整体进展

- **已完成阶段**: 2 / 6 (包括阶段 0 和阶段 1)
- **当前阶段**: 准备进入阶段 2
- **完成度**: 30%
- **状态**: ✅ 阶段 1 已完成

---

## 🔗 相关资源

- **设计文档**: `docs/design/hybrid-mode-design.md`
- **OpenAI 兼容性分析**: `docs/design/openai-compatibility-analysis.md`
- **AgentAPI 实现分析**: `docs/design/agentapi-implementation-analysis.md`
- **当前分支**: `feature/hybrid-mode-implementation`

---

## 📝 重要决策记录

### 决策 1: 为什么选择混合模式？
- **日期**: 2026-02-04
- **决策**: 采用方案 B（混合模式）而非纯 CLI 参数模式或纯 PTY 模式
- **理由**:
  - 保持 OpenAI 兼容性对现有用户友好
  - PTY 模式提供完整功能（工具调用）
  - 两种模式满足不同使用场景
  - 共享组件减少代码重复

### 决策 2: 为什么先重构而非直接添加功能？
- **日期**: 2026-02-04
- **决策**: 先进行代码重构，再添加新功能
- **理由**:
  - 模块化设计便于后续扩展
  - 避免技术债务累积
  - 提高代码可测试性
  - 降低新功能开发风险

---

## ⚠️ 风险和问题

### 当前风险

1. **node-pty 安装风险**
   - **状态**: 未验证
   - **缓解措施**: 阶段 3 提前测试，准备替代方案

2. **PTY 解析脆弱性**
   - **状态**: 未验证
   - **缓解措施**: 参考 AgentAPI 经验，充分测试

### 已知问题

- 无

---

## 📅 下一步行动

### 立即执行

1. ✅ 创建 `lib/` 目录结构
2. ⏳ 实现 `MessageFormatter` 组件
3. ⏳ 实现 `ResponseTransformer` 组件
4. ⏳ 重构现有代码到 `CLIAdapter`
5. ⏳ 实现 `ClaudeProcessManager`

### 即将开始

- 阶段 2: OpenAI 模式增强
- 阶段 3: PTY 适配器实现

---

**最后更新**: 2026-02-04
**更新人**: Claude Code
**当前状态**: 阶段 1 已完成,等待提交代码
**下次审查**: 提交代码后开始阶段 2
