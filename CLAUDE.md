# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMT Verification System - A comprehensive Surface Mount Technology (SMT) feeder scanning and verification system with BOM management, reporting, and analytics. The system tracks feeder/spool conditions, verifies components during production, and generates detailed reports.

## Common Commands

### Development

```bash
# Start API server (runs on localhost:3000)
cd artifacts/api-server && pnpm dev

# Start frontend (runs on localhost:5173)
cd artifacts/feeder-scanner && pnpm dev

# Run database migrations
cd lib/db && pnpm push

# Seed default users (after migrations)
pnpm --filter @workspace/api-server run seed:users

# Run full build (typecheck + build all packages)
pnpm build
```

### Testing

```bash
# Run API server tests
cd artifacts/api-server && pnpm test

# Run frontend tests
cd artifacts/feeder-scanner && pnpm test
```

### Database Operations

```bash
# Push schema to database
cd lib/db && pnpm push

# Force push (drops tables)
cd lib/db && pnpm push-force
```

### System Control

```bash
# System restart (restarts all services)
./scripts/system-restart-recovery.sh

# Check system status
curl http://localhost:3000/api/health
```

### Test Endpoints

```bash
# Seed test data
curl -X POST http://localhost:3000/api/test/seed

# Clear database (requires header)
curl -X POST http://localhost:3000/api/test/clear -H "x-confirm-clear: CLEAR_DATABASE_CONFIRMED"

# View statistics
curl http://localhost:3000/api/test/stats
```

## Architecture

### Monorepo Structure (pnpm workspaces)

```
artifacts/
├── api-server/       # Express.js backend API (port 3000)
├── feeder-scanner/   # React frontend (Vite, port 5173)
└── mockup-sandbox/  # UI component testing

lib/
├── db/               # Database schema (Drizzle ORM, PostgreSQL)
├── api-client-react/ # React query + fetch client
└── api-zod/         # Zod schemas for API validation
```

### Data Flow

1. **Frontend** (feeder-scanner) → React with Vite, wouter routing, TanStack Query
2. **API** (api-server) → Express.js with rate limiting, JWT auth, pino logging
3. **Database** → PostgreSQL with Drizzle ORM migrations
4. **Shared** → lib/api-zod for type-safe API contracts

### Key API Routes

- `/api/auth/*` - Authentication (login, change-password)
- `/api/bom/*` - BOM management (CRUD, import CSV)
- `/api/sessions/*` - Verification sessions
- `/api/scans/*` - Feeder scan operations
- `/api/audit/*` - Audit trail (7 endpoints)
- `/api/traceability/*` - Traceability queries (7 endpoints)

### Database Schema

Core tables in lib/db/src/schema/:
- `users` - Operator/QA/Engineer roles
- `boms` - Bill of Materials (16 fields including MPN, manufacturer, cost, lead time)
- `sessions` - Verification sessions with mode (AUTO/MANUAL)
- `scans` - Individual feeder scans with actual vs expected comparison
- `audit_logs` - Full action audit trail

### Configuration

Environment variables in `.env`:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - Authentication secret
- `COMPANY_NAME` - Report branding
- `COMPANY_LOGO_PATH` - Report logo path

## Important Patterns

### Session Mode System

Sessions support two modes:
- **AUTO** (default) - Automatic verification
- **MANUAL** - Password-protected verification

### Scan Verification

Scans compare actual scanned values against BOM expected values:
- PART# or MPN accepted as identifier
- Lot number, date code, reel ID tracked
- Status: pass/fail/alternate/mismatch

### Report Generation

PDF reports generated server-side with PDFKit, including:
- Session summary with FPY metrics
- Actual vs expected component comparison
- SMT_ID format: SMT-{sessionId}-{feederNumber}

## Default Credentials

After running migrations and seeding:

| Username  | Password   | Role     |
|-----------|------------|----------|
| operator1 | Operator@123 | operator |
| operator2 | Operator@123 | operator |
| qa1       | QA@123456  | qa       |
| engineer1 | Engineer@123 | engineer |

Change passwords in production via POST `/api/auth/change-password`.