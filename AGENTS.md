<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared agent workflow

- Treat this `AGENTS.md` as the canonical instruction file for Codex, Claude Code, and ZCode Agent.
- Use a separate Git branch or worktree per agent. Do not let two agents edit the same files concurrently.
- Never place device identifiers, precise GPS coordinates, API keys, Auth0 tokens, or Notehub secrets in commits, prompts, fixtures, or logs.
- Run the production build and lint before handing work to another agent. Report pre-existing warnings separately from new failures.
- Do not deploy or change hosted environment variables unless the user explicitly authorizes that environment change.
