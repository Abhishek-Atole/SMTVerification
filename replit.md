# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **PDF Export**: jspdf + jspdf-autotable
- **Excel Export**: xlsx
- **CSV Parsing**: papaparse

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── feeder-scanner/     # SMT Feeder Scanner React frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Application: SMT Feeder Scanning & Verification System

A professional industry-grade system for SMT (Surface Mount Technology) factory floors.

### Features

- **BOM Management**: Upload/create Bills of Materials with feeder number lists. Supports CSV upload.
- **Production Sessions**: Track sessions with company name, customer name, panel name, supervisor/operator names, shift (Morning/Afternoon/Night), date, and company logo.
- **Feeder Scanning**: Real-time barcode/manual feeder number scanning verified against the BOM. Immediate OK (green flash) or REJECT (red flash) feedback. Auto-focused input for barcode scanner wedge.
- **Live Metrics**: Progress bar, elapsed timer, scan counts, OK/reject breakdown.
- **End Session**: Close sessions with optional production count, recording end time automatically.
- **PDF Export**: Full professional report with session info, verification summary, and scan log table.
- **Excel Export**: Multi-sheet Excel with session info and scan log.
- **Session History**: Searchable list of all past sessions.

### Database Schema

- `boms` — Bill of Materials records
- `bom_items` — Individual feeder entries in a BOM (feederNumber, partNumber, description, location, quantity)
- `sessions` — Production sessions (company info, shift, BOM reference, start/end times, status)
- `scan_records` — Individual feeder scans with OK/reject status

### API Routes (under /api)

- `GET /bom` — list BOMs
- `POST /bom` — create BOM
- `GET /bom/:id` — get BOM with items
- `DELETE /bom/:id` — delete BOM
- `POST /bom/:id/items` — add feeder item to BOM
- `GET /sessions` — list sessions
- `POST /sessions` — start session
- `GET /sessions/:id` — get session with scans
- `PATCH /sessions/:id` — update session (end, count, status)
- `POST /sessions/:id/scans` — scan a feeder (auto-verifies against BOM)
- `GET /sessions/:id/summary` — get verification summary stats
- `GET /sessions/:id/report` — get full report data

### Frontend Pages

- `/` — Operator Dashboard
- `/bom` — BOM Manager
- `/bom/:id` — BOM Detail (add items, CSV upload)
- `/session/new` — New Session Setup
- `/session/:id` — Active Scanning View (the core view)
- `/session/:id/report` — Session Report with exports
- `/sessions` — Session History

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

### `artifacts/feeder-scanner` (`@workspace/feeder-scanner`)

React + Vite frontend for the SMT Feeder Scanner. Uses `@workspace/api-client-react` for generated React Query hooks.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Schema: boms, bom_items, sessions, scan_records.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec for the feeder scanner system. Run codegen: `pnpm --filter @workspace/api-spec run codegen`

Production migrations are handled by Replit when publishing. In development, use `pnpm --filter @workspace/db run push`.
