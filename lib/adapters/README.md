# Adapters Layer

This directory contains adapter implementations for different modes of interacting with Claude CLI.

## Purpose

Adapters abstract the differences between various Claude CLI invocation modes:
- **CLI Adapter** (`cli-adapter.js`) - Uses command-line arguments mode (`-p` flag) for OpenAI compatibility
- **PTY Adapter** (`pty-adapter.js`) - Uses pseudo-terminal for full feature support (planned)

## Architecture

```
Adapters Layer
    ├── CLI Adapter (OpenAI compatible mode)
    └── PTY Adapter (Agent mode - future)
         │
         ▼
    Shared Components
```

## Base Adapter Interface

All adapters should implement a common interface:
- `processRequest(request)` - Process a request and return a response
- `cleanup()` - Clean up resources
- `healthCheck()` - Health check

## CLI Adapter

The CLI Adapter provides OpenAI-compatible API access to Claude CLI.

### Features

#### Supported Parameters

- `model` - Model selection (sonnet, opus, haiku)
- `messages` - Message array with system, user, and assistant roles
- `stream` - Enable streaming responses (default: true)
- `max_tokens` - Maximum tokens to generate (post-processing truncation)
- `stop` - Stop sequences to halt generation

#### System Prompts

System messages are extracted from the messages array and passed to Claude CLI using the `--system-prompt` flag:

```javascript
const request = {
  model: 'sonnet',
  messages: [
    { role: 'system', content: 'You are a helpful coding assistant' },
    { role: 'user', content: 'Write a Python function' }
  ]
};
```

#### Multi-Turn Conversations

The adapter maintains conversation context by building a formatted conversation string:

```javascript
const request = {
  model: 'sonnet',
  messages: [
    { role: 'user', content: 'What is Python?' },
    { role: 'assistant', content: 'Python is a programming language.' },
    { role: 'user', content: 'How do I install it?' }
  ]
};
```

This is converted to:
```
user: What is Python?
assistant: Python is a programming language.
user: How do I install it?
```

#### max_tokens Implementation

The `max_tokens` parameter is implemented as post-processing truncation:
- Uses character-based estimation (1 token ≈ 4 characters)
- Truncates content at word boundaries when possible
- Applied in both streaming and non-streaming modes

In streaming mode, the process is terminated when the limit is reached.

#### Stop Sequences

Stop sequences are checked after each content chunk:
- Supports multiple stop sequences
- Checked against the accumulated response
- In streaming mode, process is terminated when match is found
- In non-streaming mode, content is truncated at first match

#### Unsupported Parameters

The following OpenAI parameters are not supported by Claude CLI:
- `temperature` - Logged as warning, ignored
- `top_p` - Logged as warning, ignored
- `presence_penalty` - Logged as warning, ignored
- `frequency_penalty` - Logged as warning, ignored

These parameters are accepted for API compatibility but will generate warning messages in the server logs.

### Request/Response Flow

```
1. Validate request (messages format)
2. Extract system prompt and build conversation
3. Warn about unsupported parameters
4. Create Claude CLI process with system prompt
5. Send conversation to stdin
6. Process stdout (streaming or non-streaming)
7. Apply max_tokens truncation (if specified)
8. Apply stop sequences (if specified)
9. Transform to OpenAI format response
10. Clean up process
```

### Usage

```javascript
import { CLIAdapter } from './lib/adapters/cli-adapter.js';

const adapter = new CLIAdapter({
  claudeBin: 'claude',
  maxProcesses: 10
});

// Streaming request
const response = await adapter.processRequest({
  model: 'sonnet',
  messages: [
    { role: 'system', content: 'You are helpful' },
    { role: 'user', content: 'Hello!' }
  ],
  stream: true,
  max_tokens: 1000,
  stop: ['\n\n']
});

if (response.type === 'stream') {
  for await (const chunk of response.generator) {
    if (chunk.type === 'data') {
      // SSE chunk
      console.log(chunk.data);
    } else if (chunk.type === 'done') {
      // Stream complete
      break;
    }
  }
}
```

### Configuration

```javascript
const adapter = new CLIAdapter({
  claudeBin: 'claude',  // Path to Claude CLI binary
  maxProcesses: 10      // Maximum concurrent processes
});
```

### Process Management

The CLI Adapter uses the ProcessManager to handle Claude CLI processes:
- Creates a new process for each request
- Tracks active processes with unique IDs
- Cleans up processes after completion
- Enforces maximum concurrent process limit
- Graceful shutdown on adapter cleanup

## PTY Adapter (Planned)

Future implementation for full Claude Code experience:
- Pseudo-terminal for interactive sessions
- Complete tool use support
- Native streaming capabilities
- Stateful conversation management

## Notes

- **CLI Adapter**: Stateless, creates new process per request
- **PTY Adapter**: Stateful, maintains persistent sessions (future)
- **Token Estimation**: Uses 1 token ≈ 4 characters approximation
- **Error Handling**: All errors are returned in OpenAI-compatible format
