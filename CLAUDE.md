# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

A personal collection of standalone scripts, CLI tools, templates, and config snippets kept as a portable toolkit for setting up new machines. There is no unified build system, test suite, or application — each tool is independent.

## Repository Layout

- **`bin/`** — Executable scripts and compiled CLI tools, added to `$PATH`
- **`bin/_*-src/`** — Source directories for compiled tools (underscore prefix = source, not directly executed)
- **`cheat-sheets/`** — Pug-templated HTML cheat sheets (postgres, regex, ruby), built with `node build.js`
- **`misc/`** — Config snippets (Apache vhosts, VS Code snippets/tasks, gitignore templates)
- **`ruby/`** — Rails generators (e.g., `rspec_request_scaffold`)
- **`drew-scratch.js`** — Scratch file (gitignored pattern: `drew-scratch*`, `drew_scratch*`)

## How Bin Scripts Work

Shell wrapper scripts in `bin/` delegate to source directories:
- **TypeScript/Node tools**: Source in `bin/_<name>-src/`, compiled to `dist/`. Wrapper script runs `node <src-dir>/dist/index.js`.
- **Rust tools**: Source in `bin/_<name>-src/`, compiled binary symlinked from `bin/` (e.g., `find-rails-schema -> _find-rails-schema-src/target/release/find-rails-schema`).
- **Simple scripts**: Directly executable shell/Node/Ruby scripts in `bin/`.

## Building Individual Tools

Each tool has its own build process. There is no top-level build command.

- **TypeScript tools** (setup-dev-branch, merge-squash-super, git-delete-multiple): `cd bin/_<name>-src && npm run build` (runs `tsc`). The `setup-dev-branch` build also concatenates output into the wrapper script via `build.sh`.
- **Rust tools** (find-rails-schema, namespace-svg-ids): `cd bin/_<name>-src && cargo build --release`
- **Cheat sheets**: `cd cheat-sheets && node build.js` (outputs to `cheat-sheets/dist/`)
- **Permission hook**: `cd bin/claude-permission-request-hook` — TypeScript run directly via Node (no build step, uses native TS with Node 24). Tests: `npx vitest`

## Key Tools

- **`setup-dev-branch`** — Squash-merges multiple feature branches into a `dev` branch. Caches branch list in `_setup-dev-branch-cache.json`.
- **`merge-squash-super`** — Interactive fuzzy-search branch picker that squash-merges the selected branch.
- **`git-delete-multiple`** — Interactive checkbox UI to bulk-delete git branches.
- **`linear-commit`** — Commits with a Linear issue ID/title and marks the issue complete. Requires `LINEAR_API_KEY` env var.
- **`make-branch-migrations-most-recent`** — Retimestamps Rails migration files on a branch to be newer than master's. Supports `--down-only`.
- **`find-rails-schema`** — Rust CLI to search `db/schema.rb` for a table definition by model name.
- **`namespace-svg-ids`** — Rust CLI to prefix SVG element IDs with the filename to avoid collisions.
- **`claude-permission-request-hook`** — Claude Code PermissionRequest hook that auto-approves safe operations using LLM evaluation. Kill switch: `CLAUDE_GLOBAL_PERMISSION_REQUEST_HOOK_DISABLE=1`.
