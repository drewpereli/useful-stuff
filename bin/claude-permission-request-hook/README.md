# Permission Request Hook

Auto-approves safe operations to reduce approval fatigue during research analysis work.

## How It Works

This is a **PermissionRequest hook** that only runs when a permission dialog would appear:

1. **settings.json fast-path** (instant): Common safe operations (Read, Glob, Grep, workspace writes) are auto-approved by settings.json before the hook runs
2. **Hook evaluation** (~12s): For operations not in settings.json, the hook uses LLM evaluation to decide allow/deny/ask
3. **User dialog** (fallback): When hook returns `null` (ask), the normal permission dialog appears

### Fast-Path Operations (Never Reach Hook)

These operations are handled by `settings.json` and proceed instantly:

- **Read operations**: Read, Glob, Grep, WebFetch, WebSearch
- **Safe writes**: Write/Edit to `workspaces/`, `.claude/`, `docs/`, `plans/`
- **Safe bash**: ls, git status, git diff

### AI Evaluation (Hook Runs for These)

For operations not covered by settings.json, the hook calls Claude CLI to evaluate based on the policy document:

- **Potentially risky bash commands**: npm install, git push, rm, chmod
- **Writes outside safe directories**: e.g., Write to package.json
- **Ambiguous operations**: New tools, unusual patterns, complex commands

### Decisions

- **allow**: Auto-approve the operation (dialog clears)
- **deny**: Block the operation with explanation message
- **ask** (returns null): Show normal permission dialog for user decision

## Benefits

- **Instant approval for ~95% of operations**: settings.json fast-path bypasses hook entirely
- **Intelligent evaluation**: AI assists with ambiguous cases using policy context
- **Only runs when needed**: Hook only evaluates operations that would show a dialog
- **Graceful degradation**: All errors return null to show user dialog (never blocks workflow)

## Environment Variables

### Kill Switch

Disable the hook entirely:

```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DISABLE=1
```

### Debug Mode

Enable verbose logging to stderr and debug.log:

```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG=1
```

### Dry-Run Mode

Log decisions but always return null (show user prompts):

```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DRY_RUN=1
```

### Decision Logging

Log all tool inputs and decisions to a JSONL file:

```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_LOG=1
```

When enabled, each decision is appended to `hook-decisions.jsonl` in the hook directory. Each line is a JSON object with:

- `timestamp`: ISO-8601 timestamp
- `tool_name`: The tool being evaluated
- `tool_input`: The tool's input parameters
- `decision_source`: "claude-cli" (fast-path operations never reach hook)
- `decision`: "allow", "deny", or "passthrough" (ask → passthrough)
- `reason`: Optional explanation

**Note:** Only operations that reach the hook are logged. Fast-path operations (settings.json matches) are not logged.

This is useful for:
- Analyzing approval patterns for operations that reach the hook
- Debugging hook behavior
- Understanding LLM evaluation patterns
- Identifying operations to add to settings.json fast-path

## Testing

### Quick Test

```bash
# Enable debug mode
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG=1

# Try operations that should reach the hook
# (Read/Write to workspaces are handled by settings.json and won't reach hook)

# Try a potentially risky operation (should evaluate with LLM)
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf workspaces/","cwd":"/test"}}' | node .claude/hooks/permission-request/hook.ts

# Try npm install (should evaluate with LLM)
echo '{"tool_name":"Bash","tool_input":{"command":"npm install","cwd":"/test"}}' | node .claude/hooks/permission-request/hook.ts
```

### Dry-Run Testing

```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DRY_RUN=1

# Test in real Claude Code session
# All operations will log decisions but still show prompts
```

## Performance

- **95%+ of operations**: settings.json fast-path (instant, hook never runs)
- **~5% ambiguous operations**: Hook LLM evaluation (~12s)
- **0% workflow blocking**: All errors return null (show user dialog)

**Performance improvement over PreToolUse:** By moving fast-path to settings.json, we eliminate ~12s of LLM overhead for 95% of operations. Hook only runs for truly ambiguous cases.

## Common Scenarios

### Scenario: Reading project data

```
Tool: Read
Path: workspaces/analysis/project_510/data.xml
Result: settings.json match → Instant approval (hook not invoked)
```

### Scenario: Creating analysis file

```
Tool: Write
Path: workspaces/analysis/findings.md
Result: settings.json match → Instant approval (hook not invoked)
```

### Scenario: SQLite query

```
Tool: Bash
Command: sqlite3 projects.db 'SELECT * FROM answers'
Result: settings.json match → Instant approval (hook not invoked)
```

### Scenario: Package installation

```
Tool: Bash
Command: npm install new-package
Result: No settings.json match → Hook evaluates with LLM (~12s) → Decision based on policy
```

### Scenario: Destructive operation

```
Tool: Bash
Command: rm -rf workspaces/
Result: No settings.json match → Hook evaluates with LLM (~12s) → Likely returns ask (user decides)
```

## Troubleshooting

### Hook not working

1. Check settings.json has PermissionRequest hook registered (not PreToolUse)
2. Enable debug mode: `export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG=1`
3. Check debug.log in hook directory for execution traces

### Permission dialogs still appearing

This is expected! The hook uses a permissive stance:
- Auto-approves obvious safe operations (via settings.json - instant)
- Auto-approves standard development tasks (via hook evaluation)
- Shows dialog for ambiguous or potentially destructive operations (ask → null)

You should see fewer dialogs, not zero.

### Dialog appears briefly then disappears

This is normal PermissionRequest behavior. When an operation doesn't match settings.json:
1. Dialog would appear (permission needed)
2. Hook is invoked to evaluate
3. If hook returns `allow`, dialog clears
4. If hook returns `null`, dialog stays for user decision

This is a minor UX trade-off for the performance benefits of PermissionRequest architecture.

### Most operations are instant, but some take ~12s

- **Instant**: Matches settings.json pattern (hook never runs)
- **~12s**: Doesn't match settings.json, hook uses LLM evaluation

**Solution:** If an operation should be instant, add it to settings.json `permissions.allow`.

### Timeouts

- Stdin read: 5s timeout
- Hook total: 30s timeout (configured in settings.json)

If timeout occurs, hook returns null (shows user dialog).

### Hook errors

All errors return null gracefully (show user dialog). Check debug logs with `INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG=1` to see what happened.

## Policy

The permission policy is in `permission-policy.md`. The hook loads this file to provide context to the LLM evaluator.

You can edit the policy to adjust auto-approval rules or add project-specific patterns.

## Architecture

### Why PermissionRequest?

PermissionRequest hooks run **after** settings.json permission checks and **only when a dialog would appear**. This means:

- Fast-path operations (settings.json matches) never invoke the hook at all
- Hook only evaluates truly ambiguous operations (~5% of calls)
- ~95% performance improvement over PreToolUse architecture
- Clean separation: instant approval (settings.json) vs. evaluation (hook)

See `HOOK_INTERACTION.md` for detailed architecture explanation.

### Why Single File?

The entire hook logic is in `hook.ts` for simplicity:

- No build step required
- Easy to debug and modify
- All logic in one place
- Native TypeScript with Node 24

### Error Handling

The hook follows a strict "never block" principle:

- Stdin timeout? → Return null (show user dialog)
- Policy file missing? → Use embedded fallback
- Claude CLI unavailable? → Return null
- JSON parse error? → Return null
- Any other error? → Return null

This ensures the hook never breaks the user's workflow. When in doubt, return null and let the user decide.

## Migration from PreToolUse

If you're migrating from PreToolUse hooks:

1. **Move fast-path rules to settings.json** - Operations will bypass hook entirely
2. **Remove fast-path function from hook code** - No longer needed
3. **Update HookDecision format** - Use PermissionRequest format (decision.behavior)
4. **Update hook registration** - Change from PreToolUse to PermissionRequest in settings.json
5. **Update tests** - Remove fast-path tests, update assertions

See implementation plan for detailed migration steps.
