---
root: true
targets: ["*"]
description: "Project overview and main rules"
globs: ["**/*"]
---

# nomnom

## Language

All artifacts MUST be written in English, regardless of the language used in the conversation. This includes:

- Source code: identifiers, comments, log and error messages
- Documentation: README, rules, skills, OpenSpec proposals, designs, specs and tasks
- Git: commit messages, branch names, pull request titles and descriptions
- Configuration files and any other generated files

## Tooling

- Runtime and package manager: Bun (`bun install`, `bun run <script>`, `bun test`, `bunx <pkg>`). The repository is a Bun workspace (`apps/*`, `packages/*`); see the architecture rule.
- Formatter and linter: Biome (`bun run check`, `bun run check:fix`)
- Type checking: `bun run typecheck` (`tsc --noEmit` over all workspaces). Bun does not check types.
- Tests: `bun test` (or `bun run test`) runs the tests of every workspace
- Running the CLI during development: `bun run nomnom <args>`
- Before finishing a task, run `bun test`, `bun run typecheck` and `bun run check`
- Pre-commit: Husky runs lint-staged (Biome on staged files), then `bun run typecheck`
- AI rules: rulesync. Edit files in `.rulesync/rules/`, then run `bun run rules:generate`. Never edit the generated, gitignored outputs (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/`, `.agents/memories/`) directly.
- Spec-driven development: OpenSpec (`openspec/`). Use the `openspec-*` skills (or `/opsx:*` commands in Claude Code) to propose, apply and archive changes. OpenSpec owns `.claude/skills/`, `.claude/commands/opsx/` and `.agents/skills/`; refresh them with `bun run openspec:update` after upgrading OpenSpec, never via rulesync.
