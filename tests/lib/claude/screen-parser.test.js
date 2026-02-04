/**
 * Screen Parser Tests
 */

import { ScreenParser } from '../../../lib/claude/screen-parser.js';

describe('ScreenParser', () => {
  describe('diff', () => {
    test('should return newScreen when oldScreen is empty', () => {
      const oldScreen = '';
      const newScreen = 'Hello\nWorld';
      const result = ScreenParser.diff(oldScreen, newScreen);
      expect(result).toBe('Hello\nWorld');
    });

    test('should return empty string when newScreen is empty', () => {
      const oldScreen = 'Hello\nWorld';
      const newScreen = '';
      const result = ScreenParser.diff(oldScreen, newScreen);
      expect(result).toBe('');
    });

    test('should detect new content', () => {
      const oldScreen = 'Line 1\nLine 2';
      const newScreen = 'Line 1\nLine 2\nLine 3';
      const result = ScreenParser.diff(oldScreen, newScreen);
      expect(result).toBe('Line 3');
    });

    test('should handle multiple new lines', () => {
      const oldScreen = 'Line 1';
      const newScreen = 'Line 1\nLine 2\nLine 3\nLine 4';
      const result = ScreenParser.diff(oldScreen, newScreen);
      expect(result).toBe('Line 2\nLine 3\nLine 4');
    });

    test('should filter out empty lines', () => {
      const oldScreen = 'Line 1';
      const newScreen = 'Line 1\n\n\nLine 2';
      const result = ScreenParser.diff(oldScreen, newScreen);
      expect(result).toBe('Line 2');
    });
  });

  describe('stripUIElements', () => {
    test('should remove prompt markers', () => {
      const screen = '> User input\nResponse here';
      const result = ScreenParser.stripUIElements(screen);
      expect(result).not.toContain('>');
      expect(result).toContain('Response here');
    });

    test('should remove horizontal lines', () => {
      const screen = 'Text\n─────────\nMore text';
      const result = ScreenParser.stripUIElements(screen);
      expect(result).not.toContain('─');
      expect(result).toContain('Text');
      expect(result).toContain('More text');
    });

    test('should remove box drawing characters', () => {
      const screen = '│ Text │\n┌─────┐';
      const result = ScreenParser.stripUIElements(screen);
      expect(result).not.toContain('│');
      expect(result).not.toContain('┌');
      expect(result).toContain('Text');
    });

    test('should remove user input if provided', () => {
      const screen = 'Hello world\nResponse here';
      const userInput = 'Hello world';
      const result = ScreenParser.stripUIElements(screen, userInput);
      expect(result).not.toContain('Hello world');
      expect(result).toContain('Response here');
    });

    test('should clean up extra whitespace', () => {
      const screen = 'Line 1\n\n\n\nLine 2';
      const result = ScreenParser.stripUIElements(screen);
      expect(result).not.toContain('\n\n\n');
    });
  });

  describe('detectStatus', () => {
    test('should detect stable status when prompt is present', () => {
      const screen = 'Response text\n> ';
      const result = ScreenParser.detectStatus(screen);
      expect(result).toBe('stable');
    });

    test('should detect error status', () => {
      const screen = 'An error occurred';
      const result = ScreenParser.detectStatus(screen);
      expect(result).toBe('error');
    });

    test('should detect thinking status', () => {
      const screen = 'Thinking...';
      const result = ScreenParser.detectStatus(screen);
      expect(result).toBe('thinking');
    });

    test('should return unknown for empty screen', () => {
      const result = ScreenParser.detectStatus('');
      expect(result).toBe('unknown');
    });

    test('should return unknown for unclear status', () => {
      const screen = 'Some random text';
      const result = ScreenParser.detectStatus(screen);
      expect(result).toBe('unknown');
    });
  });

  describe('detectToolCalls', () => {
    test('should detect Tool call: ToolName(args) pattern', () => {
      const screen = 'Tool call: Bash(ls -la)';
      const result = ScreenParser.detectToolCalls(screen);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tool: 'Bash',
        input: 'ls -la'
      });
    });

    test('should detect Using tool: ToolName pattern', () => {
      const screen = 'Using tool: Read';
      const result = ScreenParser.detectToolCalls(screen);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tool: 'Read',
        input: null
      });
    });

    test('should detect ToolName.execute(args) pattern', () => {
      const screen = 'Write.execute({ file: "test.txt" })';
      const result = ScreenParser.detectToolCalls(screen);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tool: 'Write',
        input: '{ file: "test.txt" }'
      });
    });

    test('should detect multiple tool calls', () => {
      const screen = 'Tool call: Bash(ls)\nTool call: Read(file.txt)';
      const result = ScreenParser.detectToolCalls(screen);
      expect(result).toHaveLength(2);
      expect(result[0].tool).toBe('Bash');
      expect(result[1].tool).toBe('Read');
    });

    test('should avoid duplicate tool calls', () => {
      const screen = 'Using tool: Bash\nTool call: Bash(ls -la)';
      const result = ScreenParser.detectToolCalls(screen);
      expect(result).toHaveLength(1);
      expect(result[0].tool).toBe('Bash');
    });

    test('should return empty array for screen without tools', () => {
      const screen = 'Just regular text response';
      const result = ScreenParser.detectToolCalls(screen);
      expect(result).toHaveLength(0);
    });
  });

  describe('extractAssistantReply', () => {
    test('should strip UI elements', () => {
      const screen = '> Hello\n──────\nResponse here';
      const result = ScreenParser.extractAssistantReply(screen, 'Hello');
      expect(result).not.toContain('>');
      expect(result).not.toContain('─');
      expect(result).toContain('Response here');
    });

    test('should remove user input', () => {
      const screen = 'User message\nAssistant response';
      const result = ScreenParser.extractAssistantReply(screen, 'User message');
      expect(result).not.toContain('User message');
      expect(result).toContain('Assistant response');
    });

    test('should remove tool calls from reply', () => {
      const screen = 'Some text\nTool call: Bash(ls)\nMore text';
      const result = ScreenParser.extractAssistantReply(screen);
      expect(result).not.toContain('Tool call');
      expect(result).toContain('Some text');
      expect(result).toContain('More text');
    });

    test('should clean up whitespace', () => {
      const screen = 'Text\n\n\nMore text';
      const result = ScreenParser.extractAssistantReply(screen);
      expect(result).not.toContain('\n\n\n');
    });
  });

  describe('isScreenStable', () => {
    test('should return true for two empty screens', () => {
      const result = ScreenParser.isScreenStable('', '', 0.95);
      expect(result).toBe(true);
    });

    test('should return false if one screen is empty', () => {
      const result = ScreenParser.isScreenStable('Text', '', 0.95);
      expect(result).toBe(false);
    });

    test('should return true for identical screens', () => {
      const screen = 'Line 1\nLine 2\nLine 3';
      const result = ScreenParser.isScreenStable(screen, screen, 0.95);
      expect(result).toBe(true);
    });

    test('should return true for highly similar screens', () => {
      const screen1 = 'Line 1\nLine 2\nLine 3';
      const screen2 = 'Line 1\nLine 2\nLine 3\nLine 4';
      const result = ScreenParser.isScreenStable(screen1, screen2, 0.7);
      expect(result).toBe(true);
    });

    test('should return false for different screens', () => {
      const screen1 = 'Line 1\nLine 2';
      const screen2 = 'Line 3\nLine 4';
      const result = ScreenParser.isScreenStable(screen1, screen2, 0.95);
      expect(result).toBe(false);
    });

    test('should respect custom threshold', () => {
      const screen1 = 'Line 1\nLine 2\nLine 3';
      const screen2 = 'Line 1\nLine 2';
      const result1 = ScreenParser.isScreenStable(screen1, screen2, 0.5);
      const result2 = ScreenParser.isScreenStable(screen1, screen2, 0.9);
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('analyzeScreen', () => {
    test('should return comprehensive analysis', () => {
      const screen = '> Hello\nResponse text\nTool call: Bash(ls)';
      const result = ScreenParser.analyzeScreen(screen, 'Hello');

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('toolCalls');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('hasPrompt');
      expect(result).toHaveProperty('isEmpty');
      expect(result).toHaveProperty('lineCount');

      expect(result.content).toContain('Response text');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].tool).toBe('Bash');
      expect(result.hasPrompt).toBe(true);
      expect(result.isEmpty).toBe(false);
      expect(result.lineCount).toBeGreaterThan(0);
    });

    test('should handle empty screen', () => {
      const result = ScreenParser.analyzeScreen('');

      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.isEmpty).toBe(true);
      expect(result.lineCount).toBe(0);
    });

    test('should include userInput parameter', () => {
      const screen = 'User input\nAssistant response';
      const result = ScreenParser.analyzeScreen(screen, 'User input');

      expect(result.content).not.toContain('User input');
      expect(result.content).toContain('Assistant response');
    });
  });
});
