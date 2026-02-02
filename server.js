#!/usr/bin/env node

/**
 * Claude CLI HTTP Server - MVP
 *
 * 最简实现：将 claude CLI 包装为 OpenAI 兼容的 HTTP API
 *
 * 启动: node server.js
 * 默认: http://127.0.0.1:3912
 */

import express from 'express';
import { spawn } from 'node:child_process';

const PORT = 3912;
const CLAUDE_BIN = 'claude';

const app = express();
app.use(express.json());

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
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model = 'sonnet', stream = false } = req.body;

    console.error(`[incoming] Request received: model=${model}, messages=${messages?.length}, stream=${stream}`);

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

    console.error(`[claude] model=${model}, prompt="${prompt.substring(0, 50)}..."`);

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
    const child = spawn(CLAUDE_BIN, args);
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
    console.error(`[claude] completed in ${duration}ms, exit=${exitCode}`);

    if (exitCode !== 0) {
      console.error(`[claude] stderr: ${stderr}`);
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
      console.error(`[claude] No reply found in ${events.length} events`);
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
    console.error('[server] Error:', error);
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
 * 健康检查端点
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'claude-cli-provider',
    version: '1.0.0-mvp',
    claude_bin: CLAUDE_BIN
  });
});

/**
 * GET /v1/models
 * 列出可用模型
 */
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'sonnet', name: 'Claude Sonnet (via CLI)' },
      { id: 'opus', name: 'Claude Opus (via CLI)' },
      { id: 'haiku', name: 'Claude Haiku (via CLI)' }
    ]
  });
});

// 启动服务器
app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Claude CLI Provider Server running`);
  console.log(`   URL: http://127.0.0.1:${PORT}`);
  console.log(`   Health: http://127.0.0.1:${PORT}/health`);
  console.log(`   Using: ${CLAUDE_BIN}`);
  console.log(`\n📝 Example curl:`);
  console.log(`   curl -X POST http://127.0.0.1:${PORT}/v1/chat/completions \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"model":"sonnet","messages":[{"role":"user","content":"2+2=?"}]}'`);
});
