# API 使用指南

> **版本**: 1.0.0
> **创建日期**: 2026-02-05
> **状态**: ✅ 已实施
> **适用对象**: 开发者、用户
> **最后更新**: 2026-02-05

---

## 概述

本指南介绍如何使用 Claude CLI Provider 的 OpenAI 兼容 API。

## Overview

The Claude CLI Provider provides an OpenAI-compatible API that translates OpenAI requests to Claude CLI commands. It supports two modes:

- **CLI Mode (OpenAI-Compatible)**: Stateless request/response using Claude CLI's print mode
- **PTY Mode (Agent)**: Full Claude Code experience with tool use (coming in Phase 3)

## Base URL

By default, the server runs on:
```
http://localhost:3000
```

## Authentication

Currently, the server does not require authentication. Make sure to secure it properly when deploying to production.

## Supported Endpoints

### POST /v1/chat/completions

Create a chat completion request.

**Request Body:**

```json
{
  "model": "sonnet",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Hello, how are you?" }
  ],
  "stream": true,
  "max_tokens": 1000,
  "stop": ["\n\n", "END"]
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model to use: `sonnet`, `opus`, or `haiku` |
| `messages` | array | Yes | Array of message objects |
| `stream` | boolean | No | Enable streaming (default: `true`) |
| `max_tokens` | number | No | Maximum tokens to generate (post-processing) |
| `stop` | array | No | Stop sequences (post-processing) |

**Unsupported Parameters (Logged as Warnings):**

The following parameters are accepted but will be ignored with a warning log:
- `temperature` - Claude CLI does not support temperature control
- `top_p` - Claude CLI does not support top-p sampling
- `presence_penalty` - Claude CLI does not support presence penalties
- `frequency_penalty` - Claude CLI does not support frequency penalties

**Response (Non-Streaming):**

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-sonnet",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 12,
    "total_tokens": 22
  }
}
```

**Response (Streaming):**

Streaming responses use Server-Sent Events (SSE) format:

```
data: {"id":"chatcmpl-1234567890","object":"chat.completion.chunk","created":1234567890,"model":"claude-sonnet","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-1234567890","object":"chat.completion.chunk","created":1234567890,"model":"claude-sonnet","choices":[{"index":0,"delta":{"content":"Hello!"},"finish_reason":null}]}

data: {"id":"chatcmpl-1234567890","object":"chat.completion.chunk","created":1234567890,"model":"claude-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: {"id":"chatcmpl-1234567890","object":"chat.completion.chunk","created":1234567890,"model":"claude-sonnet","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":12,"total_tokens":22}}

data: [DONE]
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "healthy",
  "adapter": "cli",
  "stats": {
    "cliProcesses": 0,
    "ptyProcesses": 0,
    "total": 0,
    "limit": 10
  }
}
```

## Message Format

Messages follow the OpenAI format:

```json
{
  "role": "user | system | assistant",
  "content": "string"
}
```

### System Messages

System messages are extracted and passed to Claude CLI using the `--system-prompt` flag:

```json
{
  "model": "sonnet",
  "messages": [
    { "role": "system", "content": "You are a helpful coding assistant" },
    { "role": "user", "content": "Write a Python function" }
  ]
}
```

### Multi-Turn Conversations

The provider maintains conversation context by building a formatted conversation string:

```json
{
  "model": "sonnet",
  "messages": [
    { "role": "user", "content": "What is Python?" },
    { "role": "assistant", "content": "Python is a programming language." },
    { "role": "user", "content": "How do I install it?" }
  ]
}
```

This is converted to:
```
user: What is Python?
assistant: Python is a programming language.
user: How do I install it?
```

## Features

### System Prompts

System messages are properly handled and passed to Claude CLI:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant" },
      { "role": "user", "content": "Hello!" }
    ]
  }'
```

### Multi-Turn Conversations

Conversation context is preserved across turns:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      { "role": "user", "content": "My name is Alice" },
      { "role": "assistant", "content": "Nice to meet you, Alice!" },
      { "role": "user", "content": "What is my name?" }
    ]
  }'
```

### max_tokens

Limit the maximum tokens in the response (post-processing):

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      { "role": "user", "content": "Tell me a long story" }
    ],
    "max_tokens": 50
  }'
```

**Note:** This is implemented as post-processing truncation (1 token ≈ 4 characters).

### Stop Sequences

Stop generation when encountering specific sequences:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      { "role": "user", "content": "List three fruits" }
    ],
    "stop": ["\n\n", "END"]
  }'
```

Stop sequences are checked in both streaming and non-streaming modes.

## Examples

### Basic Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      { "role": "user", "content": "Hello, how are you?" }
    ]
  }'
```

### Streaming Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      { "role": "user", "content": "Tell me a joke" }
    ],
    "stream": true
  }'
```

### Using with OpenAI Python Client

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dummy"  # Not used but required by client
)

response = client.chat.completions.create(
    model="sonnet",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello!"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Using with OpenAI JavaScript Client

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'dummy' // Not used but required by client
});

const stream = await client.chat.completions.create({
  model: 'sonnet',
  messages: [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello!' }
  ],
  stream: true
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

## Error Handling

Errors are returned in OpenAI format:

```json
{
  "error": {
    "message": "Invalid messages format",
    "type": "validation_error",
    "code": null
  }
}
```

Common error types:
- `validation_error`: Invalid request parameters
- `claude_cli_error`: Claude CLI process error
- `process_error`: Process management error

## Rate Limiting

The provider has a maximum concurrent process limit (default: 10). When the limit is reached, new requests will be rejected with a process error.

## Token Estimation

Token usage is estimated using a simple approximation:
- **1 token ≈ 4 characters**

This is a rough estimate and may not match Claude's actual tokenization.

## Model Mapping

OpenAI model names are mapped to Claude models:

| OpenAI Model | Claude Model |
|--------------|--------------|
| `sonnet` | Claude Sonnet |
| `opus` | Claude Opus |
| `haiku` | Claude Haiku |

The response includes the prefixed model name: `claude-sonnet`.

## Limitations

### CLI Mode (Current)

- **No Tool Use**: Tools are disabled in CLI mode (`--tools ''`)
- **No Image Support**: Vision capabilities are not supported
- **Limited Streaming**: Streaming is implemented via SSE, not native
- **Post-Processing**: `max_tokens` and `stop` are applied after generation

### Coming in PTY Mode (Phase 3)

- Full tool use support (Bash, Write, Read, etc.)
- Native streaming experience
- Interactive terminal session
- Complete Claude Code feature parity

## Best Practices

1. **Always include error handling** when making requests
2. **Use streaming** for long responses to improve perceived latency
3. **Set appropriate `max_tokens`** to limit response length
4. **Use stop sequences** for structured outputs
5. **Monitor health endpoint** to check process pool status
6. **Handle rate limiting** gracefully when process limit is reached

## Troubleshooting

### "Maximum process limit reached"

The provider has reached its concurrent process limit. Wait for existing requests to complete or increase the limit in configuration.

### "Claude CLI process failed"

Check that:
- Claude CLI is installed and accessible
- `CLAUDE_BIN` environment variable is set correctly
- You have proper permissions to run Claude CLI

### Streaming stops unexpectedly

This could be due to:
- Stop sequence match
- Max tokens limit reached
- Claude CLI process error

Check the server logs for details.

## Support

For issues and questions:
- Check the [Design Documentation](../design/README.md)
- Review the [Architecture Overview](../architecture/README.md)
- See the [Deployment Guide](./deployment-guide.md)
