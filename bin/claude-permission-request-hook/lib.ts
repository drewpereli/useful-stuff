import { readFile, appendFile } from 'fs/promises';
import { appendFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repository root - hook script is at .claude/hooks/permission-request/
export const repoRoot = resolve(__dirname, '../../..');

// Zod schema for hook input validation
// In Zod v4, z.record() requires explicit key and value types
// PermissionRequest schema (no tool_use_id, adds permission_suggestions)
export const HookInputSchema = z.object({
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  cwd: z.string(),
  permission_suggestions: z.array(z.unknown()).optional(), // New field (accepted but not used initially)
});

// Type definitions
export type HookInput = z.infer<typeof HookInputSchema>;

export interface HookDecision {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: {
      behavior: 'allow' | 'deny';
      message: string;
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: unknown[];
    };
  };
}

// Zod schema for the decision (matches what Claude returns)
export const DecisionSchema = z.object({
  decision: z.enum(['allow', 'deny', 'ask']),
  message: z.string(),
});

export type ClaudeDecision = z.infer<typeof DecisionSchema>;

// Environment configuration
export const DEBUG = process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG === '1';
export const DRY_RUN = process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DRY_RUN === '1';
export const LOG_ENABLED = process.env.INVIBE_AGENT_PERMISSION_REQUEST_HOOK_LOG === '1';

// Generate a unique run ID for this execution
const runId = randomBytes(4).toString('hex');
const debugLogPath = join(__dirname, 'debug.log');

export function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[permission-hook]', ...args);

    const logEntry = {
      runId,
      timestamp: new Date().toISOString(),
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
    };

    try {
      appendFileSync(debugLogPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Don't fail the hook if debug logging fails
      console.error('[permission-hook] Failed to write debug log:', (err as Error).message);
    }
  }
}

/**
 * Log decision to JSONL file
 */
export async function logDecision(
  toolName: string,
  toolInput: Record<string, unknown>,
  decisionSource: 'claude-cli',
  decision: 'allow' | 'deny' | 'passthrough',
  reason: string
): Promise<void> {
  if (!LOG_ENABLED) {
    return;
  }

  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      tool_input: toolInput,
      decision_source: decisionSource,
      decision,
      reason
    };

    const logPath = join(__dirname, 'hook-decisions.jsonl');
    await appendFile(logPath, JSON.stringify(logEntry) + '\n', 'utf8');
    debug('Logged decision to', logPath);
  } catch (err) {
    debug('Failed to log decision:', (err as Error).message);
    // Don't fail the hook if logging fails
  }
}

/**
 * Log error to JSONL file
 */
export async function logError(
  errorMessage: string,
  context?: {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    stage?: string;
  }
): Promise<void> {
  if (!LOG_ENABLED) {
    return;
  }

  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'error',
      error: errorMessage,
      ...context
    };

    const logPath = join(__dirname, 'hook-decisions.jsonl');
    await appendFile(logPath, JSON.stringify(logEntry) + '\n', 'utf8');
    debug('Logged error to', logPath);
  } catch (err) {
    debug('Failed to log error:', (err as Error).message);
    // Don't fail the hook if logging fails
  }
}

/**
 * Read JSON from stdin with timeout
 */
export async function readStdinJson<T>(timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Stdin read timeout'));
    }, timeoutMs);

    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data) as T);
      } catch (err) {
        reject(new Error(`Failed to parse JSON: ${(err as Error).message}`));
      }
    });

    process.stdin.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Load policy document
 */
export async function loadPolicy() {
  try {
    const policyPath = join(__dirname, 'permission-policy.md');
    const content = await readFile(policyPath, 'utf8');
    return content;
  } catch (err) {
    debug('Failed to load policy, using embedded fallback:', (err as Error).message);
    // Embedded fallback policy
    return `# Permission Policy for inVibe Agent

## Mission
Reduce approval fatigue. Auto-approve normal analysis operations. Only prompt for destructive actions.

## Auto-Approval (GREEN)
1. Read operations (Read, Glob, Grep, cat, ls, find)
2. Analysis work (creating/editing files in workspaces/)
3. Database SELECT queries
4. Running scripts from .claude/ or workspaces/
5. Standard development (npm install, git operations)

## Prompt User (YELLOW)
- Destructive: rm -rf, DROP TABLE, DELETE without WHERE
- System-level: shutdown, chmod on system dirs
- Irreversible: force push to main

## Decision Framework
1. Read operation? → AUTO-APPROVE
2. Modifies workspaces/, .claude/, docs/, plans/? → AUTO-APPROVE
3. Standard dev task? → AUTO-APPROVE
4. Irreversible data loss? → PROMPT
5. When in doubt → PROMPT (safer default)
`;
  }
}

/**
 * Evaluate with Claude Agent SDK
 * Returns the raw ClaudeDecision (allow/deny/ask with message)
 */
export async function evaluateWithClaude(
  input: HookInput,
  policy: string
): Promise<ClaudeDecision> {
  const prompt = `You are evaluating a tool permission request for the inVibe Agent. Based on the policy below, decide whether to AUTO-APPROVE, PROMPT, or AUTO-DENY this operation.

You have access to Read, Glob, and other tools to check file context if needed for your decision.

# Policy
${policy}

# Tool Request
Tool: ${input.tool_name}
Input: ${JSON.stringify(input.tool_input, null, 2)}

# Your Task
Decide on one of these three options:

1. AUTO-APPROVE (operation is safe): decision = "allow", message = "brief reason"
2. PROMPT (let user decide): decision = "ask", message = "brief reason"
3. AUTO-DENY (clearly malformed): decision = "deny", message = "brief reason"

Always include a message explaining your reasoning.`;

  debug('Calling Claude Agent SDK for evaluation');

  // Set up abort controller for timeout (25 seconds, since the hook timeout is 30 seconds)
  const QUERY_TIMEOUT_MS = 25_000;

  // Determine model based on environment
  const model = process.env.CLAUDE_CODE_USE_BEDROCK
    ? 'us.anthropic.claude-sonnet-4-6'
    : 'claude-sonnet-4-6';

  try {
    let decision: ClaudeDecision | null = null;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), QUERY_TIMEOUT_MS);

    try {
      // Collect agent messages
      for await (const message of query({
        prompt,
        options: {
          model,
          allowedTools: ['Read', 'Glob', 'Grep'],
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          thinking: {type: 'disabled'}, // Disable thinking to speed up response
          // Disable the permission hook for this evaluating agent to prevent recursion
          env: {
            ...process.env,
            INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DISABLE: '1',
          },
          // Use structured outputs for reliable parsing
          outputFormat: {
            type: 'json_schema',
            schema: z.toJSONSchema(DecisionSchema, { target: 'draft-07' }),
          },
          abortController,
        }
      })) {
        // Handle error messages from the agent
        if (message.type === 'assistant' && message.error) {
          const errorMessage = message.error;
          debug('Error message from agent:', errorMessage);
          
          await logError(errorMessage, {
            stage: 'agent-query',
            tool_name: input.tool_name,
            tool_input: input.tool_input
          });

          throw new Error(`Agent error: ${errorMessage}`);
        }

        // Get structured output from result message
        if (message.type === 'result' && message.subtype === 'success' && message.structured_output) {
          const parsed = DecisionSchema.safeParse(message.structured_output);
          if (parsed.success) {
            decision = parsed.data;
          } else {
            debug('Structured output validation failed:', parsed.error);
            const error = new Error('Invalid decision structure');
            await logError(error.message, {
              stage: 'agent-parse',
              tool_name: input.tool_name,
              tool_input: input.tool_input
            });
            throw error;
          }
        } else if (message.type === 'result' && message.subtype === 'error_max_structured_output_retries') {
          debug('Agent failed to produce structured output');
          const error = new Error('Agent could not produce valid decision');
          await logError(error.message, {
            stage: 'agent-structured-output',
            tool_name: input.tool_name,
            tool_input: input.tool_input
          });
          throw error;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!decision) {
      debug('No decision received from agent');
      const error = new Error('No decision received');
      await logError(error.message, {
        stage: 'agent-decision',
        tool_name: input.tool_name,
        tool_input: input.tool_input
      });
      throw error;
    }

    debug('Claude decision:', decision);

    return decision;
  } catch (err) {
    // Handle abort timeout specifically
    if (err instanceof Error && err.name === 'AbortError') {
      const timeoutError = new Error('Query timeout');
      debug('Query timed out after', QUERY_TIMEOUT_MS, 'ms');
      await logError(timeoutError.message, {
        stage: 'agent-evaluation',
        tool_name: input.tool_name,
        tool_input: input.tool_input
      });
      throw timeoutError;
    }

    debug('Error in agent evaluation:', (err as Error).message);
    await logError((err as Error).message, {
      stage: 'agent-evaluation',
      tool_name: input.tool_name,
      tool_input: input.tool_input
    });
    throw err;
  }
}

/**
 * Evaluate a permission request
 * All fast-path cases are handled by settings.json now.
 * Only LLM evaluation reaches this hook.
 * Returns HookDecision for allow/deny, or null for 'ask' (which triggers normal permission dialog)
 */
export async function evaluatePermission(input: HookInput): Promise<HookDecision | null> {
  debug('Evaluating permission:', JSON.stringify(input, null, 2));

  // Load policy
  const policy = await loadPolicy();

  // Call Claude Agent SDK for evaluation
  const decision = await evaluateWithClaude(input, policy);

  // Map decision type to log decision type
  const logDecisionType = decision.decision === 'ask' ? 'passthrough' as const : decision.decision;

  // Log every decision with its reasoning
  await logDecision(
    input.tool_name,
    input.tool_input,
    'claude-cli',
    logDecisionType,
    decision.message
  );

  // 'ask' means passthrough to normal user dialog
  if (decision.decision === 'ask') {
    debug('LLM returned ask, passing through to user dialog');
    return null;
  }

  // Convert to HookDecision for allow/deny
  const hookDecision: HookDecision = {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: decision.decision,
        message: decision.message,
      },
    },
  };

  if (DRY_RUN) {
    console.error('[DRY-RUN] Would output:', JSON.stringify(hookDecision));
  }

  return hookDecision;
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  let input: HookInput | null = null;

  try {
    // Read input with timeout
    const rawInput = await readStdinJson<unknown>(5000);

    // Validate input schema
    const parseResult = HookInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const error = new Error(`Invalid hook input: ${parseResult.error.message}`);
      await logError(error.message, { stage: 'input-validation' });
      throw error;
    }

    input = parseResult.data;

    // Evaluate the permission request
    const decision = await evaluatePermission(input);

    // Output decision (or nothing for null which means passthrough to user dialog)
    if (decision !== null) {
      console.log(JSON.stringify(decision));
    }
    process.exit(0);
  } catch (err) {
    const errorMessage = (err as Error).message;
    debug('Error in hook:', errorMessage);

    // Log error to file with context if available
    await logError(errorMessage, {
      stage: 'main',
      ...(input && {
        tool_name: input.tool_name,
        tool_input: input.tool_input
      })
    });

    // All errors passthrough - never block workflow
    process.exit(0);
  }
}
