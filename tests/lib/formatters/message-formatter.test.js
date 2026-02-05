/**
 * MessageFormatter Unit Tests
 */

import { MessageFormatter } from '../../../lib/formatters/message-formatter.js';

describe('MessageFormatter', () => {
  describe('formatForCLI', () => {
    test('should extract system prompt', () => {
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' }
      ];

      const result = MessageFormatter.formatForCLI(messages);
      expect(result.systemPrompt).toBe('You are helpful');
    });

    test('should return null system prompt when not present', () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const result = MessageFormatter.formatForCLI(messages);
      expect(result.systemPrompt).toBeNull();
    });

    test('should format user and assistant messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' }
      ];

      const result = MessageFormatter.formatForCLI(messages);
      expect(result.conversation).toBe('user: Hello\nassistant: Hi there!\nuser: How are you?');
    });

    test('should handle content arrays', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image', url: 'image.png' }
          ]
        }
      ];

      const result = MessageFormatter.formatForCLI(messages);
      expect(result.conversation).toContain('Hello');
      expect(result.conversation).not.toContain('image');
    });

    test('should throw error for non-array messages', () => {
      expect(() => {
        MessageFormatter.formatForCLI('not an array');
      }).toThrow('Messages must be an array');
    });
  });

  describe('formatForPTY', () => {
    test('should wrap content in bracketed paste mode', () => {
      const result = MessageFormatter.formatForPTY('Hello world');
      expect(result).toBe('\x1b[200~Hello world\x1b[201~');
    });

    test('should convert non-string to string', () => {
      const result = MessageFormatter.formatForPTY(123);
      expect(result).toBe('\x1b[200~123\x1b[201~');
    });
  });

  describe('stripUIElements', () => {
    test('should remove TUI elements', () => {
      const text = 'Hello\n>\n─\nWorld';
      const result = MessageFormatter.stripUIElements(text, '');
      expect(result).toBe('Hello\nWorld');
    });

    test('should remove user input echo', () => {
      const text = 'Hello\nMy input\nWorld';
      const result = MessageFormatter.stripUIElements(text, 'My input');
      expect(result).not.toContain('My input');
    });

    test('should remove status bars', () => {
      const text = 'Hello\n[Status]\nWorld';
      const result = MessageFormatter.stripUIElements(text, '');
      expect(result).not.toContain('[Status]');
    });

    test('should trim whitespace', () => {
      const text = '  Hello\n\n  World  ';
      const result = MessageFormatter.stripUIElements(text, '');
      expect(result).toBe('Hello\nWorld');
    });
  });

  describe('extractUserPrompt', () => {
    test('should extract last user message', () => {
      const messages = [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Second' }
      ];

      const result = MessageFormatter.extractUserPrompt(messages);
      expect(result).toBe('Second');
    });

    test('should return null for empty messages', () => {
      const result = MessageFormatter.extractUserPrompt([]);
      expect(result).toBeNull();
    });

    test('should return null for non-array', () => {
      const result = MessageFormatter.extractUserPrompt('not array');
      expect(result).toBeNull();
    });

    test('should handle content arrays', () => {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Text content' },
            { type: 'image', url: 'img.png' }
          ]
        }
      ];

      const result = MessageFormatter.extractUserPrompt(messages);
      expect(result).toBe('Text content');
    });
  });

  describe('validateMessages', () => {
    test('should validate correct messages', () => {
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' }
      ];

      const result = MessageFormatter.validateMessages(messages);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject non-array', () => {
      const result = MessageFormatter.validateMessages('not array');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Messages must be an array');
    });

    test('should reject empty array', () => {
      const result = MessageFormatter.validateMessages([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Messages array cannot be empty');
    });

    test('should reject missing role', () => {
      const messages = [{ content: 'Hello' }];
      const result = MessageFormatter.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('role'))).toBe(true);
    });

    test('should reject invalid role', () => {
      const messages = [{ role: 'invalid', content: 'Hello' }];
      const result = MessageFormatter.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('invalid role'))).toBe(true);
    });

    test('should reject missing content', () => {
      const messages = [{ role: 'user' }];
      const result = MessageFormatter.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('content'))).toBe(true);
    });

    test('should require at least one user message', () => {
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'assistant', content: 'Hi' }
      ];

      const result = MessageFormatter.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Messages must contain at least one user message');
    });
  });

  describe('isTUIElement', () => {
    test('should detect empty prompt', () => {
      expect(MessageFormatter.isTUIElement('>')).toBe(true);
    });

    test('should detect horizontal separator', () => {
      expect(MessageFormatter.isTUIElement('─────')).toBe(true);
    });

    test('should detect empty lines', () => {
      expect(MessageFormatter.isTUIElement('   ')).toBe(true);
      expect(MessageFormatter.isTUIElement('')).toBe(true);
    });

    test('should detect status bars', () => {
      expect(MessageFormatter.isTUIElement('[Status]')).toBe(true);
      expect(MessageFormatter.isTUIElement('[  Info  ]')).toBe(true);
    });

    test('should not detect regular text', () => {
      expect(MessageFormatter.isTUIElement('Hello world')).toBe(false);
    });
  });
});
