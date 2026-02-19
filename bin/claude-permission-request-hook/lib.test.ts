/**
 * Tests for permission request hook
 *
 * These tests mock the Claude Agent SDK to prevent actual LLM calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'path';

// Mock the claude-agent-sdk before importing the hook
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock fs/promises for policy loading
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    appendFile: vi.fn(),
  };
});

// Mock fs for sync operations
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    appendFileSync: vi.fn(),
  };
});

// Import after mocks are set up
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFile, appendFile } from 'fs/promises';
import { loadPolicy, evaluateWithClaude, evaluatePermission } from './lib.js';

describe('Permission Request Hook', () => {
  // Mock repository root (relative to hook location)
  const repoRoot = resolve(__dirname, '../../..');

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Clear environment variables
    delete process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DISABLE;
    delete process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG;
    delete process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DRY_RUN;
    delete process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_LOG;
  });

  describe('loadPolicy', () => {
    it('should load policy from file when available', async () => {
      const mockPolicy = '# Test Policy\nThis is a test policy';
      vi.mocked(readFile).mockResolvedValue(mockPolicy);

      const policy = await loadPolicy();

      expect(policy).toBe(mockPolicy);
      expect(readFile).toHaveBeenCalled();
    });

    it('should return embedded fallback when file read fails', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      const policy = await loadPolicy();

      expect(policy).toContain('# Permission Policy for inVibe Agent');
      expect(policy).toContain('Auto-Approval (GREEN)');
    });
  });

  describe('evaluateWithClaude', () => {
    const mockInput = {
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
      cwd: '/test/project',
    };
    const mockPolicy = '# Test Policy\nAuto-approve safe operations';

    beforeEach(() => {
      // Mock appendFile for logging
      vi.mocked(appendFile).mockResolvedValue();
    });

    it('should return allow decision when LLM approves', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'allow',
            message: 'npm install is safe for development',
          },
        };
      } as any);

      const result = await evaluateWithClaude(mockInput, mockPolicy);

      expect(result).toEqual({
        decision: 'allow',
        message: 'npm install is safe for development',
      });
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Tool: Bash'),
          options: expect.objectContaining({
            allowedTools: ['Read', 'Glob', 'Grep'],
            permissionMode: 'bypassPermissions',
          }),
        })
      );
    });

    it('should return deny decision when LLM denies', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'deny',
            message: 'Destructive command',
          },
        };
      } as any);

      const result = await evaluateWithClaude(mockInput, mockPolicy);

      expect(result).toEqual({
        decision: 'deny',
        message: 'Destructive command',
      });
    });

    it('should return ask decision when LLM defers to user', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'ask',
            message: 'User should decide',
          },
        };
      } as any);

      const result = await evaluateWithClaude(mockInput, mockPolicy);

      expect(result).toEqual({
        decision: 'ask',
        message: 'User should decide',
      });
    });

    it('should throw error when structured output is invalid', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            invalid: 'structure',
          },
        };
      } as any);

      await expect(evaluateWithClaude(mockInput, mockPolicy)).rejects.toThrow();
    });

    it('should throw error when max retries exceeded', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'error_max_structured_output_retries',
        };
      } as any);

      await expect(evaluateWithClaude(mockInput, mockPolicy)).rejects.toThrow();
    });

    it('should throw error when no decision is returned', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        // Yield nothing - no decision
      } as any);

      await expect(evaluateWithClaude(mockInput, mockPolicy)).rejects.toThrow();
    });

    it('should disable hook recursion in nested agent env', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'allow',
            message: 'Operation is safe',
          },
        };
      } as any);

      await evaluateWithClaude(mockInput, mockPolicy);

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            env: expect.objectContaining({
              INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DISABLE: '1',
            }),
          }),
        })
      );
    });

    it('should include tool details in prompt', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'allow',
            message: 'Operation is safe',
          },
        };
      } as any);

      await evaluateWithClaude(mockInput, mockPolicy);

      const callArgs = vi.mocked(query).mock.calls[0][0];
      expect(callArgs.prompt).toContain('Tool: Bash');
      expect(callArgs.prompt).toContain('npm install');
      expect(callArgs.prompt).toContain(mockPolicy);
    });

    it('should use structured outputs with correct schema', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'allow',
            message: 'Operation is safe',
          },
        };
      } as any);

      await evaluateWithClaude(mockInput, mockPolicy);

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            outputFormat: {
              type: 'json_schema',
              schema: expect.objectContaining({
                type: 'object',
                properties: expect.objectContaining({
                  decision: expect.any(Object),
                  message: expect.any(Object),
                }),
              }),
            },
          }),
        })
      );
    });
  });

  describe('evaluatePermission (Integration)', () => {
    beforeEach(() => {
      vi.mocked(appendFile).mockResolvedValue();
      vi.mocked(readFile).mockResolvedValue('# Test Policy\nAuto-approve safe operations');
    });

    it('should call Claude for operations and return allow', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'allow',
            message: 'npm install is safe for development'
          }
        };
      } as any);

      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm install' },
        cwd: repoRoot
      };

      const result = await evaluatePermission(input);

      expect(result).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'allow',
            message: 'npm install is safe for development',
          },
        },
      });
      expect(query).toHaveBeenCalled();
    });

    it('should call Claude and return deny', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'deny',
            message: 'Dangerous operation'
          }
        };
      } as any);

      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
        cwd: repoRoot
      };

      const result = await evaluatePermission(input);

      expect(result).toEqual({
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'deny',
            message: 'Dangerous operation',
          },
        },
      });
    });

    it('should call Claude and return null for ask (triggers user dialog)', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          structured_output: {
            decision: 'ask',
            message: 'User should decide'
          }
        };
      } as any);

      const input = {
        tool_name: 'Write',
        tool_input: { file_path: `${repoRoot}/package.json`, content: 'test' },
        cwd: repoRoot
      };

      const result = await evaluatePermission(input);

      expect(result).toBeNull();
    });

    it('should propagate errors from Claude evaluation', async () => {
      vi.mocked(query).mockImplementation(async function* () {
        throw new Error('API error');
      } as any);

      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        cwd: repoRoot
      };

      await expect(evaluatePermission(input)).rejects.toThrow('API error');
    });
  });
});
