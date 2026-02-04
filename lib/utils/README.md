# Utilities

This directory contains shared utility functions and classes used across the application.

## Components

### Logger (`logger.js`)

Unified logging system with multiple levels:
- `debug(message, meta)` - Debug messages
- `info(message, meta)` - Informational messages
- `warn(message, meta)` - Warning messages
- `error(message, meta)` - Error messages

Configurable via `LOG_LEVEL` environment variable.

### Errors (`errors.js`)

Custom error classes for better error handling:
- `ClaudeCLIError` - Base error class
- `ProcessError` - Process-related errors
- `ValidationError` - Input validation errors

## Usage

```javascript
import { logger, ClaudeCLIError } from './lib/utils/index.js';

// Logging
logger.info('Processing request', { requestId: '123' });
logger.error('Process failed', { error: err.message });

// Error handling
throw new ProcessError('Claude CLI process exited with code 1');
```

## Design Principles

- Consistent interface - uniform API across components
- Configurable - environment-based settings
- Structured logging - metadata support for better debugging
