# Hook and Permissions Interaction

This document explains how the PermissionRequest permission hook interacts with the `permissions.allow` configuration in `.claude/settings.json`.

## System Architecture

Claude Code's permission system has two layers that execute in sequence:

### Layer 1: Static Permissions (`permissions.allow`) - CHECKED FIRST

Defined in `.claude/settings.json`:

```json
"permissions": {
  "allow": [
    "WebSearch",
    "Read",
    "Glob",
    "Grep",
    "WebFetch",
    "Bash(ls *:*)",
    "Bash(git status:*)",
    "Bash(git diff:*)",
    "Bash(git diff *:*)",
    "Write(workspaces/**)",
    "Edit(workspaces/**)",
    "Write(.claude/**)",
    "Edit(.claude/**)",
    "Write(docs/**)",
    "Edit(docs/**)",
    "Write(plans/**)",
    "Edit(plans/**)",
    "Bash(node .claude/skills/bootstrap-project/scripts/bootstrap.ts:*)",
    "Bash(sqlite3:*)",
    "Bash(mkdir workspaces/*:*)",
    "Bash(mkdir -p workspaces/*:*)",
    "Bash(cp * workspaces/*:*)",
    "Bash(mv * workspaces/*:*)"
  ]
}
```

These are **instant approval rules** checked **before the hook runs**. Operations matching these patterns proceed immediately without hook evaluation.

### Layer 2: PermissionRequest Hook (This Hook) - ONLY FOR AMBIGUOUS OPERATIONS

Defined in `.claude/settings.json` hooks section. This hook is invoked **only when a permission dialog would appear** - i.e., when Layer 1 doesn't match.

The hook uses LLM evaluation to decide:
1. **allow**: Auto-approve the operation (dialog is cleared)
2. **deny**: Block the operation with explanation
3. **ask** (returns null): Let normal permission dialog appear for user decision

## Execution Order

```
Tool Call
    ↓
Layer 1: Check static permissions (permissions.allow)
    ├─ Match found? → ✅ Instant approval (hook never runs)
    └─ No match → Continue to Layer 2
        ↓
Layer 2: Would show permission dialog → Invoke PermissionRequest hook
    ↓
Hook evaluates with LLM:
    ├─ Policy says allow → Return allow (✅ Approve, dialog clears)
    ├─ Policy says deny → Return deny (❌ Block with message)
    └─ Policy uncertain → Return null (❓ Show normal dialog to user)
```

## Key Architectural Change

**This is fundamentally different from PreToolUse hooks:**

| Hook Type | Execution Order | When It Runs | Fast-Path Strategy |
|-----------|----------------|--------------|-------------------|
| **PreToolUse** (old) | Runs BEFORE permission checks | Every tool call | Implement in hook code |
| **PermissionRequest** (current) | Runs AFTER permission checks | Only when dialog would appear | Implement in settings.json |

## Performance Benefits

**Fast-path operations bypass the hook entirely:**

- Read, Glob, Grep, WebFetch, WebSearch → Instant approval via settings.json (never reaches hook)
- Write/Edit to workspaces/, .claude/, docs/, plans/ → Instant approval via settings.json
- Safe bash commands (ls, git status, git diff) → Instant approval via settings.json

**Before (PreToolUse):** Hook evaluated every operation, even Read operations (fast-path check → instant, but hook still ran)

**Now (PermissionRequest):** Hook only evaluates ambiguous operations (~5% of calls)

**Result:** ~95% of operations bypass hook completely. ~12 seconds of LLM overhead eliminated for fast-path operations.

## What Reaches the Hook?

Operations that don't match settings.json patterns:

1. **Potentially risky bash commands**: npm install, git push, rm, chmod, etc.
2. **Writes outside safe directories**: Write to root files like package.json
3. **Ambiguous operations**: New tools, unusual patterns, complex commands

The hook uses LLM evaluation to determine if these should be auto-approved, denied, or passed to user for decision.

## Decision Format

**Hook returns PermissionRequest format:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",  // or "deny"
      "message": "Optional denial reason"  // Only for deny
    }
  }
}
```

**When LLM returns "ask":** Hook returns `null`, allowing normal permission dialog to appear for user decision.

## Precedence Rules

| Layer 1 (settings.json) | Layer 2 (Hook) | Result |
|-------------------------|----------------|--------|
| Match found | Hook not invoked | ✅ Instant approval |
| No match | Hook returns allow | ✅ Approval (dialog cleared) |
| No match | Hook returns deny | ❌ Denial with message |
| No match | Hook returns null | ❓ Show dialog to user |

## Best Practices

### When to Add to settings.json permissions.allow

Add operations you're **absolutely certain** are always safe:
- Read operations (Read, Glob, Grep, WebFetch, WebSearch)
- Writes to safe directories (workspaces/, .claude/, docs/, plans/)
- Safe bash commands (ls, git status, git diff)
- Performance-critical operations that happen frequently

These operations proceed instantly without hook evaluation.

### When to Let Hook Evaluate

Let hook handle operations that need **context-aware** evaluation:
- Potentially destructive commands (rm, DROP TABLE, DELETE)
- Operations with **safe and unsafe variations** (git push vs git push --force)
- Package installations (npm install, pip install)
- Script execution outside safe directories
- Operations where you want policy-based decisions and audit logs

### Migration from PreToolUse Fast-Path

If you previously had fast-path logic in PreToolUse hooks:

1. **Move fast-path rules to settings.json** - These operations will bypass the hook entirely
2. **Remove fast-path function from hook code** - No longer needed
3. **Keep LLM evaluation for ambiguous operations** - Hook only runs for these now

## Optimization Path

**Already optimized!** By moving from PreToolUse to PermissionRequest:

1. ✅ Fast-path operations in settings.json (instant, no hook call)
2. ✅ Hook only evaluates ambiguous operations (reduced load by ~95%)
3. ✅ No redundant evaluation overhead
4. ✅ Clean separation between instant approval and evaluation

## Troubleshooting

### "Why is operation X instant but operation Y takes 2 seconds?"

- **Instant**: Matches settings.json pattern (hook never runs)
- **2 seconds**: Doesn't match settings.json, hook uses LLM evaluation

**Solution:** If operation Y should be instant, add it to settings.json `permissions.allow`.

### "The dialog briefly appears then disappears when hook approves"

This is expected PermissionRequest behavior. The dialog appears (because no settings.json match), hook evaluates and returns `allow`, then dialog clears. This is a minor UX trade-off for the performance benefits.

### "Can I see all hook decisions?"

Yes! Enable logging:
```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_LOG=1
```

Decisions are logged to `.claude/hooks/permission-request/hook-decisions.jsonl`.

**Note:** Only operations that reach the hook are logged. Fast-path operations (settings.json matches) are not logged by the hook.

### "How do I debug which operations reach the hook?"

Enable debug mode:
```bash
export INVIBE_AGENT_PERMISSION_REQUEST_HOOK_DEBUG=1
```

Check `.claude/hooks/permission-request/debug.log` for hook execution traces.

## Summary

| Layer | Execution Order | Purpose | Speed | When It Runs | Context-Aware |
|-------|----------------|---------|-------|--------------|---------------|
| Static Permissions | 1st | Instant approval for safe operations | Instant | Always checked first | No |
| PermissionRequest Hook | 2nd (fallback) | Evaluate ambiguous operations | 1-2s (LLM) | Only when dialog would appear | Yes |

**Key Insights:**
- Static permissions checked FIRST, before hook runs
- Operations matching settings.json proceed instantly (hook never invoked)
- Hook only runs for operations that would trigger permission dialog
- For maximum performance: Add safe operations to settings.json
- For context-aware evaluation: Let ambiguous operations reach the hook
- ~95% of operations bypass hook via settings.json fast-path
