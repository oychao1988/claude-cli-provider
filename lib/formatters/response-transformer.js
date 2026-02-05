/**
 * Response Transformer
 *
 * Transforms Claude CLI output into various API response formats.
 *
 * @example
 * import { ResponseTransformer } from './lib/formatters/response-transformer.js';
 * const openaiResponse = ResponseTransformer.toOpenAIFormat(events, 'sonnet', true);
 */

/**
 * Response transformation utility class
 */
class ResponseTransformer {
  /**
   * Transform Claude CLI events to OpenAI format
   *
   * @param {Array<Object>} events - Claude CLI output events
   * @param {string} model - Model name
   * @param {boolean} stream - Whether this is a streaming response
   * @returns {Object} OpenAI format response object
   *
   * @example
   * const events = [
   *   { type: 'result', subtype: 'success', result: 'Hello world' }
   * ];
   * const response = ResponseTransformer.toOpenAIFormat(events, 'sonnet', false);
   * // Returns: { id: 'chatcmpl-...', choices: [...], model: 'claude-sonnet', ... }
   */
  static toOpenAIFormat(events, model = 'sonnet', stream = false) {
    const content = this.extractContent(events);

    if (stream) {
      // For streaming, return a single chunk
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: `claude-${model}`,
        choices: [{
          index: 0,
          delta: { content },
          finish_reason: content ? null : 'stop'
        }]
      };
    } else {
      // Non-streaming response
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: `claude-${model}`,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: content || ''
          },
          finish_reason: 'stop'
        }],
        usage: this.estimateTokens(content)
      };
    }
  }

  /**
   * Transform Claude CLI events to Agent mode events
   * Used for PTY adapter with full feature support
   *
   * @param {string} screen - Current terminal screen content
   * @param {string} previousScreen - Previous terminal screen content
   * @returns {Object} Agent mode event object
   * @returns {Object} returns.message_delta - New content delta
   * @returns {Array} returns.tool_calls - Detected tool calls
   * @returns {string} returns.status - Current status
   *
   * @example
   * const events = ResponseTransformer.toAgentEvents(
   *   'Hello\nTool call: Write(...)',
   *   'Hello'
   * );
   * // Returns: { message_delta: {...}, tool_calls: [...], status: 'running' }
   */
  static toAgentEvents(screen, previousScreen = '') {
    const newContent = this.diff(previousScreen, screen);
    const toolCalls = this.detectToolCalls(newContent);
    const status = this.detectStatus(screen);

    return {
      message_delta: {
        content: newContent
      },
      tool_calls: toolCalls,
      status: status
    };
  }

  /**
   * Extract content from Claude CLI events
   *
   * @param {Array<Object>} events - Claude CLI output events
   * @returns {string|null} Extracted content or null
   *
   * @example
   * const events = [
   *   { type: 'result', subtype: 'success', result: 'Hello world' }
   * ];
   * const content = ResponseTransformer.extractContent(events);
   * // Returns: 'Hello world'
   */
  static extractContent(events) {
    if (!Array.isArray(events)) {
      return null;
    }

    for (const event of events) {
      // Support new format: result event
      if (event.type === 'result' && event.subtype === 'success' && event.result) {
        return event.result.trim();
      }
      // Support legacy format: assistant message
      if (event.type === 'assistant' && event.message?.content) {
        const textBlocks = event.message.content.filter(c => c.type === 'text');
        if (textBlocks.length > 0) {
          return textBlocks.map(b => b.text.trim()).join('\n');
        }
      }
      // Support partial messages (streaming)
      if (event.type === 'partial' && event.content) {
        return event.content.trim();
      }
    }

    return null;
  }

  /**
   * Detect tool calls in text
   * Parses Claude CLI tool call patterns
   *
   * @param {string} text - Text to search for tool calls
   * @returns {Array<Object>} Array of detected tool calls
   * @returns {string} returns[].tool - Tool name
   * @returns {string} returns[].input - Tool input (JSON string)
   *
   * @example
   * const text = 'Tool call: Write({"file_path": "test.txt", "content": "hello"})';
   * const calls = ResponseTransformer.detectToolCalls(text);
   * // Returns: [{ tool: 'Write', input: '{"file_path": "test.txt", "content": "hello"}' }]
   */
  static detectToolCalls(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Pattern: Tool call: ToolName(arguments)
    // This pattern matches Claude CLI's tool call format
    const toolCallPattern = /Tool call:\s*(\w+)\s*\((.*)\)/g;
    const calls = [];
    let match;

    while ((match = toolCallPattern.exec(text)) !== null) {
      const toolName = match[1];
      const argumentsStr = match[2];

      calls.push({
        tool: toolName,
        input: argumentsStr,
        raw: match[0] // Full match for reference
      });
    }

    return calls;
  }

  /**
   * Detect status from screen content
   *
   * @param {string} screen - Terminal screen content
   * @returns {string} Status: 'running', 'stable', 'error', 'input'
   *
   * @example
   * const status = ResponseTransformer.detectStatus('Thinking...\nLoading...');
   * // Returns: 'running'
   */
  static detectStatus(screen) {
    if (!screen || typeof screen !== 'string') {
      return 'stable';
    }

    const lowerScreen = screen.toLowerCase();

    // Check for error indicators
    if (lowerScreen.includes('error') || lowerScreen.includes('failed')) {
      return 'error';
    }

    // Check for running indicators
    if (lowerScreen.includes('thinking') ||
        lowerScreen.includes('loading') ||
        lowerScreen.includes('processing') ||
        lowerScreen.includes('working')) {
      return 'running';
    }

    // Check for input prompt
    if (screen.includes('> ') || screen.trim().endsWith('>')) {
      return 'input';
    }

    // Default to stable
    return 'stable';
  }

  /**
   * Compute difference between two screen states
   * Returns new content that wasn't in the previous screen
   *
   * @param {string} oldScreen - Previous screen content
   * @param {string} newScreen - Current screen content
   * @returns {string} New content (lines that are in newScreen but not oldScreen)
   *
   * @example
   * const diff = ResponseTransformer.diff('Hello', 'Hello\nWorld');
   * // Returns: 'World'
   */
  static diff(oldScreen, newScreen) {
    if (!newScreen) return '';
    if (!oldScreen) return newScreen;

    const oldLines = oldScreen.split('\n');
    const newLines = newScreen.split('\n');
    const oldLinesSet = new Set(oldLines);

    // Find lines that are in newScreen but not in oldScreen
    const addedLines = newLines.filter(line => !oldLinesSet.has(line));

    return addedLines.join('\n').trim();
  }

  /**
   * Truncate content to fit within max_tokens limit
   * Uses simple character-based estimation (1 token ≈ 4 characters)
   *
   * @param {string} content - Content to truncate
   * @param {number} maxTokens - Maximum tokens allowed
   * @returns {string} Truncated content
   *
   * @example
   * const truncated = ResponseTransformer.truncateContent('Hello world', 2);
   * // Returns: 'Hello wor' (approximately 8 chars ≈ 2 tokens)
   */
  static truncateContent(content, maxTokens) {
    if (!maxTokens || !content) {
      return content;
    }

    // Rough approximation: ~4 characters per token
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) {
      return content;
    }

    // Truncate at word boundary if possible
    let truncated = content.substring(0, maxChars);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    if (lastSpaceIndex > maxChars * 0.8) {
      // Truncate at last space if it's within 80% of limit
      truncated = truncated.substring(0, lastSpaceIndex);
    }

    return truncated;
  }

  /**
   * Estimate token count from text
   * Rough approximation: ~4 characters per token
   *
   * @param {string} text - Text to estimate tokens for
   * @returns {Object} Token count object
   *
   * @example
   * const usage = ResponseTransformer.estimateTokens('Hello world');
   * // Returns: { prompt_tokens: 0, completion_tokens: 3, total_tokens: 3 }
   */
  static estimateTokens(text) {
    if (!text) {
      return {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      };
    }

    // Rough approximation: ~4 characters per token
    const tokenCount = Math.ceil(text.length / 4);

    return {
      prompt_tokens: 0, // Will be calculated from input
      completion_tokens: tokenCount,
      total_tokens: tokenCount
    };
  }

  /**
   * Parse Claude CLI raw output into structured events
   * Handles various output formats from Claude CLI
   *
   * @param {string} raw - Raw output string from Claude CLI
   * @returns {Array<Object>} Array of parsed events
   *
   * @example
   * const raw = '{"type":"result","result":"Hello"}';
   * const events = ResponseTransformer.parseClaudeOutput(raw);
   * // Returns: [{ type: 'result', result: 'Hello' }]
   */
  static parseClaudeOutput(raw) {
    const trimmed = raw.trim();

    // Try parsing as single JSON object/array
    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        // Handle nested array case
        if (parsed.length === 1 && Array.isArray(parsed[0])) {
          return parsed[0];
        }
        return parsed;
      }
      // Handle single object with result field
      else if (typeof parsed === 'object' && parsed !== null) {
        return [parsed];
      }
    } catch (e) {
      // Not a single JSON, try line-by-line parsing
    }

    // Parse line by line
    const events = [];
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          // Handle nested arrays
          if (parsed.length === 1 && Array.isArray(parsed[0])) {
            events.push(...parsed[0]);
          } else {
            events.push(...parsed);
          }
        } else {
          events.push(parsed);
        }
      } catch (e) {
        // Skip invalid lines
        console.error('[ResponseTransformer] Failed to parse line:', line.substring(0, 100));
      }
    }

    return events;
  }

  /**
   * Create SSE (Server-Sent Events) chunk for streaming
   *
   * @param {Object} data - Data to serialize
   * @returns {string} SSE formatted string
   *
   * @example
   * const chunk = ResponseTransformer.toSSEChunk({ content: 'Hello' });
   * // Returns: 'data: {"content":"Hello"}\n\n'
   */
  static toSSEChunk(data) {
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * Create SSE done marker
   *
   * @returns {string} SSE done marker
   */
  static toSSEDone() {
    return 'data: [DONE]\n\n';
  }
}

export { ResponseTransformer };
