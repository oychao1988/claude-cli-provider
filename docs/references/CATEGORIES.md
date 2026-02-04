# 文档分类定义

> **版本**: 1.0.0
> **创建日期**: 2026-02-04
> **适用范围**: Claude CLI Provider 项目

本文档定义了项目文档管理系统中各个分类的用途和文档类型。

---

## 📋 分类概览

| 分类 | 目录路径 | 用途 | 主要受众 |
|------|---------|------|----------|
| **设计文档** | `design/` | 功能设计和系统设计 | 开发者、架构师 |
| **使用指南** | `guides/` | 用户操作文档 | 用户、运维 |
| **架构文档** | `architecture/` | 技术架构和系统设计 | 开发者、架构师 |
| **开发相关** | `development/` | 开发计划和总结 | 开发者 |
| **技术参考** | `references/` | 工具使用和技术参考 | 所有角色 |
| **项目报告** | `reports/` | 里程碑完成报告 | 项目管理者、利益相关者 |
| **归档文档** | `archive/` | 历史文档和临时记录 | 维护者 |

---

## 🎨 design/ - 设计文档

### 用途
存放功能设计和技术设计文档，包括已实施和待实施的设计。

### 文档类型
- 功能设计文档（`<功能名>-design.md`）
- 代码示例（`<功能名>-example.<ext>`）
- 技术方案设计

### 命名规范
```
<功能名>-design.md        # 设计文档
<功能名>-example.ts       # TypeScript 示例
<功能名>-example.js       # JavaScript 示例
```

### 状态管理
设计文档采用**双重标记机制**：
1. **README.md 状态表**：使用 ✅/❌ 符号标记实施状态
2. **文档内元数据**：版本、日期、状态信息

### 示例
```
design/
├── workflow-scaffolding-design.md    # 已实施 ✅
├── streaming-output-design.md        # 已实施 ✅
└── multi-session-design.md           # 待实施 ❌
```

---

## 📚 guides/ - 使用指南

### 用途
面向最终用户的操作文档和使用指南。

### 文档类型
- 快速开始指南（`quick-start.md`）
- 用户手册（`user-guide.md`）
- 部署指南（`deployment-guide.md`）
- 功能使用指南（`<功能名>-guide.md`）

### 命名规范
```
quick-start.md              # 快速开始（固定命名）
user-guide.md               # 用户手册（固定命名）
deployment-guide.md         # 部署指南
<功能名>-guide.md          # 功能使用指南
```

### 示例
```
guides/
├── deployment-guide.md             # 部署指南 ✅
├── quick-start.md                  # 快速开始（待创建）
└── api-usage-guide.md              # API 使用指南（待创建）
```

---

## 🏗️ architecture/ - 架构文档

### 用途
系统架构设计和技术架构文档。

### 文档类型
- 系统架构图
- 技术栈说明
- 数据流设计
- 模块设计文档

### 命名规范
```
system-architecture.md              # 系统架构
data-flow.md                        # 数据流设计
module-<模块名>.md                  # 模块设计
```

### 示例
```
architecture/
├── system-architecture.md          # 系统架构（待创建）
├── api-design.md                   # API 设计（待创建）
└── security-design.md              # 安全设计（待创建）
```

---

## 💻 development/ - 开发相关

### 用途
开发计划和总结文档。

### 文档类型
- 开发计划（`<功能名>-PLAN.md`）
- 开发总结（`<功能名>-SUMMARY.md`）
- 技术债务记录
- 重构计划

### 命名规范
```
<功能名>-PLAN.md                    # 开发计划
<功能名>-SUMMARY.md                 # 开发总结
tech-debt.md                        # 技术债务
refactoring-<功能名>.md             # 重构计划
```

### 示例
```
development/
├── stage-1-PLAN.md                 # 阶段1计划（待创建）
└── api-refactoring-SUMMARY.md      # API重构总结（待创建）
```

---

## 📖 references/ - 技术参考

### 用途
工具使用、技术参考和管理规范文档。

### 文档类型
- 文档管理规范（本文档所在分类）
- 生命周期管理
- 模板文档
- 工具使用指南

### 命名规范
```
CATEGORIES.md                       # 分类定义（本文档）
LIFECYCLE.md                        # 生命周期管理
TEMPLATES.md                        # 文档模板
<工具名>-reference.md               # 工具参考
```

### 示例
```
references/
├── CATEGORIES.md                   # 分类定义 ✅
├── LIFECYCLE.md                    # 生命周期管理 ✅
└── TEMPLATES.md                    # 文档模板 ✅
```

---

## 📊 reports/ - 项目报告

### 用途
里程碑完成报告和项目总结报告。

### 文档类型
- 阶段完成报告（`<阶段>-COMPLETION-REPORT.md`）
- 项目总结报告
- 里程碑报告

### 命名规范
```
<阶段>-COMPLETION-REPORT.md         # 阶段完成报告
milestone-<编号>-report.md          # 里程碑报告
project-summary.md                  # 项目总结
```

### 示例
```
reports/
├── STAGE-1-COMPLETION-REPORT.md    # 阶段1完成报告（待创建）
└── milestone-1-report.md           # 里程碑报告（待创建）
```

---

## 📦 archive/ - 归档文档

### 用途
历史文档、临时记录和过时文档的归档。

### 子目录结构
```
archive/
├── phases/                         # 阶段性归档
│   ├── phase-1/                    # 第1阶段文档
│   └── phase-2/                    # 第2阶段文档
├── sessions/                       # 会话归档
│   ├── 2026-02-03-session-1/       # 按日期归档
│   └── 2026-02-04-session-2/
└── reports/                        # 历史报告归档
    ├── analysis-report-2026-02-03.md
    └── summary-2026-02-03.md
```

### 归档原则
1. **过时文档**：已实施且不再活跃的设计文档
2. **临时文档**：分析报告、临时总结
3. **历史记录**：旧版本文档

---

## 🔄 文档生命周期

```
设计阶段 → 实施阶段 → 完成归档
   ↓           ↓           ↓
design/  → 对应目录  → archive/
(❌待实施)  (✅已实施)   (历史记录)
```

详细说明请参考 [LIFECYCLE.md](LIFECYCLE.md)。

---

## 📝 文档元数据规范

所有文档应包含以下元数据：

```markdown
> **版本**: 1.0.0
> **创建日期**: 2026-02-04
> **状态**: 设计阶段，待实施
> **适用对象**: 开发者
```

### 状态说明
- **设计阶段，待实施** - 设计文档，功能未实现
- **开发中** - 正在实施
- **已完成** - 功能已实现并测试
- **已归档** - 历史文档

---

## 🎯 使用建议

### 对于新功能
1. 在 `design/` 创建设计文档
2. 在 README.md 中添加状态表条目（❌ 待实施）
3. 实施完成后更新状态（✅ 已实施）
4. 根据需要转移到其他目录或保留在 `design/`

### 对于整理文档
1. 删除临时文档和分析报告
2. 将历史文档归档到 `archive/`
3. 更新所有 README.md 中的引用
4. 验证 `design/` 中的实施状态

### 对于维护文档
1. 定期检查和更新状态标记
2. 保持元数据信息准确
3. 为已实施功能添加实现文件信息
4. 及时归档过时文档

---

## 📌 注意事项

1. **清晰分类**：按文档用途而非时间分类
2. **状态同步**：README.md 状态表与文档内元数据保持一致
3. **完整生命周期**：从设计到归档的完整流程
4. **用户友好**：提供按角色的文档推荐
5. **设计文档特殊处理**：已实施与未实施可共存于 `design/`

---

## 🔗 相关文档

- [生命周期管理](LIFECYCLE.md)
- [文档模板](TEMPLATES.md)
- [主 README](../README.md)
