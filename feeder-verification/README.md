# README.md — Feeder Verification System

## Quick Start

```bash
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET
npx prisma db push
npx prisma db seed            # seeds demo users
npm run dev
```

## Environment Variables (.env.example)

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/feeder_verification"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
```

## User Roles

| Role     | Own Changeovers | All Changeovers | Create | Scan | Override |
|----------|-----------------|-----------------|--------|------|----------|
| operator | yes read+write  | no              | yes    | yes  | no       |
| qa       | yes read        | yes read        | no     | no   | no       |
| engineer | yes read+write  | yes read+write  | yes    | yes  | yes      |
| admin    | yes full        | yes full        | yes    | yes  | yes      |

## Verification Flow

1. Operator starts changeover and selects BOM.
2. Scan spool barcode, system matches MPN1/MPN2/MPN3/UCAL part number.
3. Supplier and make are auto-resolved from matched alternative.
4. Operator scans LOT code (optional), then report stores it.
5. Progress is verified slots divided by total BOM slots.
6. 100% verification unlocks splicing automatically.

## Concurrent Safety

- UNIQUE(changeover_id, line_item_id) in DB prevents double-scan.
- Optimistic locking with version column on changeovers.
- Idempotency keys on write endpoints allow safe retry.

## API Key Endpoints

- POST /api/changeovers                    Create changeover
- POST /api/changeovers/:id/scans          Submit scan (MPN to LOT)
- GET  /api/changeovers/:id/progress       Get verification progress
- POST /api/changeovers/:id/splices        Record splice
- GET  /api/changeovers/:id/report         Export full report
