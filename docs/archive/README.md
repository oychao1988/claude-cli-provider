# 归档文档

> **版本**: 1.0.0
> **最后更新**: 2026-02-04
> **说明**: 本目录包含历史文档和临时记录，供参考使用

本目录用于归档历史文档、临时记录和过时文档。

---

## 📂 目录结构

```
archive/
├── phases/                    # 阶段性归档
│   ├── phase-1/              # 第1阶段文档
│   └── phase-2/              # 第2阶段文档
├── sessions/                 # 会话归档
│   ├── 2026-02-03-session-1/ # 按日期归档
│   └── 2026-02-04-session-2/
└── reports/                  # 历史报告归档
    ├── analysis-report-*.md
    └── summary-*.md
```

---

## 📋 归档说明

### 当前归档

| 目录 | 用途 | 状态 |
|------|------|------|
| `phases/` | 阶段性归档 | ✅ 已创建 |
| `sessions/` | 会话归档 | ✅ 已创建 |
| `reports/` | 历史报告归档 | ✅ 已创建 |
| `deployment-legacy.md` | 旧版部署文档 | ✅ 已归档 |

### phases/ - 阶段性归档

用于存放项目各阶段完成后归档的设计文档和总结报告。

**归档时机**：
- 阶段性功能全部完成并稳定运行
- 相关文档不再频繁更新
- 进入新的开发阶段

**示例**：
```
archive/phases/phase-1/
├── workflow-scaffolding.md
├── streaming-output.md
└── completion-report.md
```

### sessions/ - 会话归档

用于存放临时会话记录、分析报告和临时文档。

**归档时机**：
- 临时分析完成
- 会话结束
- 文档不再活跃

**示例**：
```
archive/sessions/2026-02-04-session-1/
├── analysis-report.md
├── temp-notes.md
└── session-summary.md
```

### reports/ - 历史报告归档

用于存放过时的项目报告和分析文档。

**归档时机**：
- 报告内容已过时
- 新版本报告已发布
- 仅供历史参考

**示例**：
```
archive/reports/
├── analysis-report-2026-02-03.md
└── weekly-summary-2026-02-03.md
```

---

## 📌 归档原则

1. **保留价值**：归档不是删除，保留历史记录
2. **清晰组织**：按类型和时间组织文档
3. **添加说明**：每个归档应包含归档说明
4. **定期清理**：定期检查和清理无价值的归档

---

## 🔍 查找归档文档

### 按时间查找

```bash
# 查找某日的会话归档
ls archive/sessions/2026-02-*/

# 查找某月的报告
ls archive/reports/*2026-02*
```

### 按类型查找

```bash
# 查找所有阶段归档
ls archive/phases/*/

# 查找所有分析报告
ls archive/reports/analysis-*
```

---

**返回**: [主文档目录](../README.md)
