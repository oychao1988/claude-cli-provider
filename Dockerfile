FROM node:18-alpine

# 安装构建工具（node-pty 需要）
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    libgcc \
    libstdc++

# 使用淘宝 npm 镜像源加速
RUN npm config set registry https://registry.npmmirror.com

# 安装 Claude CLI（使用淘宝源）
RUN npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com

# 创建非 root 用户（设置 HOME 目录）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -h /home/nodejs -s /bin/sh nodejs

# 设置工作目录
WORKDIR /home/nodejs/app

# 复制依赖文件
COPY package*.json ./

# 安装依赖（使用淘宝源）
RUN npm ci --only=production --registry=https://registry.npmmirror.com

# 复制应用代码
COPY --chown=nodejs:nodejs . .

# 创建日志目录
RUN mkdir -p logs

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3912

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3912/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 启动服务
CMD ["node", "/home/nodejs/app/server.js"]
