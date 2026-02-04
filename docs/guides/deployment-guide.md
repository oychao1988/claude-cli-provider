# 部署指南 - Claude CLI Provider

> **版本**: 1.0.0
> **创建日期**: 2026-02-04
> **状态**: 已完成
> **适用对象**: 运维人员、开发者

本文档介绍如何将 claude-cli-provider 部署到生产服务器。

---

## 目录

1. [环境要求](#环境要求)
2. [配置说明](#配置说明)
3. [PM2 部署](#pm2-部署)
4. [Docker 部署](#docker-部署)
5. [Nginx 反向代理](#nginx-反向代理)
6. [健康检查](#健康检查)
7. [日志管理](#日志管理)
8. [故障排查](#故障排查)

---

## 环境要求

### 基础依赖

- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **Claude CLI**: 已全局安装 `@anthropic-ai/claude-code`

### PM2 部署额外要求

- PM2: `npm install -g pm2`

### Docker 部署额外要求

- Docker: >= 20.10
- Docker Compose: >= 2.0

---

## 配置说明

### 环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

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
# 使用 OpenSSL 生成随机密钥
openssl rand -hex 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## PM2 部署

### 安装 PM2

```bash
npm install -g pm2
```

### 配置环境变量

```bash
# 编辑 .env 文件
vim .env

# 或使用 export 设置环境变量
export API_KEY="your-secret-api-key-here"
export NODE_ENV=production
```

### 启动服务

```bash
# 使用 npm 脚本启动
npm run pm2:start

# 或直接使用 PM2
pm2 start ecosystem.config.cjs --env production
```

### 常用 PM2 命令

```bash
# 查看状态
npm run pm2:monit
# 或
pm2 status

# 查看日志
npm run pm2:logs
# 或
pm2 logs claude-cli-provider

# 重启服务
npm run pm2:restart
# 或
pm2 restart claude-cli-provider

# 停止服务
npm run pm2:stop
# 或
pm2 stop claude-cli-provider

# 开机自启动
pm2 startup
pm2 save
```

---

## Docker 部署

### 构建镜像

```bash
# 使用 npm 脚本
npm run docker:build

# 或手动构建
docker build -t claude-cli-provider .
```

### 配置环境变量

```bash
# 设置 API Key
export API_KEY="your-secret-api-key-here"

# 或在 docker-compose.yml 中配置
```

### 启动容器

```bash
# 使用 npm 脚本
API_KEY="your-secret-api-key-here" npm run docker:up

# 或使用 Docker Compose
API_KEY="your-secret-api-key-here" docker-compose up -d
```

### Docker 常用命令

```bash
# 查看日志
npm run docker:logs
# 或
docker-compose logs -f

# 停止容器
npm run docker:down
# 或
docker-compose down

# 重启容器
docker-compose restart

# 查看容器状态
docker-compose ps

# 进入容器
docker-compose exec claude-cli-provider sh
```

---

## Nginx 反向代理

### 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx

# macOS
brew install nginx
```

### 配置反向代理

1. 复制 Nginx 配置示例：

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/claude-cli-provider
```

2. 修改配置文件：

```bash
sudo vim /etc/nginx/sites-available/claude-cli-provider
```

将 `your-domain.com` 替换为你的实际域名。

3. 启用配置：

```bash
# Ubuntu/Debian
sudo ln -s /etc/nginx/sites-available/claude-cli-provider /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 配置 HTTPS（使用 Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 健康检查

### 检查端点

```bash
# 基本健康检查
curl http://localhost:3912/health

# 预期响应
{
  "status": "ok",
  "service": "claude-cli-provider",
  "version": "1.0.0",
  "claude_bin": "claude",
  "auth_enabled": true
}
```

### 测试流式输出

```bash
# 流式输出测试
curl -X POST http://localhost:3912/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"测试流式输出"}],"stream":true}'

# 非流式输出测试
curl -X POST http://localhost:3912/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"测试非流式输出"}],"stream":false}'
```

### 使用 systemd 监控（可选）

创建 `/etc/systemd/system/claude-cli-provider.service`：

```ini
[Unit]
Description=Claude CLI Provider
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/claude-cli-provider
ExecStart=/usr/bin/node /var/www/claude-cli-provider/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/var/www/claude-cli-provider/.env

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable claude-cli-provider
sudo systemctl start claude-cli-provider
sudo systemctl status claude-cli-provider
```

---

## 日志管理

### PM2 日志

```bash
# 实时查看日志
pm2 logs claude-cli-provider

# 查看错误日志
tail -f logs/error.log

# 查看输出日志
tail -f logs/out.log

# 清空日志
pm2 flush
```

### Docker 日志

```bash
# 查看容器日志
docker-compose logs -f

# 查看挂载的日志文件
tail -f logs/out.log
tail -f logs/error.log
```

### 日志轮转（使用 PM2）

PM2 默认会进行日志轮转，如需自定义：

```bash
# 安装 pm2-logrotate
pm2 install pm2-logrotate

# 配置
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## 故障排查

### 服务无法启动

**检查端口占用**：

```bash
# 查找占用端口的进程
lsof -i :3912

# 或使用 netstat
netstat -tulpn | grep 3912

# 终止占用进程
kill -9 <PID>
```

**检查 Claude CLI**：

```bash
# 确认 Claude CLI 已安装
which claude

# 测试运行
echo "test" | claude -p --output-format json
```

### API 返回 401 错误

**检查 API Key**：

```bash
# 确认 API_KEY 已设置
echo $API_KEY

# 测试请求（带认证）
curl -X POST http://localhost:3912/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"test"}]}'
```

### 流式输出不工作

**检查日志**：

```bash
# PM2
pm2 logs claude-cli-provider

# Docker
docker-compose logs
```

**测试 Claude CLI 流式功能**：

```bash
echo "测试" | claude -p --output-format stream-json --verbose
```

### Docker 容器无法访问

**检查容器状态**：

```bash
docker-compose ps
docker-compose logs
```

**重新构建镜像**：

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### PM2 进程频繁重启

**查看错误日志**：

```bash
pm2 logs claude-cli-provider --err
```

**检查配置**：

```bash
pm2 show claude-cli-provider
```

**调整重启限制**（修改 `ecosystem.config.cjs`）：

```javascript
max_restarts: 20,  // 增加重启次数
min_uptime: '30s', // 增加最小运行时间
```

---

## 生产环境检查清单

部署到生产环境前，请确认：

- [ ] 已设置强随机 `API_KEY`
- [ ] `NODE_ENV` 设置为 `production`
- [ ] `HOST` 设置为 `0.0.0.0`
- [ ] 日志级别设置为 `info` 或 `warn`
- [ ] 已配置 Nginx 反向代理
- [ ] 已启用 HTTPS（使用 Let's Encrypt）
- [ ] 已设置防火墙规则
- [ ] 已配置日志轮转
- [ ] 已设置监控告警
- [ ] 已测试优雅关闭（`kill -SIGTERM <pid>`）
- [ ] 已测试流式和非流式输出
- [ ] 已验证健康检查端点

---

## 安全建议

1. **API Key 认证** - 生产环境必须配置
2. **环境变量隔离** - 不要将 `.env` 提交到 Git
3. **HTTPS 加密** - 使用 Nginx 配置 SSL
4. **日志脱敏** - 避免记录敏感内容
5. **防火墙配置** - 限制访问来源
6. **定期更新** - 保持依赖和系统更新
7. **速率限制** - 考虑添加速率限制中间件
8. **CORS 控制** - 根据需要配置 CORS

---

## 性能优化

### PM2 集群模式

如果需要利用多核 CPU，可以修改 `ecosystem.config.cjs`：

```javascript
module.exports = {
  apps: [{
    name: 'claude-cli-provider',
    script: './server.js',
    instances: 'max',  // 使用所有 CPU 核心
    exec_mode: 'cluster',  // 集群模式
    // ... 其他配置
  }]
};
```

**注意**：由于每次请求都启动新的 Claude CLI 进程，集群模式可能会增加资源消耗。

### Docker 资源限制

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  claude-cli-provider:
    # ... 其他配置
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

## 参考资料

- [PM2 官方文档](https://pm2.keymetrics.io/)
- [Docker 官方文档](https://docs.docker.com/)
- [Nginx 官方文档](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
