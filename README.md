# Relay

Personal self-hosted MCP Gateway with OAuth 2.1, per-client permissions, built-in personal tool providers, and QuickJS Code Mode.

## Stack

- **Runtime:** Bun (`bun:sqlite`)
- **Framework:** TanStack Start (pure SPA, `defaultSsr: false`) + React 19 + React Compiler
- **UI:** Tailwind CSS v4 + shadcn/ui (`base-nova`, `@base-ui/react`) + Lucide
- **Database:** SQLite + Drizzle ORM (`drizzle-orm/bun-sqlite`) + FTS5
- **Auth & MCP:** Better Auth (`@better-auth/mcp`, `@better-auth/cimd`, `@better-auth/oauth-provider`) + `@modelcontextprotocol/sdk`
- **Code Mode Sandbox:** QuickJS WASM (`quickjs-emscripten` sync build) + SQLite FTS5 (BM25)
- **Deployment:** Docker (`oven/bun:1.4.4-slim`) behind Caddy

## Development

```bash
cp .env.example .env
bun install
bun run db:init
bun run owner:setup you@example.com "your-strong-password" "Vince"
bun run dev
```

## Checks

```bash
bun run routes:generate
bun run lint
bun run typecheck
bun run test
bun run knip
```
