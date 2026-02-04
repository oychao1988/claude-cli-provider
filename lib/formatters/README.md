# Formatters Layer

This directory contains utilities for formatting and transforming data between different formats.

## Components

### Message Formatter (`message-formatter.js`)

Converts between different message formats:
- OpenAI format → CLI input format
- OpenAI format → PTY bracketed paste format
- Strip TUI elements from terminal output

### Response Transformer (`response-transformer.js`)

Transforms Claude CLI output into API responses:
- Claude CLI events → OpenAI format
- Claude CLI events → Agent mode events
- Extract content and detect tool calls

## Usage

```javascript
import { MessageFormatter, ResponseTransformer } from './lib/formatters/index.js';

// Format messages for CLI
const { systemPrompt, conversation } = MessageFormatter.formatForCLI(messages);

// Transform response to OpenAI format
const openaiResponse = ResponseTransformer.toOpenAIFormat(events, model, true);
```

## Design Principles

- Pure functions - no side effects
- Format-agnostic - handle multiple input/output formats
- Testable - easy to unit test
