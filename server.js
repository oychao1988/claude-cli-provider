#!/usr/bin/env node

/**
 * Claude CLI HTTP Server
 *
 * 将 claude CLI 包装为 OpenAI 兼容的 HTTP API
 * 支持环境变量配置、API 认证、日志系统、优雅关闭
 *
 * 启动: node server.js
 * 默认: http://0.0.0.0:3912
 */

import express from 'express';
import { spawn } from 'node:child_process';

// ============ 环境变量配置 ============
const config = {
  PORT: process.env.PORT || 3912,
  HOST: process.env.HOST || '0.0.0.0',
  CLAUDE_BIN: process.env.CLAUDE_BIN || 'claude',
  API_KEY: process.env.API_KEY || '',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// ============ 日志系统 ============
const logger = {
  debug: (...args) => config.LOG_LEVEL === 'debug' && console.error('[DEBUG]', ...args),
  info: (...args) => ['info', 'debug'].includes(config.LOG_LEVEL) && console.error('[INFO]', ...args),
  warn: (...args) => console.error('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

const app = express();
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

/**
 * 解析 claude CLI 的 JSON 输出
 * 输出可能是 JSON 数组字符串或换行分隔的 JSON 对象
 */
function parseClaudeOutput(raw) {
  const trimmed = raw.trim();

  // 尝试直接解析为 JSON 数组
  try {
    const parsed = JSON.parse(trimmed);
    // 如果是嵌套数组，展平它
    if (Array.isArray(parsed)) {
      // 检查是否是嵌套数组 [[...]]
      if (parsed.length === 1 && Array.isArray(parsed[0])) {
        return parsed[0];
      }
      return parsed;
    }
  } catch (e) {
    // 不是单一 JSON 对象，尝试按行解析
  }

  // 按行解析 JSON
  const events = [];
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) {
        // 处理嵌套数组情况
        if (parsed.length === 1 && Array.isArray(parsed[0])) {
          events.push(...parsed[0]);
        } else {
          events.push(...parsed);
        }
      } else {
        events.push(parsed);
      }
    } catch (e) {
      console.error('[parse] Failed on line:', line.substring(0, 100));
    }
  }
  return events;
}

// ============ API Key 认证中间件 ============
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') ||
                 req.headers['x-api-key'];

  if (!config.API_KEY) {
    // 未配置 API Key，跳过认证（开发环境）
    logger.debug('API Key not configured, skipping authentication');
    return next();
  }

  if (apiKey !== config.API_KEY) {
    logger.warn(`Authentication failed from ${req.ip}`);
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error'
      }
    });
  }

  logger.debug('Authentication successful');
  next();
}

/**
 * 从事件数组中提取 assistant 的文本回复
 */
function extractAssistantReply(events) {
  for (const event of events) {
    if (event.type === 'assistant' && event.message?.content) {
      const textBlocks = event.message.content.filter(c => c.type === 'text');
      if (textBlocks.length > 0) {
        return textBlocks.map(b => b.text).join('\n');
      }
    }
  }
  return null;
}

/**
 * POST /v1/chat/completions
 * OpenAI 兼容的聊天完成接口（支持流式和非流式）
 */
app.post('/v1/chat/completions', authenticateApiKey, async (req, res) => {
  try {
    const { messages, model = 'sonnet', stream = false } = req.body;

    logger.info(`Request received: model=${model}, messages=${messages?.length}, stream=${stream}`);

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    // 获取最后一条用户消息
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
      return res.status(400).json({ error: 'No user message found' });
    }

    let prompt = userMessages.pop().content;

    // 确保 prompt 是字符串
    if (typeof prompt !== 'string') {
      if (Array.isArray(prompt)) {
        // 处理内容数组（text + image 等）
        prompt = prompt
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('\n');
      } else {
        prompt = String(prompt || '');
      }
    }

    logger.debug(`Prompt: "${prompt.substring(0, 50)}..."`);

    // 构建 claude CLI 命令
    const args = [
      '-p',                           // print mode（非交互）
      '--output-format', 'json',      // JSON 输出格式
      '--no-session-persistence',     // 不保存会话
      '--model', model,               // 模型选择
      '--tools', '',                  // 禁用工具
      '--dangerously-skip-permissions' // 跳过权限检查
    ];

    const startTime = Date.now();

    // 执行 claude CLI
    const child = spawn(config.CLAUDE_BIN, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // 发送用户输入
    child.stdin.write(prompt);
    child.stdin.end();

    // 等待命令完成
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    const duration = Date.now() - startTime;
    logger.info(`Claude CLI completed in ${duration}ms, exit=${exitCode}`);

    if (exitCode !== 0) {
      logger.error(`Claude CLI stderr: ${stderr}`);
      return res.status(500).json({
        error: {
          message: `Claude CLI failed with exit code ${exitCode}`,
          type: 'claude_cli_error'
        }
      });
    }

    // 解析输出
    const events = parseClaudeOutput(stdout);
    const reply = extractAssistantReply(events);

    if (!reply) {
      logger.error(`No reply found in ${events.length} events`);
      return res.status(500).json({
        error: {
          message: 'Failed to extract reply from claude CLI',
          type: 'parse_error',
          events: events.slice(0, 3) // 调试信息
        }
      });
    }

    // 流式响应
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const created = Math.floor(Date.now() / 1000);
      const id = `chatcmpl-${Date.now()}`;

      // 发送初始 chunk
      sendSSEChunk(res, {
        id,
        object: 'chat.completion.chunk',
        created,
        model: `claude-${model}`,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null
        }]
      });

      // 分块发送内容
      const chunkSize = 20; // 每次发送的字符数
      for (let i = 0; i < reply.length; i += chunkSize) {
        const chunk = reply.slice(i, i + chunkSize);
        sendSSEChunk(res, {
          id,
          object: 'chat.completion.chunk',
          created,
          model: `claude-${model}`,
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null
          }]
        });
      }

      // 发送完成 chunk
      sendSSEChunk(res, {
        id,
        object: 'chat.completion.chunk',
        created,
        model: `claude-${model}`,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      });

      // 发送 usage
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(reply.length / 4);
      sendSSEChunk(res, {
        id,
        object: 'chat.completion.chunk',
        created,
        model: `claude-${model}`,
        choices: [],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        }
      });

      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // 非流式响应
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: `claude-${model}`,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: reply
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: Math.ceil(prompt.length / 4),
          completion_tokens: Math.ceil(reply.length / 4),
          total_tokens: Math.ceil((prompt.length + reply.length) / 4)
        }
      });
    }

  } catch (error) {
    logger.error('Server error:', error);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'internal_error'
      }
    });
  }
});

/**
 * 发送 SSE chunk
 */
function sendSSEChunk(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /health
 * 健康检查端点（无需认证）
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'claude-cli-provider',
    version: '1.0.0',
    claude_bin: config.CLAUDE_BIN,
    auth_enabled: !!config.API_KEY
  });
});

/**
 * GET /v1/models
 * 列出可用模型
 */
app.get('/v1/models', authenticateApiKey, (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'sonnet', name: 'Claude Sonnet (via CLI)' },
      { id: 'opus', name: 'Claude Opus (via CLI)' },
      { id: 'haiku', name: 'Claude Haiku (via CLI)' }
    ]
  });
});

// ============ 启动服务器 ============
const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(`✅ Claude CLI Provider Server running`);
  logger.info(`   URL: http://${config.HOST}:${config.PORT}`);
  logger.info(`   Health: http://${config.HOST}:${config.PORT}/health`);
  logger.info(`   Environment: ${config.NODE_ENV}`);
  logger.info(`   Using: ${config.CLAUDE_BIN}`);
  logger.info(`   API Authentication: ${config.API_KEY ? 'enabled' : 'disabled'}`);

  if (!config.API_KEY && config.NODE_ENV === 'production') {
    logger.warn('⚠️  Running in production without API_KEY authentication!');
  }
});

// ============ 优雅关闭 ============
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // 强制关闭超时
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
