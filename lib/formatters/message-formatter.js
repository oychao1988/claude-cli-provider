/**
 * Message Formatter
 *
 * Converts between different message formats for Claude CLI interaction.
 *
 * @example
 * import { MessageFormatter } from './lib/formatters/message-formatter.js';
 * const { systemPrompt, conversation } = MessageFormatter.formatForCLI(messages);
 */

/**
 * Message formatting utility class
 */
class MessageFormatter {
  /**
   * Format OpenAI messages array for Claude CLI input
   * Extracts system prompt and builds conversation context
   *
   * @param {Array<Object>} messages - OpenAI format messages
   * @param {string} messages[].role - Message role (system, user, assistant)
   * @param {string} messages[].content - Message content
   * @returns {Object} Formatted object with systemPrompt and conversation
   * @returns {string} returns.systemPrompt - System prompt if present
   * @returns {string} returns.conversation - Formatted conversation string
   *
   * @example
   * const messages = [
   *   { role: 'system', content: 'You are a helper' },
   *   { role: 'user', content: 'Hello' },
   *   { role: 'assistant', content: 'Hi there!' },
   *   { role: 'user', content: 'How are you?' }
   * ];
   * const { systemPrompt, conversation } = MessageFormatter.formatForCLI(messages);
   * // systemPrompt: 'You are a helper'
   * // conversation: 'user: Hello\nassistant: Hi there!\nuser: How are you?'
   */
  static formatForCLI(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    // Extract system prompt
    const systemMessage = messages.find(m => m.role === 'system');
    const systemPrompt = systemMessage?.content || null;

    // Build conversation from user and assistant messages
    const conversationMessages = messages.filter(m =>
      ['user', 'assistant'].includes(m.role)
    );

    const conversation = conversationMessages
      .map(m => {
        let content = m.content;
        // Handle content arrays (e.g., text + images)
        if (Array.isArray(content)) {
          content = content
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join('\n');
        }
        return `${m.role}: ${content}`;
      })
      .join('\n');

    return { systemPrompt, conversation };
  }

  /**
   * Format content for PTY bracketed paste mode
   * This ensures special characters are handled correctly in PTY
   *
   * @param {string} content - Content to format
   * @returns {string} Content wrapped in bracketed paste sequences
   *
   * @example
   * const formatted = MessageFormatter.formatForPTY('Hello world\nHow are you?');
   * // Returns: '\x1b[200~Hello world\nHow are you?\x1b[201~'
   */
  static formatForPTY(content) {
    if (typeof content !== 'string') {
      content = String(content);
    }
    // Bracketed paste mode sequences
    return `\x1b[200~${content}\x1b[201~`;
  }

  /**
   * Strip TUI (Terminal UI) elements from text
   * Removes input echoes, status bars, and other UI artifacts
   *
   * @param {string} text - Text to clean
   * @param {string} userInput - User input to remove (echo)
   * @returns {string} Cleaned text
   *
   * @example
   * const text = 'Hello\n>\n─\nWorld\n> ';
   * const cleaned = MessageFormatter.stripUIElements(text, '');
   * // Returns: 'Hello\nWorld'
   */
  static stripUIElements(text, userInput = '') {
    let result = text;

    // Remove user input echo
    if (userInput) {
      result = result.replace(new RegExp(this.escapeRegExp(userInput), 'g'), '');
    }

    // Split into lines and filter out TUI elements
    const lines = result.split('\n');
    const filteredLines = lines.filter(line => !this.isTUIElement(line));

    // Trim leading/trailing whitespace from each line, then join
    return filteredLines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  }

  /**
   * Check if a line is a TUI element
   *
   * @param {string} line - Line to check
   * @returns {boolean} True if line is a TUI element
   * @private
   */
  static isTUIElement(line) {
    const tuiPatterns = [
      /^>$/,                    // Empty prompt
      /^─+$/,                   // Horizontal separator
      /^\s*$/,                  // Empty line
      /^\[.*\]$/,               // Status bar [text]
      /^│.*│$/,                 // Vertical border
      /^┌|┐|└|┘|├|┤|┬|┴|┼$/,  // Box drawing characters
      /^\s*\d+%/,              // Progress indicators
    ];
    return tuiPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Escape special characters in RegExp
   *
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   * @private
   */
  static escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract user prompt from OpenAI messages
   * Returns the last user message content
   *
   * @param {Array<Object>} messages - OpenAI format messages
   * @returns {string|null} User prompt content
   *
   * @example
   * const messages = [
   *   { role: 'system', content: 'You are helpful' },
   *   { role: 'user', content: 'Hello' },
   *   { role: 'user', content: 'Tell me a joke' }
   * ];
   * const prompt = MessageFormatter.extractUserPrompt(messages);
   * // Returns: 'Tell me a joke'
   */
  static extractUserPrompt(messages) {
    if (!Array.isArray(messages)) {
      return null;
    }

    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
      return null;
    }

    let prompt = userMessages[userMessages.length - 1].content;

    // Handle content arrays
    if (Array.isArray(prompt)) {
      prompt = prompt
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n');
    }

    return typeof prompt === 'string' ? prompt : String(prompt || '');
  }

  /**
   * Validate message format
   *
   * @param {Array<Object>} messages - Messages to validate
   * @returns {Object} Validation result
   * @returns {boolean} returns.valid - True if valid
   * @returns {string[]} returns.errors - Array of error messages
   */
  static validateMessages(messages) {
    const errors = [];

    if (!Array.isArray(messages)) {
      errors.push('Messages must be an array');
      return { valid: false, errors };
    }

    if (messages.length === 0) {
      errors.push('Messages array cannot be empty');
      return { valid: false, errors };
    }

    const validRoles = ['system', 'user', 'assistant'];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (!msg.role || typeof msg.role !== 'string') {
        errors.push(`Message ${i}: missing or invalid role`);
      } else if (!validRoles.includes(msg.role)) {
        errors.push(`Message ${i}: invalid role "${msg.role}"`);
      }

      if (!msg.content) {
        errors.push(`Message ${i}: missing content`);
      }
    }

    // Check if there's at least one user message
    const hasUserMessage = messages.some(m => m.role === 'user');
    if (!hasUserMessage) {
      errors.push('Messages must contain at least one user message');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export { MessageFormatter };
