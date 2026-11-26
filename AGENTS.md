# Repository Guidelines

- Generic and shared helpers live in `/src/lib/utils`.
- Server infrastructure lives in `/src/lib/server/core`; domain logic lives in `/src/lib/server/domain`; frontend presentation and browser integrations live in `/src/lib/client`.
- Keep tests beside their modules and use direct imports when moving code; do not leave forwarding modules at the old paths.
- Use Bun exclusively (`bun install`, `bun run ...`, `bun:sqlite`).
- Do not build the project unless explicitly asked.
- Create tests only when they are truly necessary.
- Avoid creating functions that are used only once when possible.
- Do not use overly defensive programming. Add checks where necessary; otherwise, trust the types.
- Prefer the smallest change that fixes the root cause. Do not add fallback logic when an enforced data invariant is enough.
- After creating a feature, fix, or refactor, provide a conventional commit message.
