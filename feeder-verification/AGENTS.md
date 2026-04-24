# AGENTS.md - Feeder Verification Workspace Guide

## Scope and Canonical Targets

- Primary app for current work: `feeder-verification/` (Next.js 16 + React 19 + Prisma).
- Legacy Vite/Express implementation remains under `artifacts/` and is still used for some operational scripts/docs.
- Archived app is `archive/smt-app/` (do not modify unless explicitly requested).

## Read First

- Workspace overview: [../README.md](../README.md)
- Next.js app quick usage: [README.md](README.md)
- Documentation index: [../docs/INDEX.md](../docs/INDEX.md)
- API and testing docs (legacy API stack): [../docs/guides/API_REFERENCE.md](../docs/guides/API_REFERENCE.md), [../docs/guides/API_TESTING_GUIDE.md](../docs/guides/API_TESTING_GUIDE.md)

## Mandatory Tooling Rules

- Use `pnpm` for workspace/package operations.
- At workspace root, `preinstall` blocks non-`pnpm` package managers.
- Respect Next.js 16 changes: do not assume older Next.js behavior.

## High-Value Commands

From workspace root (`../`):

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

From this folder (`feeder-verification/`):

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm prisma:generate
pnpm prisma:migrate:dev
pnpm prisma:seed
```

Legacy stack commands (only when task targets `artifacts/*`):

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/feeder-scanner run dev
pnpm --filter @workspace/db run push
```

## Architecture Snapshot

Next.js app (`src/`):

- `app/`: route groups (`(app)`, `(auth)`) and API handlers (`app/api/`).
- `components/`: domain UI (`bom/`, `scanner/`, `splicing/`, `verification/`) and shared UI in `ui/`.
- `lib/`: auth, route guards, Prisma client, scan matching, progress helpers.
- `store/`: Zustand state stores for changeover/verification/splicing flows.
- `prisma/`: `schema.prisma`, migrations, seed script.

Monorepo shared packages (root-level):

- `lib/db`: Drizzle ORM schema/migrations for legacy API stack.
- `lib/api-zod`, `lib/api-client-react`: shared API contract/client packages.

## Common Pitfalls

- Do not mix database workflows: Next.js app uses Prisma (`feeder-verification/prisma`), legacy stack uses Drizzle (`lib/db`).
- Check task scope before editing: many docs reference legacy `artifacts/*` services.
- If build/tooling behavior looks unfamiliar, verify framework-specific docs in `node_modules/next/dist/docs/`.

## Change Discipline

- Keep changes scoped to the requested app area (`feeder-verification` vs `artifacts`).
- Prefer minimal patches; avoid broad refactors unless requested.
- When behavior changes, run relevant `typecheck`/`build` scripts for the touched package(s).
