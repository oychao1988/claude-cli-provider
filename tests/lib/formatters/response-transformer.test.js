/**
 * ResponseTransformer Unit Tests
 */

import { ResponseTransformer } from '../../../lib/formatters/response-transformer.js';

describe('ResponseTransformer', () => {
  describe('extractContent', () => {
    test('should extract content from result event', () => {
      const events = [
        { type: 'result', subtype: 'success', result: 'Hello world' }
      ];

      const content = ResponseTransformer.extractContent(events);
      expect(content).toBe('Hello world');
    });

    test('should extract content from assistant message', () => {
      const events = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Hello' },
              { type: 'text', text: ' world' }
            ]
          }
        }
      ];

      const content = ResponseTransformer.extractContent(events);
      expect(content).toBe('Hello\nworld');
    });

    test('should extract content from partial message', () => {
      const events = [
        { type: 'partial', content: 'Partial content' }
      ];

      const content = ResponseTransformer.extractContent(events);
      expect(content).toBe('Partial content');
    });

    test('should return null for no content', () => {
      const content = ResponseTransformer.extractContent([]);
      expect(content).toBeNull();
    });

    test('should return null for non-array', () => {
      const content = ResponseTransformer.extractContent('not array');
      expect(content).toBeNull();
    });
  });

  describe('detectToolCalls', () => {
    test('should detect single tool call', () => {
      const text = 'Tool call: Write({"file": "test.txt"})';
      const calls = ResponseTransformer.detectToolCalls(text);

      expect(calls).toHaveLength(1);
      expect(calls[0].tool).toBe('Write');
      expect(calls[0].input).toBe('{"file": "test.txt"}');
    });

    test('should detect multiple tool calls', () => {
      const text = 'Tool call: Write(...)\nTool call: Read(...)';
      const calls = ResponseTransformer.detectToolCalls(text);

      expect(calls).toHaveLength(2);
      expect(calls[0].tool).toBe('Write');
      expect(calls[1].tool).toBe('Read');
    });

    test('should return empty array for no tool calls', () => {
      const calls = ResponseTransformer.detectToolCalls('No tools here');
      expect(calls).toHaveLength(0);
    });

    test('should return empty array for empty string', () => {
      const calls = ResponseTransformer.detectToolCalls('');
      expect(calls).toHaveLength(0);
    });

    test('should return empty array for null', () => {
      const calls = ResponseTransformer.detectToolCalls(null);
      expect(calls).toHaveLength(0);
    });
  });

  describe('detectStatus', () => {
    test('should detect running status', () => {
      expect(ResponseTransformer.detectStatus('Thinking...')).toBe('running');
      expect(ResponseTransformer.detectStatus('Loading...')).toBe('running');
    });

    test('should detect error status', () => {
      expect(ResponseTransformer.detectStatus('Error occurred')).toBe('error');
      expect(ResponseTransformer.detectStatus('Operation failed')).toBe('error');
    });

    test('should detect input status', () => {
      expect(ResponseTransformer.detectStatus('Hello\n>')).toBe('input');
      expect(ResponseTransformer.detectStatus('> ')).toBe('input');
    });

    test('should default to stable status', () => {
      expect(ResponseTransformer.detectStatus('Just some text')).toBe('stable');
    });

    test('should handle empty string', () => {
      expect(ResponseTransformer.detectStatus('')).toBe('stable');
    });
  });

  describe('diff', () => {
    test('should compute difference between screens', () => {
      const old = 'Hello';
      const newScreen = 'Hello\nWorld';
      const diff = ResponseTransformer.diff(old, newScreen);

      expect(diff).toBe('World');
    });

    test('should return new content if old is empty', () => {
      const diff = ResponseTransformer.diff('', 'New content');
      expect(diff).toBe('New content');
    });

    test('should return empty if new is empty', () => {
      const diff = ResponseTransformer.diff('Old content', '');
      expect(diff).toBe('');
    });

    test('should handle multiple new lines', () => {
      const old = 'Line1\nLine2';
      const newScreen = 'Line1\nLine2\nLine3\nLine4';
      const diff = ResponseTransformer.diff(old, newScreen);

      expect(diff).toBe('Line3\nLine4');
    });
  });

  describe('truncateContent', () => {
    test('should return content if under limit', () => {
      const content = 'Hello world';
      const result = ResponseTransformer.truncateContent(content, 10);
      expect(result).toBe(content);
    });

    test('should return content if no maxTokens provided', () => {
      const content = 'Hello world';
      const result = ResponseTransformer.truncateContent(content, null);
      expect(result).toBe(content);
    });

    test('should return null if content is null', () => {
      const result = ResponseTransformer.truncateContent(null, 10);
      expect(result).toBeNull();
    });

    test('should truncate content exceeding limit', () => {
      const content = 'This is a longer piece of text that needs to be truncated';
      const result = ResponseTransformer.truncateContent(content, 5); // 5 tokens ≈ 20 chars
      expect(result.length).toBeLessThan(content.length);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    test('should truncate at word boundary', () => {
      const content = 'Hello world this is a test';
      const result = ResponseTransformer.truncateContent(content, 3); // 3 tokens ≈ 12 chars
      // Should truncate at space if possible
      expect(result.length).toBeLessThanOrEqual(12);
    });

    test('should handle exact token limit', () => {
      const content = 'Hello world test';
      const result = ResponseTransformer.truncateContent(content, 4); // 4 tokens ≈ 16 chars
      expect(result.length).toBeLessThanOrEqual(16);
    });
  });

  describe('estimateTokens', () => {
    test('should estimate tokens for text', () => {
      const usage = ResponseTransformer.estimateTokens('Hello world');
      expect(usage.completion_tokens).toBe(Math.ceil('Hello world'.length / 4));
      expect(usage.total_tokens).toBe(usage.completion_tokens);
    });

    test('should return zeros for empty string', () => {
      const usage = ResponseTransformer.estimateTokens('');
      expect(usage.completion_tokens).toBe(0);
      expect(usage.total_tokens).toBe(0);
    });
  });

  describe('parseClaudeOutput', () => {
    test('should parse single JSON object', () => {
      const raw = '{"type":"result","result":"Hello"}';
      const events = ResponseTransformer.parseClaudeOutput(raw);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
    });

    test('should parse JSON array', () => {
      const raw = '[{"type":"result"},{"type":"done"}]';
      const events = ResponseTransformer.parseClaudeOutput(raw);

      expect(events).toHaveLength(2);
    });

    test('should parse line-by-line JSON', () => {
      const raw = '{"type":"result"}\n{"type":"done"}';
      const events = ResponseTransformer.parseClaudeOutput(raw);

      expect(events).toHaveLength(2);
    });

    test('should handle nested arrays', () => {
      const raw = '[[{"type":"result"}]]';
      const events = ResponseTransformer.parseClaudeOutput(raw);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
    });

    test('should skip empty lines', () => {
      const raw = '{"type":"result"}\n\n{"type":"done"}';
      const events = ResponseTransformer.parseClaudeOutput(raw);

      expect(events).toHaveLength(2);
    });

    test('should handle mixed valid and invalid lines', () => {
      const raw = '{"type":"result"}\ninvalid json\n{"type":"done"}';
      const events = ResponseTransformer.parseClaudeOutput(raw);

      // Should parse valid lines and skip invalid
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('toOpenAIFormat', () => {
    test('should create streaming response', () => {
      const events = [{ type: 'result', result: 'Hello' }];
      const response = ResponseTransformer.toOpenAIFormat(events, 'sonnet', true);

      expect(response.object).toBe('chat.completion.chunk');
      expect(response.model).toBe('claude-sonnet');
      expect(response.choices).toHaveLength(1);
    });

    test('should create non-streaming response', () => {
      const events = [{ type: 'result', result: 'Hello' }];
      const response = ResponseTransformer.toOpenAIFormat(events, 'sonnet', false);

      expect(response.object).toBe('chat.completion');
      expect(response.model).toBe('claude-sonnet');
      expect(response.choices[0].message).toBeDefined();
    });
  });

  describe('SSE helpers', () => {
    test('should create SSE chunk', () => {
      const chunk = ResponseTransformer.toSSEChunk({ content: 'Hello' });
      expect(chunk).toBe('data: {"content":"Hello"}\n\n');
    });

    test('should create SSE done marker', () => {
      const done = ResponseTransformer.toSSEDone();
      expect(done).toBe('data: [DONE]\n\n');
    });
  });

  describe('toAgentEvents', () => {
    test('should create agent events', () => {
      const events = ResponseTransformer.toAgentEvents('Hello\nWorld', 'Hello');
      expect(events.message_delta).toBeDefined();
      expect(events.status).toBeDefined();
      expect(events.message_delta.content).toBe('World');
    });
  });
});
