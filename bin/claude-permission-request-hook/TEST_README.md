# Permission Request Hook Tests

This directory contains comprehensive tests for the permission request hook using vitest.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only hook tests
cd .claude/hooks/permission-request && npm test
```

## Test Coverage

The test suite covers the following areas:

### 1. Fast-Path Evaluation (`evaluateFastPath`)

- **Read operations**: Verifies that Read, Glob, Grep, WebFetch, and WebSearch are always auto-approved
- **Safe directories**: Tests Write/Edit operations to `workspaces/`, `.claude/`, `docs/`, and `plans/`
- **Safe bash commands**: Validates auto-approval of `ls`, `cat`, `git status`, `git diff`
- **Path resolution**: Tests relative paths, paths with `..`, and directory escape attempts
- **Other tools**: Ensures non-safe tools require LLM evaluation

### 2. Policy Loading (`loadPolicy`)

- Tests successful policy file loading
- Tests fallback to embedded policy when file is unavailable

### 3. LLM Evaluation (`evaluateWithClaude`)

**All LLM calls are mocked** - no actual API calls are made during testing.

Tests cover:
- Allow decisions from the LLM
- Deny decisions from the LLM
- Passthrough decisions (let user decide)
- Error handling for invalid structured output
- Error handling for max retries exceeded
- Error handling for missing decisions
- Hook recursion prevention
- Prompt structure validation
- Structured output schema validation

### 4. Integration Scenarios

- Typical read workflow (all auto-approved)
- Typical write workflow to safe directories (all auto-approved)
- Potentially dangerous operations (require LLM evaluation)

### 5. Edge Cases

- Empty tool_input
- Non-string parameters
- Undefined fields

## Test Structure

The tests use vitest with mocked external dependencies:

```typescript
// Mock the Claude Agent SDK to prevent actual LLM calls
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock file system operations
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    appendFile: vi.fn(),
  };
});
```

## Key Testing Patterns

### Testing Fast-Path Logic

```typescript
it('should passthrough Read operations', () => {
  const result = evaluateFastPath('Read', { file_path: '/some/file.ts' }, '/any/cwd');
  expect(result).toBe('passthrough');
});
```

### Testing LLM Evaluation with Mocks

```typescript
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
  });

  const result = await evaluateWithClaude(mockInput, mockPolicy);

  expect(result).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'npm install is safe for development',
    },
  });
});
```

## Code Structure

The hook code is cleanly separated into three files:

1. **`lib.ts`**: Contains all the logic and functions
   - All functions and types are exported for testing
   - No side effects on import

2. **`hook.ts`**: Thin CLI entry point
   - Imports and calls `main()` from `lib.ts`
   - Contains only the kill switch check and main invocation

3. **`lib.test.ts`**: Test suite
   - Imports and tests functions from `lib.ts`
   - Mocks external dependencies

This separation makes the code highly testable while keeping the CLI entry point clean and simple.

## Test Results

All 41 tests pass successfully:

```
✓ .claude/hooks/permission-request/lib.test.ts (41 tests) 19ms

Test Files  1 passed (1)
     Tests  41 passed (41)
```

## Debug Output

Tests run with `DEBUG` mode enabled, so you'll see stderr output showing the hook's decision-making process. This is normal and helps verify the logic is working correctly.
