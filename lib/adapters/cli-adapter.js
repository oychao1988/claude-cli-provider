/**
 * CLI Adapter
 *
 * Adapts OpenAI-compatible requests to Claude CLI command-line mode.
 * Uses non-interactive mode (-p flag) for stateless request handling.
 *
 * @example
 * import CLIAdapter from './lib/adapters/cli-adapter.js';
 * const adapter = new CLIAdapter({ claudeBin: 'claude' });
 * const response = await adapter.processRequest(request);
 */

import { MessageFormatter, ResponseTransformer } from '../formatters/index.js';
import { ProcessManager } from '../claude/index.js';
import { logger, ValidationError, AdapterError } from '../utils/index.js';

/**
 * CLI Adapter for OpenAI-compatible API
 */
class CLIAdapter {
  /**
   * Create a new CLIAdapter
   * @param {Object} config - Configuration
   * @param {string} config.claudeBin - Path to Claude CLI binary
   * @param {number} config.maxProcesses - Maximum concurrent processes
   */
  constructor(config = {}) {
    this.claudeBin = config.claudeBin || process.env.CLAUDE_BIN || 'claude';
    this.processManager = new ProcessManager({
      claudeBin: this.claudeBin,
      maxProcesses: config.maxProcesses
    });

    logger.info('CLIAdapter initialized', {
      claudeBin: this.claudeBin
    });
  }

  /**
   * Process an OpenAI chat completion request
   *
   * @param {Object} request - Request object
   * @param {Array<Object>} request.messages - Messages array
   * @param {string} request.model - Model name
   * @param {boolean} request.stream - Enable streaming
   * @param {number} request.max_tokens - Maximum tokens to generate
   * @param {Array<string>} request.stop - Stop sequences
   * @param {Object} request.options - Additional options
   * @returns {Promise<Object>} Response object
   *
   * @example
   * const response = await adapter.processRequest({
   *   messages: [{ role: 'user', content: 'Hello' }],
   *   model: 'sonnet',
   *   stream: true
   * });
   */
  async processRequest(request) {
    const {
      messages,
      model = 'sonnet',
      stream = true,
      max_tokens: maxTokens,
      stop: stopSequences
    } = request;

    logger.info('CLIAdapter processing request', {
      model,
      messagesCount: messages?.length,
      stream,
      maxTokens,
      stopSequences
    });

    // Warn about unsupported parameters
    const unsupportedParams = [
      'temperature',
      'top_p',
      'presence_penalty',
      'frequency_penalty'
    ];

    for (const param of unsupportedParams) {
      if (request[param] !== undefined) {
        logger.warn(`Parameter '${param}' is not supported by Claude CLI and will be ignored`, {
          parameter: param,
          value: request[param]
        });
      }
    }

    // Validate messages
    const validation = MessageFormatter.validateMessages(messages);
    if (!validation.valid) {
      throw new ValidationError('Invalid messages format', {
        errors: validation.errors
      });
    }

    // Extract system prompt and build conversation context
    const { systemPrompt, conversation } = MessageFormatter.formatForCLI(messages);

    // Use conversation instead of just the last user message
    const prompt = conversation;

    if (!prompt) {
      throw new ValidationError('No user message found', {
        messages
      });
    }

    logger.debug('Extracted conversation', {
      length: prompt.length,
      preview: prompt.substring(0, 100),
      hasSystemPrompt: !!systemPrompt
    });

    // Create Claude CLI process
    const { process, processId } = this.processManager.createCLIProcess({
      model,
      stream,
      systemPrompt,
      skipPermissions: true
    });

    logger.debug('Claude CLI process created', {
      processId,
      pid: process.pid
    });

    // Send user input
    try {
      process.stdin.write(prompt);
      process.stdin.end();
    } catch (error) {
      this.processManager.cleanup(processId, 'cli');
      throw new AdapterError('Failed to write to process stdin', {
        processId,
        error: error.message
      });
    }

    // Handle response based on stream mode
    if (stream) {
      return this.handleStreamResponse(process, processId, model, prompt, maxTokens, stopSequences);
    } else {
      return this.handleNonStreamResponse(process, processId, model, prompt, maxTokens, stopSequences);
    }
  }

  /**
   * Handle streaming response from Claude CLI
   *
   * @param {ChildProcess} process - Claude CLI process
   * @param {string} processId - Process ID
   * @param {string} model - Model name
   * @param {string} prompt - Original prompt
   * @param {number} maxTokens - Maximum tokens to generate
   * @param {Array<string>} stopSequences - Stop sequences
   * @returns {Object} Stream response object with async generator
   *
   * @private
   */
  async handleStreamResponse(process, processId, model, prompt, maxTokens, stopSequences) {
    const created = Math.floor(Date.now() / 1000);
    const id = `chatcmpl-${Date.now()}`;

    // Create async generator for streaming
    const streamGenerator = this.createStreamGenerator(process, processId, model, id, created, prompt, maxTokens, stopSequences);

    return {
      type: 'stream',
      generator: streamGenerator,
      processId
    };
  }

  /**
   * Create async generator for streaming chunks
   *
   * @param {ChildProcess} process - Claude CLI process
   * @param {string} processId - Process ID
   * @param {string} model - Model name
   * @param {string} id - Response ID
   * @param {number} created - Creation timestamp
   * @param {string} prompt - Original prompt for token estimation
   * @param {number} maxTokens - Maximum tokens to generate
   * @param {Array<string>} stopSequences - Stop sequences
   * @returns {AsyncGenerator} Async generator yielding SSE chunks
   *
   * @private
   */
  async *createStreamGenerator(process, processId, model, id, created, prompt, maxTokens, stopSequences) {
    let fullReply = '';
    let stderr = '';
    let stopped = false;

    // Send initial chunk
    yield {
      type: 'data',
      data: {
        id,
        object: 'chat.completion.chunk',
        created,
        model: `claude-${model}`,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null
        }]
      }
    };

    // Collect stderr
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Check stop sequences
    const checkStopSequences = (content) => {
      if (!stopSequences || stopSequences.length === 0) return false;
      for (const seq of stopSequences) {
        if (content.endsWith(seq)) {
          return true;
        }
      }
      return false;
    };

    // Process stdout in real-time
    const chunks = [];
    const processStream = new Promise((resolve, reject) => {
      process.stdout.on('data', (data) => {
        if (stopped) return; // Don't process if already stopped

        const lines = data.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            logger.debug('Claude CLI event', { event, processId });

            let content = '';
            if (event.type === 'result' && event.subtype === 'success' && event.result) {
              content = event.result;
            } else if (event.type === 'assistant' && event.message?.content) {
              const textBlocks = event.message.content.filter(c => c.type === 'text');
              if (textBlocks.length > 0) {
                content = textBlocks.map(b => b.text).join('\n');
              }
            } else if (event.type === 'partial' && event.content) {
              content = event.content;
            }

            if (content) {
              // Check max_tokens limit
              if (maxTokens) {
                const currentLength = fullReply.length;
                const maxChars = maxTokens * 4;
                if (currentLength + content.length > maxChars) {
                  // Truncate content to fit within limit
                  content = content.substring(0, maxChars - currentLength);
                  stopped = true;
                }
              }

              fullReply += content;

              // Check stop sequences
              if (checkStopSequences(fullReply)) {
                stopped = true;
              }

              chunks.push({
                type: 'data',
                data: {
                  id,
                  object: 'chat.completion.chunk',
                  created,
                  model: `claude-${model}`,
                  choices: [{
                    index: 0,
                    delta: { content },
                    finish_reason: null
                  }]
                }
              });

              // Kill process if stopped
              if (stopped) {
                process.kill('SIGTERM');
                break;
              }
            }
          } catch (e) {
            logger.debug('Failed to parse line', { line: line.substring(0, 100) });
          }
        }
      });

      process.on('close', (exitCode) => {
        if (exitCode !== 0) {
          logger.error('Claude CLI process failed', {
            processId,
            exitCode,
            stderr
          });
          reject(new AdapterError('Claude CLI process failed', {
            processId,
            exitCode,
            stderr: stderr.substring(0, 500)
          }));
        } else {
          resolve();
        }
      });

      process.on('error', (error) => {
        reject(new AdapterError('Claude CLI process error', {
          processId,
          error: error.message
        }));
      });
    });

    // Yield chunks as they arrive
    try {
      // Yield accumulated chunks
      while (chunks.length > 0 || process.exitCode === null) {
        if (chunks.length > 0) {
          yield chunks.shift();
        } else {
          // Wait a bit for more chunks
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Wait for process to complete
      await processStream;

      // Send finish_reason chunk
      yield {
        type: 'data',
        data: {
          id,
          object: 'chat.completion.chunk',
          created,
          model: `claude-${model}`,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        }
      };

      // Send usage chunk
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(fullReply.length / 4);
      yield {
        type: 'data',
        data: {
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
        }
      };

      // Send done marker
      yield { type: 'done' };

    } catch (error) {
      // Send error chunk
      yield {
        type: 'data',
        data: {
          id,
          object: 'chat.completion.chunk',
          created,
          model: `claude-${model}`,
          choices: [],
          error: {
            message: error.message,
            type: 'claude_cli_error'
          }
        }
      };
      yield { type: 'done' };
    } finally {
      // Clean up process
      this.processManager.cleanup(processId, 'cli');
    }
  }

  /**
   * Handle non-streaming response from Claude CLI
   *
   * @param {ChildProcess} process - Claude CLI process
   * @param {string} processId - Process ID
   * @param {string} model - Model name
   * @param {string} prompt - Original prompt
   * @param {number} maxTokens - Maximum tokens to generate
   * @param {Array<string>} stopSequences - Stop sequences
   * @returns {Promise<Object>} Response object
   *
   * @private
   */
  async handleNonStreamResponse(process, processId, model, prompt, maxTokens, stopSequences) {
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    try {
      // Wait for process to complete
      const exitCode = await new Promise((resolve) => {
        process.on('close', resolve);
      });

      if (exitCode !== 0) {
        logger.error('Claude CLI failed', {
          processId,
          exitCode,
          stderr
        });
        throw new AdapterError('Claude CLI process failed', {
          processId,
          exitCode,
          stderr: stderr.substring(0, 500)
        });
      }

      // Parse output
      const events = ResponseTransformer.parseClaudeOutput(stdout);
      let content = ResponseTransformer.extractContent(events);

      if (!content) {
        logger.error('No content found in Claude CLI output', {
          processId,
          eventsCount: events.length,
          stdoutPreview: stdout.substring(0, 500)
        });
        throw new AdapterError('Failed to extract content from Claude CLI', {
          processId,
          eventsCount: events.length,
          rawOutput: stdout.substring(0, 500)
        });
      }

      // Apply max_tokens truncation
      if (maxTokens) {
        content = ResponseTransformer.truncateContent(content, maxTokens);
      }

      // Apply stop sequences
      if (stopSequences && stopSequences.length > 0) {
        for (const seq of stopSequences) {
          const index = content.indexOf(seq);
          if (index !== -1) {
            content = content.substring(0, index + seq.length);
            break;
          }
        }
      }

      // Build OpenAI format response
      const response = ResponseTransformer.toOpenAIFormat(
        [{ type: 'result', subtype: 'success', result: content }],
        model,
        false
      );

      // Update token usage
      response.usage = {
        prompt_tokens: Math.ceil(prompt.length / 4),
        completion_tokens: Math.ceil(content.length / 4),
        total_tokens: Math.ceil((prompt.length + content.length) / 4)
      };

      logger.info('CLIAdapter request completed', {
        processId,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens
      });

      return {
        type: 'response',
        data: response
      };

    } finally {
      // Clean up process
      this.processManager.cleanup(processId, 'cli');
    }
  }

  /**
   * Health check
   *
   * @returns {Object} Health status
   */
  healthCheck() {
    const stats = this.processManager.getStats();
    return {
      adapter: 'cli',
      healthy: stats.total < stats.limit,
      stats
    };
  }

  /**
   * Clean up resources
   * Called on adapter shutdown
   */
  async cleanup() {
    logger.info('CLIAdapter cleaning up');
    await this.processManager.gracefulShutdown();
  }
}

export { CLIAdapter };
