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
- `isHealthy()` - Health check

## Usage

```javascript
import CLIAdapter from './lib/adapters/cli-adapter.js';

const adapter = new CLIAdapter(config);
const response = await adapter.processRequest(request);
```

## Notes

- CLI Adapter: Stateless, creates new process per request
- PTY Adapter: Stateful, maintains persistent sessions (future)
