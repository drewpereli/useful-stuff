# Permission Policy for inVibe Agent

Auto-approve normal development. Prompt for destructive actions.

**Note**: settings.json auto-approves reads, writes to safe directories, and basic git commands. This hook only evaluates operations not covered there.

## Auto-Approve

- **Git operations**: add, commit, push to feature branches (not the main branch)
- **Package management**: `npm install` (no args), `npm run <script>`
- **Database reads**: SELECT, EXPLAIN, CREATE INDEX, PRAGMA

Examples:
- `git add . && git commit -m 'Add feature'`
- `npm run test`
- `sqlite3 projects.db 'CREATE INDEX idx_question ON answers(question_id)'`

## Prompt User

- **Destructive operations**: rm -rf, DROP TABLE, DELETE without WHERE, force push to main/master
- **System changes**: chmod outside workspace, modifying /etc
- **New packages**: npm install <package>, pip install <package>
- **Untrusted scripts**: /tmp/script.py, ~/Downloads/script.js

Examples:
- `rm -rf workspaces/`
- `git push --force origin main`
- `npm install untrusted-package`
- `python /tmp/downloaded-script.py`

## Auto-Deny

Malformed commands or invalid parameters.

Examples:
- `asdfjkl;`
- Nonsensical paths

## Decision Logic

1. Standard dev task → AUTO-APPROVE
2. Risks data loss → PROMPT
3. Malformed → AUTO-DENY
4. **When in doubt → PROMPT**
