# Permission Policy (Global Hook)

Reduce approval fatigue for safe operations. Use judgment for everything else.

**Note**: settings.json auto-approves reads, writes to safe directories, and some basic commands. This hook only evaluates operations not covered there.

## Auto-Approve

- **Writing to git-tracked files**: If the file is already tracked by git in the current repo, writing to it is safe
- **Build & test**: running tests, linters, formatters, type checkers
- **Safe package scripts**: `npm test`, `npm run lint`, `npm run build`, `bundle exec rspec`, `yarn test`, `make build` — scripts that are clearly local dev tasks
- **Database reads**: SELECT, EXPLAIN, PRAGMA

Examples:
- `npm run test`
- `bundle exec rspec`
- `make build`

## Use Judgment

These require looking at the specific command and context. Approve if it looks like normal development work; prompt if it seems risky or unusual.

- **Git operations**: Consider what's being done. `git add` and `git commit` on a feature branch are generally fine. `git push` needs more scrutiny — is it a feature branch or main? Is there a `--force`? `git reset`, `git checkout .`, `git clean` can discard work.
- **New dependencies**: `npm install <package>` or `pip install <package>` — a well-known package in a dev context is probably fine, but prompt if unsure about the package.
- **File deletion**: `rm` of a single generated file is different from `rm -rf` of a directory.
- **Package scripts**: The script name matters. `npm test` and `npm run lint` are safe. `npm run deploy:production` or `npm run migrate` could have side effects — prompt for scripts that sound like they touch production, deploy, migrate, or seed data.
- **Database writes**: INSERT/UPDATE with a WHERE clause in a dev database is different from DROP TABLE.

## Always Prompt

- **Force push to main/master**: `git push --force origin main`
- **Bulk destructive operations**: `rm -rf` on project directories, DROP TABLE, DELETE without WHERE
- **System changes**: chmod outside workspace, modifying /etc, installing global packages
- **Untrusted scripts**: running scripts from /tmp, ~/Downloads, or other non-project paths
- **Docker/infra destruction**: docker rm, docker system prune, kubectl delete

## Auto-Deny

Malformed commands or clearly invalid parameters.

## Decision Logic

1. Read-only or clearly safe dev operation → AUTO-APPROVE
2. Needs context to judge → use your judgment, lean toward PROMPT if unsure
3. Risks data loss or affects shared state → PROMPT
4. Malformed → AUTO-DENY
5. **When in doubt → PROMPT**
