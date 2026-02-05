/**
 * Screen Parser
 *
 * Parses and analyzes PTY screen output from Claude CLI.
 * Extracts content, detects tool calls, and filters UI elements.
 *
 * @example
 * import { ScreenParser } from './lib/claude/screen-parser.js';
 * const diff = ScreenParser.diff(oldScreen, newScreen);
 * const clean = ScreenParser.stripUIElements(screen, userInput);
 */

import { logger } from '../utils/index.js';

/**
 * Screen Parser for PTY output
 */
export class ScreenParser {
  /**
   * Calculate the difference between two screens
   * Returns the new content that was added
   *
   * @param {string} oldScreen - Previous screen content
   * @param {string} newScreen - Current screen content
   * @returns {string} New content added to the screen
   *
   * @example
   * const old = "Hello";
   * const current = "Hello\nWorld";
   * const diff = ScreenParser.diff(old, current); // "World"
   */
  static diff(oldScreen, newScreen) {
    if (!oldScreen) return newScreen || '';
    if (!newScreen) return '';

    const oldLines = oldScreen.split('\n');
    const newLines = newScreen.split('\n');
    const oldLinesSet = new Set(oldLines);

    // Find lines that are in newScreen but not in oldScreen
    const addedLines = newLines.filter(line =>
      line.trim() && !oldLinesSet.has(line)
    );

    return addedLines.join('\n').trim();
  }

  /**
   * Remove TUI elements and user input from screen
   * Filters out prompt markers, borders, and UI decorations
   *
   * @param {string} screen - Screen content to clean
   * @param {string} userInput - User input to remove (optional)
   * @returns {string} Cleaned content
   *
   * @example
   * const screen = "> Hello\n───\nResponse here";
   * const clean = ScreenParser.stripUIElements(screen, "Hello");
   * // "Response here"
   */
  static stripUIElements(screen, userInput = '') {
    if (!screen) return '';

    let cleaned = screen;

    // Remove user input echo if provided
    if (userInput) {
      // Remove the user input from screen
      cleaned = cleaned.replace(userInput, '');
    }

    // Remove common TUI elements
    // Remove prompt markers (>)
    cleaned = cleaned.replace(/^>.*$/gm, '');

    // Remove horizontal lines (─, ─)
    cleaned = cleaned.replace(/─+/g, '');

    // Remove box drawing characters
    cleaned = cleaned.replace(/[│┌┐└┘├┤┬┴┼]/g, '');

    // Remove brackets and checkboxes
    cleaned = cleaned.replace(/^\[.*?\]$/gm, '');

    // Remove empty lines
    cleaned = cleaned.replace(/\n\s*\n/g, '\n');

    return cleaned.trim();
  }

  /**
   * Detect screen status
   * Analyzes screen content to determine current state
   *
   * @param {string} screen - Screen content
   * @returns {string} Status: 'thinking', 'stable', 'error', 'unknown'
   *
   * @example
   * const status = ScreenParser.detectStatus(screen);
   */
  static detectStatus(screen) {
    if (!screen) return 'unknown';

    const lower = screen.toLowerCase();

    // Check for error indicators
    if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
      return 'error';
    }

    // Check for thinking indicators
    if (lower.includes('thinking') || lower.includes('processing') || lower.includes('...')) {
      return 'thinking';
    }

    // Check for prompt marker (indicates stable/ready)
    if (screen.includes('> ') && !screen.includes('...')) {
      return 'stable';
    }

    // Default to unknown
    return 'unknown';
  }

  /**
   * Detect tool calls in screen content
   * Parses tool invocation patterns
   *
   * @param {string} screen - Screen content
   * @returns {Array<Object>} Array of detected tool calls
   *
   * @example
   * const tools = ScreenParser.detectToolCalls(screen);
   * // Returns: [{ tool: 'Bash', input: 'ls -la', raw: '...' }]
   */
  static detectToolCalls(screen) {
    if (!screen) return [];

    const toolCalls = [];

    // Pattern 1: "Tool call: ToolName(arg1, arg2)"
    const toolCallPattern1 = /Tool call:\s*(\w+)\s*\((.*?)\)/g;
    let match;

    while ((match = toolCallPattern1.exec(screen)) !== null) {
      toolCalls.push({
        tool: match[1],
        input: match[2],
        raw: match[0]
      });
    }

    // Pattern 2: "Using tool: ToolName"
    const toolCallPattern2 = /Using tool:\s*(\w+)/g;
    while ((match = toolCallPattern2.exec(screen)) !== null) {
      // Check if this tool is already in the list
      if (!toolCalls.find(tc => tc.tool === match[1])) {
        toolCalls.push({
          tool: match[1],
          input: null,
          raw: match[0]
        });
      }
    }

    // Pattern 3: Function-like syntax - "ToolName.execute(...)"
    const toolCallPattern3 = /(\w+)\.execute\s*\((.*?)\)/g;
    while ((match = toolCallPattern3.exec(screen)) !== null) {
      // Check if this tool is already in the list
      if (!toolCalls.find(tc => tc.tool === match[1])) {
        toolCalls.push({
          tool: match[1],
          input: match[2],
          raw: match[0]
        });
      }
    }

    return toolCalls;
  }

  /**
   * Extract assistant reply from screen
   * Removes user input and TUI elements to get pure response
   *
   * @param {string} screen - Screen content
   * @param {string} userInput - User input to remove (optional)
   * @returns {string} Extracted assistant reply
   *
   * @example
   * const reply = ScreenParser.extractAssistantReply(screen, "Hello");
   */
  static extractAssistantReply(screen, userInput = '') {
    if (!screen) return '';

    // First strip UI elements
    const cleaned = this.stripUIElements(screen, userInput);

    // Remove any remaining user input
    let reply = cleaned;
    if (userInput) {
      reply = reply.replace(new RegExp(userInput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    }

    // Remove tool calls from reply (they're separate events)
    const toolCalls = this.detectToolCalls(reply);
    for (const toolCall of toolCalls) {
      reply = reply.replace(toolCall.raw, '');
    }

    // Clean up whitespace
    reply = reply.replace(/\n\s*\n/g, '\n').trim();

    return reply;
  }

  /**
   * Check if screen is stable
   * Compares screen snapshots to detect if output has settled
   *
   * @param {string} screen1 - First snapshot
   * @param {string} screen2 - Second snapshot
   * @param {number} threshold - Threshold for similarity (0-1)
   * @returns {boolean} True if screens are similar enough
   *
   * @example
   * const isStable = ScreenParser.isScreenStable(snapshot1, snapshot2, 0.9);
   */
  static isScreenStable(screen1, screen2, threshold = 0.95) {
    if (!screen1 && !screen2) return true;
    if (!screen1 || !screen2) return false;

    const lines1 = screen1.split('\n').filter(l => l.trim());
    const lines2 = screen2.split('\n').filter(l => l.trim());

    if (lines1.length === 0 && lines2.length === 0) return true;
    if (lines1.length === 0 || lines2.length === 0) return false;

    // Calculate line overlap
    const set1 = new Set(lines1);
    const set2 = new Set(lines2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    const similarity = intersection.size / Math.max(set1.size, set2.size);

    return similarity >= threshold;
  }

  /**
   * Extract structured information from screen
   * Returns a comprehensive analysis of screen content
   *
   * @param {string} screen - Screen content
   * @param {string} userInput - User input (optional)
   * @returns {Object} Analysis results
   *
   * @example
   * const analysis = ScreenParser.analyzeScreen(screen, userInput);
   */
  static analyzeScreen(screen, userInput = '') {
    return {
      content: this.extractAssistantReply(screen, userInput),
      toolCalls: this.detectToolCalls(screen),
      status: this.detectStatus(screen),
      hasPrompt: screen.includes('> '),
      isEmpty: !screen || screen.trim().length === 0,
      lineCount: screen ? screen.split('\n').length : 0
    };
  }
}
