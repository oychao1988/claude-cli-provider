# Claude Process Management

This directory contains components for managing Claude CLI processes and sessions.

## Components

### Process Manager (`process-manager.js`)

Manages Claude CLI process lifecycle:
- Create CLI mode processes (for OpenAI adapter)
- Create PTY mode processes (for Agent adapter - future)
- Process pooling and cleanup
- Health monitoring

### Session Manager (`session-manager.js`)

Manages Agent mode sessions (planned):
- Create and retrieve sessions
- Message history tracking
- Session expiration and cleanup
- Multi-session support

## Usage

```javascript
import ProcessManager from './lib/claude/process-manager.js';

const manager = new ProcessManager();
const { process, processId } = manager.createCLIProcess({
  model: 'sonnet',
  stream: true,
  systemPrompt: 'You are a helper'
});

// Later cleanup
manager.cleanup(processId);
```

## Design Principles

- Resource management - prevent process leaks
- Graceful shutdown - clean up on exit
- Monitoring - track process health
- Pool limits - prevent resource exhaustion
