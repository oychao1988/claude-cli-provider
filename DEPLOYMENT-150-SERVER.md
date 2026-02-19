# Claude CLI Provider - 150服务器部署文档

## 📋 部署信息

- **服务器**: 150.158.88.23
- **部署路径**: `/root/apps/claude-cli-provider`
- **对外端口**: `18050`
- **部署方式**: Docker Compose
- **部署时间**: 2025-02-19

## ✅ 服务状态

| 项目 | 状态 |
|------|------|
| 容器状态 | ✅ 运行中 (healthy) |
| 健康检查 | ✅ 正常 |
| API 测试 | ✅ 通过 |
| 流式输出 | ✅ 正常 |
| 非流式输出 | ✅ 正常 |

## 🔑 认证配置

**API Key**: `99a0c4b380196ab636f7144b1c9a846c23d3948e408f51d22ac7947c3c78fe6a`

**Claude API 配置**:
- `ANTHROPIC_AUTH_TOKEN`: `691e0b8f617b42ac9de843e1b7b4b184.Izvs63hQcFwXnsqy`
- `ANTHROPIC_BASE_URL`: `https://api.z.ai/api/anthropic`
- 配置文件: `/root/.claude/settings.json`

## 🌐 API 端点

### 基础信息
- **Base URL**: `http://150.158.88.23:18050`
- **OpenAI 兼容路径**: `/v1/chat/completions`
- **健康检查**: `http://150.158.88.23:18050/health`
- **指标接口**: `http://150.158.88.23:18050/metrics`

### 测试示例

#### 1. 健康检查
```bash
curl http://150.158.88.23:18050/health
```

#### 2. 非流式请求
```bash
curl -X POST http://150.158.88.23:18050/v1/chat/completions \
  -H "Authorization: Bearer 99a0c4b380196ab636f7144b1c9a846c23d3948e408f51d22ac7947c3c78fe6a" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 100,
    "stream": false,
    "messages": [
      {"role": "user", "content": "请用一句话介绍你自己"}
    ]
  }'
```

#### 3. 流式请求
```bash
curl -X POST http://150.158.88.23:18050/v1/chat/completions \
  -H "Authorization: Bearer 99a0c4b380196ab636f7144b1c9a846c23d3948e408f51d22ac7947c3c78fe6a" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 100,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

## 🔧 Docker 管理命令

### 查看容器状态
```bash
ssh 150.158.88.23-root "docker ps | grep claude-cli-provider"
```

### 查看日志
```bash
ssh 150.158.88.23-root "docker logs claude-cli-provider --tail 50"
```

### 实时监控日志
```bash
ssh 150.158.88.23-root "docker logs claude-cli-provider --tail 100 -f"
```

### 重启服务
```bash
ssh 150.158.88.23-root "cd /root/apps/claude-cli-provider && docker compose -f docker-compose.prod.yml restart"
```

### 停止服务
```bash
ssh 150.158.88.23-root "cd /root/apps/claude-cli-provider && docker compose -f docker-compose.prod.yml down"
```

### 启动服务
```bash
ssh 150.158.88.23-root "cd /root/apps/claude-cli-provider && docker compose -f docker-compose.prod.yml up -d"
```

### 重新构建并启动
```bash
ssh 150.158.88.23-root "cd /root/apps/claude-cli-provider && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d"
```

## 🐛 故障排查

### 问题 1: API 返回认证错误
**解决方案**: 确保请求头包含正确的 API Key
```bash
-H "Authorization: Bearer 99a0c4b380196ab636f7144b1c9a846c23d3948e408f51d22ac7947c3c78fe6a"
```

### 问题 2: 容器无法启动
**检查步骤**:
1. 查看容器状态: `docker ps -a | grep claude-cli-provider`
2. 查看容器日志: `docker logs claude-cli-provider`
3. 检查配置文件: `cat /root/apps/claude-cli-provider/docker-compose.prod.yml`

### 问题 3: API 响应慢或超时
**可能原因**:
- Claude API 网络问题
- 服务器资源不足
- Docker 资源限制

**检查命令**:
```bash
# 检查容器资源使用
docker stats claude-cli-provider

# 检查服务器资源
ssh 150.158.88.23-root "free -h && df -h"
```

## 📊 监控指标

访问 `http://150.158.88.23:18050/metrics` 查看性能指标（需要 API Key）:
```bash
curl -H "Authorization: Bearer 99a0c4b380196ab636f7144b1c9a846c23d3948e408f51d22ac7947c3c78fe6a" \
  http://150.158.88.23:18050/metrics | jq .
```

## 🔐 安全建议

1. **生产环境建议**:
   - 使用 HTTPS（配置 Nginx 反向代理）
   - 定期更换 API Key
   - 配置防火墙规则限制访问
   - 启用请求速率限制

2. **Nginx 反向代理配置示例**:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:18050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📝 更新日志

### 2025-02-19
- ✅ 初始部署完成
- ✅ 修复 Docker 容器中 spawn 进程的变量遮蔽问题
- ✅ 配置 API 认证
- ✅ 测试通过（流式/非流式）
- ✅ 添加生产环境 docker-compose 配置

## 📧 技术支持

如有问题请联系：
- 项目仓库: https://github.com/oychao1988/claude-cli-provider
- Issue 跟踪: https://github.com/oychao1988/claude-cli-provider/issues
