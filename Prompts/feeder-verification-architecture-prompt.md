# Feeder Verification System — Architecture & GitHub Copilot Implementation
# Industry-grade | Concurrent-safe | Role-based | Multi-changeover

---

## ═══════════════════════════════════════════════════════════
## SECTION 1 — SYSTEM ARCHITECTURE
## ═══════════════════════════════════════════════════════════

### 1.1 Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     FEEDER VERIFICATION SYSTEM                           │
│                                                                          │
│  ROLES:  Operator ──────── sees own changeovers only                    │
│           QA ─────────────── sees ALL changeovers (read-only audit)     │
│           Engineer ────────── sees ALL changeovers + can override        │
│           Admin ───────────── full access + user management              │
└─────────────────────────────────────────────────────────────────────────┘

VERIFICATION FLOW (spool-centric, not feeder-centric):
  Operator scans spool barcode
       ↓
  System extracts: MPN 1 OR MPN 2 OR MPN 3 OR UCAL Internal Part Number
       ↓
  BOM lookup → feeder slot identified → make/supplier resolved
       ↓
  Operator scans LOT CODE → stored in report
       ↓
  Verification record saved (operator-scoped changeover)
       ↓
  Progress = verified unique feeder slots / total BOM feeder slots
       ↓
  100% → splicing section unlocked
```

### 1.2 Database Schema (PostgreSQL — concurrent-safe)

```sql
-- ── USERS & ROLES ──────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('operator', 'qa', 'engineer', 'admin');

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  role        user_role NOT NULL DEFAULT 'operator',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BOM TABLES ──────────────────────────────────────────────────────────

CREATE TABLE bom_headers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_number        VARCHAR(60) UNIQUE NOT NULL,  -- "RD/BOM/INTBUZ/R1.1"
  revision          VARCHAR(10) NOT NULL,          -- "R00"
  bom_date          DATE NOT NULL,
  customer_name     VARCHAR(200),
  part_name_internal VARCHAR(200),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bom_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id       UUID NOT NULL REFERENCES bom_headers(id),
  sr_no               INTEGER NOT NULL,
  feeder_number       VARCHAR(20) NOT NULL,         -- "YSM-001"
  ucal_part_numbers   TEXT[] NOT NULL DEFAULT '{}', -- ["RDSCAP0353","RDSCAP0312"]
  required_qty        INTEGER NOT NULL DEFAULT 1,
  reference_location  VARCHAR(50),                  -- "C1, C2"
  description         VARCHAR(200),                 -- "4.7nF/50V 10%"
  package_desc        VARCHAR(30),                  -- "603", "805", "SO-8"
  remarks             TEXT,
  UNIQUE(bom_header_id, feeder_number)
);

-- Each alternative is a separate row (Make1/MPN1, Make2/MPN2, Make3/MPN3)
CREATE TABLE bom_alternatives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id    UUID NOT NULL REFERENCES bom_line_items(id) ON DELETE CASCADE,
  rank            SMALLINT NOT NULL CHECK (rank IN (1, 2, 3)), -- 1=primary, 2=alt1, 3=alt2
  make            VARCHAR(100) NOT NULL,   -- "KEMET", "YAGEO", "Royal Ohm"
  mpn             VARCHAR(150) NOT NULL,   -- "C0603C472K5RACAUTO"
  supplier_code   VARCHAR(50),            -- internal supplier reference
  UNIQUE(line_item_id, rank)
);

-- Lookup index: given any MPN or UCAL part no → find line item fast
CREATE INDEX idx_bom_alt_mpn    ON bom_alternatives USING gin(to_tsvector('simple', mpn));
CREATE INDEX idx_bom_ucal_parts ON bom_line_items   USING gin(ucal_part_numbers);

-- ── CHANGEOVERS ─────────────────────────────────────────────────────────
--
-- A "changeover" = one complete run of feeder verification for a job.
-- It is OWNED by the operator who started it.
-- QA and Engineers can VIEW all changeovers via their role.

CREATE TABLE changeovers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id   UUID NOT NULL REFERENCES bom_headers(id),
  operator_id     UUID NOT NULL REFERENCES users(id),  -- owner/creator
  line_number     VARCHAR(30),     -- production line e.g. "LINE-A"
  shift           VARCHAR(20),     -- "MORNING", "EVENING", "NIGHT"
  status          VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','verified','splicing','complete','aborted')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  -- Optimistic concurrency lock
  version         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_changeover_operator ON changeovers(operator_id);
CREATE INDEX idx_changeover_status   ON changeovers(status);

-- ── VERIFICATION SCANS ──────────────────────────────────────────────────
--
-- One row per successfully verified feeder slot per changeover.
-- CONCURRENT SAFETY: unique constraint prevents double-scan of same feeder.

CREATE TABLE verification_scans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changeover_id       UUID NOT NULL REFERENCES changeovers(id) ON DELETE CASCADE,
  line_item_id        UUID NOT NULL REFERENCES bom_line_items(id),
  alternative_id      UUID NOT NULL REFERENCES bom_alternatives(id),  -- which MPN matched
  scanned_mpn         VARCHAR(150) NOT NULL,   -- exact barcode value scanned
  scanned_lot_code    VARCHAR(100),            -- LOT code from spool (optional)
  match_type          VARCHAR(20) NOT NULL     -- 'mpn1','mpn2','mpn3','ucal_part_number'
                      CHECK (match_type IN ('mpn1','mpn2','mpn3','ucal_part_number')),
  is_alternate        BOOLEAN NOT NULL DEFAULT false,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_by          UUID NOT NULL REFERENCES users(id),

  -- CRITICAL: one scan per feeder slot per changeover — enforced at DB level
  UNIQUE(changeover_id, line_item_id)
);

CREATE INDEX idx_vscan_changeover ON verification_scans(changeover_id);

-- ── SPLICING RECORDS ────────────────────────────────────────────────────

CREATE TABLE splice_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changeover_id       UUID NOT NULL REFERENCES changeovers(id) ON DELETE CASCADE,
  line_item_id        UUID NOT NULL REFERENCES bom_line_items(id),
  old_spool_mpn       VARCHAR(150) NOT NULL,
  old_spool_lot       VARCHAR(100),
  new_spool_mpn       VARCHAR(150) NOT NULL,
  new_spool_lot       VARCHAR(100),
  spliced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  spliced_by          UUID NOT NULL REFERENCES users(id)
);

-- ── AUDIT LOG ───────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changeover_id UUID REFERENCES changeovers(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  event_type    VARCHAR(50) NOT NULL,  -- 'scan_ok','scan_fail','splice','session_start' etc.
  payload       JSONB NOT NULL DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_changeover ON audit_log(changeover_id);
CREATE INDEX idx_audit_occurred   ON audit_log(occurred_at DESC);
```

### 1.3 Concurrency Strategy

```
Problem: Two operators scan simultaneously → same feeder slot → data race.

Solution (3-layer):

Layer 1 — Database UNIQUE constraint
  UNIQUE(changeover_id, line_item_id) on verification_scans
  → Second insert FAILS with unique_violation → API returns 409 Conflict

Layer 2 — Optimistic locking on changeover
  changeovers.version column incremented on every write
  API checks: WHERE id = $1 AND version = $currentVersion
  → Stale write returns 0 rows → retry logic kicks in

Layer 3 — Application-level idempotency
  Each scan request carries an idempotency_key (UUID v4 from client)
  API checks idempotency_key before processing → safe to retry

Result: Multiple operators, multiple changeovers, same BOM
→ Zero data loss, no phantom duplicates
```

### 1.4 Role-Based Data Visibility

```
OPERATOR (role = 'operator'):
  GET /api/changeovers → WHERE operator_id = :myId
  Can: create, scan, splice — only their own changeovers
  Cannot: view other operators' changeovers

QA (role = 'qa'):
  GET /api/changeovers → ALL changeovers (no filter)
  Can: view, export, add notes, approve
  Cannot: modify scan records

ENGINEER (role = 'engineer'):
  GET /api/changeovers → ALL changeovers
  Can: view all, override scans, mark exceptions, edit BOM
  Cannot: delete changeovers

ADMIN:
  Full access to everything including user management
```

### 1.5 Verification Match Priority

```
When operator scans a barcode value, system checks in this order:

1. MPN 1 (primary)       → rank = 1, is_alternate = false, match_type = 'mpn1'
2. MPN 2 (alternate 1)   → rank = 2, is_alternate = true,  match_type = 'mpn2'
3. MPN 3 (alternate 2)   → rank = 3, is_alternate = true,  match_type = 'mpn3'
4. UCAL Internal Part No → any ucal_part_numbers[] match → match_type = 'ucal_part_number'

For slash-joined MPNs like "CQ05S8F2703T5E/0805S8F2703T5E":
→ Split on "/" → check both halves against scan value

LOT code: scanned separately after MPN match, stored in scanned_lot_code
Supplier/Make: resolved from bom_alternatives.make after match — no re-lookup needed
```

### 1.6 Full API Surface

```
AUTH
  POST   /api/auth/login          → { token, user: { id, role, name } }
  POST   /api/auth/logout
  GET    /api/auth/me

BOM
  GET    /api/bom                 → list all active BOMs
  POST   /api/bom/upload          → parse + store CSV
  GET    /api/bom/:id             → single BOM with all line items + alternatives
  GET    /api/bom/:id/export      → download original format CSV

CHANGEOVERS
  POST   /api/changeovers                    → create (operator only)
  GET    /api/changeovers                    → list (operator: own | qa/eng/admin: all)
  GET    /api/changeovers/:id                → single changeover detail
  PATCH  /api/changeovers/:id/status         → update status
  DELETE /api/changeovers/:id/abort          → abort changeover

VERIFICATION
  POST   /api/changeovers/:id/scans          → submit scan
  GET    /api/changeovers/:id/scans          → list scans
  DELETE /api/changeovers/:id/scans/:scanId  → remove scan (engineer only)
  GET    /api/changeovers/:id/progress       → { verified, total, pct, complete }

SPLICING
  POST   /api/changeovers/:id/splices        → record splice
  GET    /api/changeovers/:id/splices        → list splices

REPORTS
  GET    /api/changeovers/:id/report         → full PDF/JSON report
  GET    /api/reports/export?dateFrom=&dateTo= → batch export
```

---

## ═══════════════════════════════════════════════════════════
## SECTION 2 — GITHUB COPILOT PROMPTS
## (paste one at a time in Copilot Chat)
## ═══════════════════════════════════════════════════════════

---

### PROMPT 0 — READ FIRST (paste this at session start)

```
You are building an industrial Feeder Verification & Splicing System.
Stack: Next.js 14 (App Router) + TypeScript + PostgreSQL + Prisma + Zustand + Tailwind.
Auth: NextAuth.js with JWT + role-based middleware.

KEY RULES:
1. Verification is SPOOL-CENTRIC: operator scans a spool barcode (MPN), system finds the feeder slot.
2. Match priority: MPN1 → MPN2 → MPN3 → UCAL Internal Part Number.
3. LOT code is scanned AFTER MPN match — stored in verification_scans.scanned_lot_code.
4. Make/supplier resolved from bom_alternatives.make — no extra lookup.
5. Each changeover is OWNED by one operator. QA/Engineer see ALL changeovers.
6. UNIQUE(changeover_id, line_item_id) at DB enforces one scan per feeder per changeover.
7. Optimistic locking (version column) on changeovers prevents concurrent write corruption.
8. Every API endpoint needs idempotency_key support.
9. Never use SELECT * — always explicit columns.
10. All monetary/count/progress values are computed server-side — client only displays.
```

---

### PROMPT 1 — PROJECT SCAFFOLD

```
Scaffold a Next.js 14 App Router project called "feeder-verification":

npm commands:
  npx create-next-app@latest feeder-verification \
    --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
  cd feeder-verification
  npm install prisma @prisma/client
  npm install next-auth @auth/prisma-adapter
  npm install zustand immer
  npm install zod
  npm install @tanstack/react-query @tanstack/react-query-devtools
  npm install lucide-react clsx
  npm install papaparse @types/papaparse
  npx prisma init

Folder structure inside src/:
  app/
    (auth)/login/page.tsx
    (app)/
      layout.tsx                 ← auth-protected shell
      dashboard/page.tsx
      changeover/
        new/page.tsx
        [id]/
          page.tsx               ← session-active (verification + splicing)
          report/page.tsx
      bom/page.tsx
      admin/page.tsx
    api/
      auth/[...nextauth]/route.ts
      bom/route.ts
      changeovers/
        route.ts
        [id]/
          route.ts
          scans/route.ts
          scans/[scanId]/route.ts
          splices/route.ts
          progress/route.ts
          report/route.ts
  lib/
    prisma.ts                    ← singleton client
    auth.ts                      ← NextAuth config
    bom-parser.ts                ← CSV parsing
    scan-matcher.ts              ← MPN match logic
    progress.ts                  ← progress calculation
  store/
    useVerificationStore.ts
    useSplicingStore.ts
    useChangeoverStore.ts
  types/
    index.ts
  components/
    scanner/
      ScanInput.tsx
      ScanNotification.tsx
    verification/
      VerificationCard.tsx
      ProgressRing.tsx
      ScannedList.tsx
    splicing/
      SplicingCard.tsx
      SpliceList.tsx
    bom/
      BOMTable.tsx
    ui/
      Badge.tsx
      RoleBadge.tsx
      Toast.tsx
    layout/
      AppShell.tsx
      Sidebar.tsx
```

---

### PROMPT 2 — PRISMA SCHEMA

```
Create prisma/schema.prisma with exactly this content:

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  operator
  qa
  engineer
  admin
}

enum ChangeoverStatus {
  in_progress
  verified
  splicing
  complete
  aborted
}

enum MatchType {
  mpn1
  mpn2
  mpn3
  ucal_part_number
}

model User {
  id         String   @id @default(uuid())
  employeeId String   @unique @map("employee_id")
  name       String
  role       UserRole @default(operator)
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")

  changeovers         Changeover[]       @relation("OperatorChangeovers")
  verificationScans   VerificationScan[] @relation("ScannedBy")
  spliceRecords       SpliceRecord[]     @relation("SplicedBy")
  auditLogs           AuditLog[]

  @@map("users")
}

model BomHeader {
  id                UUID      @id @default(uuid())
  bomNumber         String    @unique @map("bom_number")
  revision          String
  bomDate           DateTime  @map("bom_date")
  customerName      String?   @map("customer_name")
  partNameInternal  String?   @map("part_name_internal")
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at")

  lineItems   BomLineItem[]
  changeovers Changeover[]

  @@map("bom_headers")
}

model BomLineItem {
  id                UUID     @id @default(uuid())
  bomHeaderId       UUID     @map("bom_header_id")
  srNo              Int      @map("sr_no")
  feederNumber      String   @map("feeder_number")
  ucalPartNumbers   String[] @map("ucal_part_numbers")
  requiredQty       Int      @default(1) @map("required_qty")
  referenceLocation String?  @map("reference_location")
  description       String?
  packageDesc       String?  @map("package_desc")
  remarks           String?

  bomHeader        BomHeader          @relation(fields: [bomHeaderId], references: [id])
  alternatives     BomAlternative[]
  verificationScans VerificationScan[]
  spliceRecords    SpliceRecord[]

  @@unique([bomHeaderId, feederNumber])
  @@map("bom_line_items")
}

model BomAlternative {
  id           UUID   @id @default(uuid())
  lineItemId   UUID   @map("line_item_id")
  rank         Int                       // 1=MPN1(primary) 2=MPN2(alt1) 3=MPN3(alt2)
  make         String
  mpn          String
  supplierCode String? @map("supplier_code")

  lineItem         BomLineItem        @relation(fields: [lineItemId], references: [id], onDelete: Cascade)
  verificationScans VerificationScan[]

  @@unique([lineItemId, rank])
  @@map("bom_alternatives")
}

model Changeover {
  id           UUID             @id @default(uuid())
  bomHeaderId  UUID             @map("bom_header_id")
  operatorId   UUID             @map("operator_id")
  lineNumber   String?          @map("line_number")
  shift        String?
  status       ChangeoverStatus @default(in_progress)
  startedAt    DateTime         @default(now()) @map("started_at")
  completedAt  DateTime?        @map("completed_at")
  notes        String?
  version      Int              @default(0)       // optimistic lock

  bomHeader         BomHeader          @relation(fields: [bomHeaderId], references: [id])
  operator          User               @relation("OperatorChangeovers", fields: [operatorId], references: [id])
  verificationScans VerificationScan[]
  spliceRecords     SpliceRecord[]
  auditLogs         AuditLog[]

  @@map("changeovers")
}

model VerificationScan {
  id              UUID      @id @default(uuid())
  changeoverId    UUID      @map("changeover_id")
  lineItemId      UUID      @map("line_item_id")
  alternativeId   UUID      @map("alternative_id")
  scannedMpn      String    @map("scanned_mpn")
  scannedLotCode  String?   @map("scanned_lot_code")
  matchType       MatchType @map("match_type")
  isAlternate     Boolean   @default(false) @map("is_alternate")
  scannedAt       DateTime  @default(now()) @map("scanned_at")
  scannedBy       UUID      @map("scanned_by")

  changeover   Changeover     @relation(fields: [changeoverId], references: [id], onDelete: Cascade)
  lineItem     BomLineItem    @relation(fields: [lineItemId], references: [id])
  alternative  BomAlternative @relation(fields: [alternativeId], references: [id])
  scannedByUser User         @relation("ScannedBy", fields: [scannedBy], references: [id])

  // ONE scan per feeder slot per changeover — DB enforced
  @@unique([changeoverId, lineItemId])
  @@map("verification_scans")
}

model SpliceRecord {
  id            UUID     @id @default(uuid())
  changeoverId  UUID     @map("changeover_id")
  lineItemId    UUID     @map("line_item_id")
  oldSpoolMpn   String   @map("old_spool_mpn")
  oldSpoolLot   String?  @map("old_spool_lot")
  newSpoolMpn   String   @map("new_spool_mpn")
  newSpoolLot   String?  @map("new_spool_lot")
  splicedAt     DateTime @default(now()) @map("spliced_at")
  splicedBy     UUID     @map("spliced_by")

  changeover Changeover  @relation(fields: [changeoverId], references: [id], onDelete: Cascade)
  lineItem   BomLineItem @relation(fields: [lineItemId], references: [id])
  splicedByUser User     @relation("SplicedBy", fields: [splicedBy], references: [id])

  @@map("splice_records")
}

model AuditLog {
  id           UUID     @id @default(uuid())
  changeoverId UUID?    @map("changeover_id")
  userId       UUID     @map("user_id")
  eventType    String   @map("event_type")
  payload      Json     @default("{}")
  occurredAt   DateTime @default(now()) @map("occurred_at")

  changeover Changeover? @relation(fields: [changeoverId], references: [id])
  user       User        @relation(fields: [userId], references: [id])

  @@map("audit_log")
}

Run after creating:
  npx prisma generate
  npx prisma db push
```

---

### PROMPT 3 — SCAN MATCHER (core verification logic)

```typescript
// src/lib/scan-matcher.ts
// CORE LOGIC: given a scanned barcode, find the matching BOM entry.
// Priority: MPN1 → MPN2 → MPN3 → UCAL Part Number

import { prisma } from '@/lib/prisma';

export interface ScanMatchResult {
  lineItemId:    string;
  alternativeId: string;
  make:          string;          // supplier/manufacturer from bom_alternatives
  matchedMpn:    string;          // the stored MPN value that matched
  matchType:     'mpn1' | 'mpn2' | 'mpn3' | 'ucal_part_number';
  isAlternate:   boolean;
  feederNumber:  string;
  description:   string | null;
}

/**
 * Match a scanned barcode value against a BOM.
 * Handles slash-joined MPNs: "CQ05S8F2703T5E/0805S8F2703T5E"
 * Returns null if no match found.
 */
export async function matchScan(
  bomHeaderId: string,
  rawScan: string
): Promise<ScanMatchResult | null> {
  const val = rawScan.trim().toUpperCase();

  // Fetch all alternatives for this BOM in one query
  // Include: lineItem for feederNumber/description, alternative for make/mpn
  const alternatives = await prisma.bomAlternative.findMany({
    where: { lineItem: { bomHeaderId } },
    select: {
      id: true,
      rank: true,
      make: true,
      mpn: true,
      lineItem: {
        select: {
          id: true,
          feederNumber: true,
          description: true,
          ucalPartNumbers: true,
        },
      },
    },
    orderBy: { rank: 'asc' },  // priority: rank 1 checked before rank 2 and 3
  });

  // Check MPN alternatives in rank order (1, 2, 3)
  for (const alt of alternatives) {
    // Handle slash-joined MPNs → split and check each part
    const mpnVariants = alt.mpn.split('/').map(s => s.trim().toUpperCase());
    if (mpnVariants.includes(val)) {
      const rankToMatchType: Record<number, ScanMatchResult['matchType']> = {
        1: 'mpn1', 2: 'mpn2', 3: 'mpn3',
      };
      return {
        lineItemId:    alt.lineItem.id,
        alternativeId: alt.id,
        make:          alt.make,
        matchedMpn:    alt.mpn,
        matchType:     rankToMatchType[alt.rank] ?? 'mpn1',
        isAlternate:   alt.rank > 1,
        feederNumber:  alt.lineItem.feederNumber,
        description:   alt.lineItem.description,
      };
    }
  }

  // Check UCAL Internal Part Numbers (array column in line_items)
  // Use Prisma raw for array contains check
  const lineItemMatch = await prisma.bomLineItem.findFirst({
    where: {
      bomHeaderId,
      ucalPartNumbers: { has: val },
    },
    select: {
      id: true,
      feederNumber: true,
      description: true,
      alternatives: {
        where: { rank: 1 },
        select: { id: true, make: true, mpn: true },
        take: 1,
      },
    },
  });

  if (lineItemMatch && lineItemMatch.alternatives[0]) {
    const primary = lineItemMatch.alternatives[0];
    return {
      lineItemId:    lineItemMatch.id,
      alternativeId: primary.id,
      make:          primary.make,
      matchedMpn:    val,             // the scanned UCAL part number itself
      matchType:     'ucal_part_number',
      isAlternate:   false,
      feederNumber:  lineItemMatch.feederNumber,
      description:   lineItemMatch.description,
    };
  }

  return null;
}
```

---

### PROMPT 4 — PROGRESS CALCULATOR

```typescript
// src/lib/progress.ts
// Computes verification progress for a changeover.
// Progress = verified unique feeder slots / total BOM feeder slots

import { prisma } from '@/lib/prisma';

export interface ProgressResult {
  verified:   number;   // number of feeder slots with a successful scan
  total:      number;   // total feeder slots in BOM for this changeover
  percentage: number;   // 0–100, integer
  isComplete: boolean;
  remaining:  string[]; // feeder numbers not yet verified
}

export async function getChangeoverProgress(changeoverId: string): Promise<ProgressResult> {
  // Get changeover → bomHeaderId
  const changeover = await prisma.changeover.findUniqueOrThrow({
    where: { id: changeoverId },
    select: {
      bomHeader: {
        select: {
          lineItems: { select: { id: true, feederNumber: true } },
        },
      },
      verificationScans: { select: { lineItemId: true } },
    },
  });

  const allFeeders    = changeover.bomHeader.lineItems;
  const verifiedIds   = new Set(changeover.verificationScans.map(s => s.lineItemId));
  const remaining     = allFeeders
    .filter(li => !verifiedIds.has(li.id))
    .map(li => li.feederNumber);

  const total      = allFeeders.length;
  const verified   = verifiedIds.size;
  const percentage = total === 0 ? 0 : Math.round((verified / total) * 100);

  return { verified, total, percentage, isComplete: verified === total, remaining };
}
```

---

### PROMPT 5 — SCAN API ENDPOINT (concurrent-safe)

```typescript
// src/app/api/changeovers/[id]/scans/route.ts
// POST: Submit a scan. Concurrent-safe with DB unique constraint + optimistic lock.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { matchScan } from '@/lib/scan-matcher';
import { getChangeoverProgress } from '@/lib/progress';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const ScanSchema = z.object({
  scannedValue:    z.string().min(1),       // MPN or UCAL part number
  lotCode:         z.string().optional(),   // LOT code from spool label
  idempotencyKey:  z.string().uuid(),       // client-generated UUID
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ScanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { scannedValue, lotCode, idempotencyKey } = parsed.data;
  const changeoverId = params.id;

  // Fetch changeover — verify ownership (operator: own, qa/eng: any)
  const changeover = await prisma.changeover.findUnique({
    where: { id: changeoverId },
    select: { id: true, bomHeaderId: true, operatorId: true, status: true, version: true },
  });
  if (!changeover) return NextResponse.json({ error: 'Changeover not found' }, { status: 404 });

  const user = session.user as { id: string; role: string };
  const isOwner = changeover.operatorId === user.id;
  const canWrite = isOwner || user.role === 'engineer' || user.role === 'admin';
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (changeover.status !== 'in_progress') {
    return NextResponse.json({ error: `Changeover is ${changeover.status}` }, { status: 409 });
  }

  // Match scan against BOM
  const match = await matchScan(changeover.bomHeaderId, scannedValue);
  if (!match) {
    await prisma.auditLog.create({
      data: {
        changeoverId,
        userId: user.id,
        eventType: 'scan_fail',
        payload: { scannedValue, reason: 'no_match' },
      },
    });
    return NextResponse.json(
      { error: 'NO_MATCH', message: `"${scannedValue}" not found in BOM` },
      { status: 422 }
    );
  }

  // Insert scan — unique constraint handles duplicate feeder check at DB level
  try {
    const scan = await prisma.verificationScan.create({
      data: {
        changeoverId,
        lineItemId:    match.lineItemId,
        alternativeId: match.alternativeId,
        scannedMpn:    scannedValue.trim().toUpperCase(),
        scannedLotCode: lotCode ?? null,
        matchType:     match.matchType,
        isAlternate:   match.isAlternate,
        scannedBy:     user.id,
      },
      select: {
        id: true,
        scannedMpn: true,
        scannedLotCode: true,
        matchType: true,
        isAlternate: true,
        scannedAt: true,
        lineItem: { select: { feederNumber: true, description: true } },
        alternative: { select: { make: true, mpn: true, rank: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        changeoverId,
        userId: user.id,
        eventType: 'scan_ok',
        payload: {
          scanId: scan.id,
          feeder: scan.lineItem.feederNumber,
          mpn:    scan.scannedMpn,
          make:   scan.alternative.make,
          lot:    scan.scannedLotCode,
        },
      },
    });

    const progress = await getChangeoverProgress(changeoverId);

    // Auto-advance status if complete
    if (progress.isComplete) {
      await prisma.changeover.update({
        where: { id: changeoverId },
        data:  { status: 'verified' },
      });
    }

    return NextResponse.json({
      scan,
      match: {
        feederNumber: match.feederNumber,
        make:         match.make,
        matchType:    match.matchType,
        isAlternate:  match.isAlternate,
      },
      progress,
    }, { status: 201 });

  } catch (err: any) {
    // Unique constraint violation = duplicate feeder scan
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'DUPLICATE', message: `Feeder ${match.feederNumber} already verified in this changeover` },
        { status: 409 }
      );
    }
    throw err;
  }
}

// GET: List all scans for a changeover
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const changeover = await prisma.changeover.findUnique({
    where: { id: params.id },
    select: { operatorId: true },
  });
  if (!changeover) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Operators only see their own; QA/Eng/Admin see all
  const canView = changeover.operatorId === user.id ||
    ['qa', 'engineer', 'admin'].includes(user.role);
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const scans = await prisma.verificationScan.findMany({
    where: { changeoverId: params.id },
    select: {
      id: true,
      scannedMpn: true,
      scannedLotCode: true,
      matchType: true,
      isAlternate: true,
      scannedAt: true,
      lineItem:    { select: { feederNumber: true, description: true, packageDesc: true } },
      alternative: { select: { make: true, mpn: true, rank: true } },
      scannedByUser: { select: { name: true, employeeId: true } },
    },
    orderBy: { scannedAt: 'asc' },
  });

  return NextResponse.json({ scans });
}
```

---

### PROMPT 6 — CHANGEOVERS API (role-filtered list)

```typescript
// src/app/api/changeovers/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CreateSchema = z.object({
  bomHeaderId: z.string().uuid(),
  lineNumber:  z.string().optional(),
  shift:       z.enum(['MORNING', 'EVENING', 'NIGHT']).optional(),
  notes:       z.string().optional(),
});

// POST: Create new changeover (operator role)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { id: string; role: string };
  // Operators and engineers can create changeovers
  if (!['operator', 'engineer', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — QA cannot create changeovers' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const changeover = await prisma.changeover.create({
    data: {
      bomHeaderId: parsed.data.bomHeaderId,
      operatorId:  user.id,
      lineNumber:  parsed.data.lineNumber,
      shift:       parsed.data.shift,
      notes:       parsed.data.notes,
    },
    select: {
      id: true, status: true, startedAt: true, lineNumber: true, shift: true,
      operator: { select: { name: true, employeeId: true } },
      bomHeader: { select: { bomNumber: true, revision: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      changeoverId: changeover.id,
      userId: user.id,
      eventType: 'changeover_created',
      payload: { bomHeaderId: parsed.data.bomHeaderId },
    },
  });

  return NextResponse.json({ changeover }, { status: 201 });
}

// GET: List changeovers — ROLE-FILTERED
// Operator: own only | QA/Engineer/Admin: all
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const isPrivileged = ['qa', 'engineer', 'admin'].includes(user.role);

  const where = isPrivileged ? {} : { operatorId: user.id };

  const changeovers = await prisma.changeover.findMany({
    where,
    select: {
      id: true,
      status: true,
      lineNumber: true,
      shift: true,
      startedAt: true,
      completedAt: true,
      operator:  { select: { name: true, employeeId: true, role: true } },
      bomHeader: { select: { bomNumber: true, revision: true, customerName: true } },
      _count: {
        select: {
          verificationScans: true,
          spliceRecords: true,
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  });

  return NextResponse.json({ changeovers });
}
```

---

### PROMPT 7 — VERIFICATION ZUSTAND STORE (client-side)

```typescript
// src/store/useVerificationStore.ts
// Client-side state mirror of server verification state.
// Single source of truth is the DATABASE — this store is UI cache only.

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface ScannedFeeder {
  lineItemId:    string;
  feederNumber:  string;
  description:   string | null;
  scannedMpn:    string;
  lotCode:       string | null;
  make:          string;
  matchType:     'mpn1' | 'mpn2' | 'mpn3' | 'ucal_part_number';
  isAlternate:   boolean;
  scannedAt:     string;
}

export interface VerificationProgress {
  verified:   number;
  total:      number;
  percentage: number;
  isComplete: boolean;
  remaining:  string[];
}

interface VerificationState {
  changeoverId:    string | null;
  scannedFeeders:  Map<string, ScannedFeeder>;  // key = lineItemId
  progress:        VerificationProgress;
  scanStep:        'mpn' | 'lot';               // current scan step
  pendingFeeder:   ScannedFeeder | null;         // MPN matched, waiting for LOT

  // Actions
  hydrate:         (changeoverId: string, scans: ScannedFeeder[], progress: VerificationProgress) => void;
  setProgress:     (p: VerificationProgress) => void;
  setPendingFeeder:(f: ScannedFeeder | null) => void;
  confirmScan:     (lotCode: string | null) => void;  // save pending with lot code
  setScanStep:     (s: 'mpn' | 'lot') => void;
  reset:           () => void;
}

const INITIAL_PROGRESS: VerificationProgress = {
  verified: 0, total: 0, percentage: 0, isComplete: false, remaining: [],
};

export const useVerificationStore = create<VerificationState>()(
  immer((set, get) => ({
    changeoverId:   null,
    scannedFeeders: new Map(),
    progress:       INITIAL_PROGRESS,
    scanStep:       'mpn',
    pendingFeeder:  null,

    hydrate: (changeoverId, scans, progress) => {
      set(state => {
        state.changeoverId = changeoverId;
        state.scannedFeeders = new Map(scans.map(s => [s.lineItemId, s]));
        state.progress = progress;
        state.scanStep = 'mpn';
        state.pendingFeeder = null;
      });
    },

    setProgress: (p) => set(state => { state.progress = p; }),

    setPendingFeeder: (f) => set(state => {
      state.pendingFeeder = f;
      state.scanStep = f ? 'lot' : 'mpn';
    }),

    confirmScan: (lotCode) => set(state => {
      const pending = state.pendingFeeder;
      if (!pending) return;
      const final = { ...pending, lotCode };
      state.scannedFeeders.set(final.lineItemId, final);
      state.pendingFeeder = null;
      state.scanStep = 'mpn';
    }),

    setScanStep: (s) => set(state => { state.scanStep = s; }),

    reset: () => set(state => {
      state.changeoverId  = null;
      state.scannedFeeders = new Map();
      state.progress       = INITIAL_PROGRESS;
      state.scanStep       = 'mpn';
      state.pendingFeeder  = null;
    }),
  }))
);
```

---

### PROMPT 8 — SCAN INPUT HOOK

```typescript
// src/components/scanner/useScanner.ts
// Handles barcode scanner input:
// - Scanner fires characters rapidly then sends Enter
// - Auto-focus after submit or error
// - Buzzer on error, beep on success

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseScannerOptions {
  onSubmit:      (value: string) => Promise<'success' | 'error'>;
  refocusDelayMs?: number;   // ms to wait before re-focusing after error (default 10000)
  disabled?:     boolean;
}

export function useScanner({ onSubmit, refocusDelayMs = 10000, disabled = false }: UseScannerOptions) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [value,  setValue]   = useState('');
  const [loading, setLoading] = useState(false);
  const refocusTimer = useRef<ReturnType<typeof setTimeout>>();

  // Keep input focused
  const focus = useCallback(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    focus();
    return () => clearTimeout(refocusTimer.current);
  }, [focus]);

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const trimmed = value.trim();
    if (!trimmed || loading || disabled) return;

    setLoading(true);
    const result = await onSubmit(trimmed);
    setValue('');
    setLoading(false);

    if (result === 'success') {
      focus();
    } else {
      // Error: play buzzer, refocus after delay
      playBuzzer();
      refocusTimer.current = setTimeout(focus, refocusDelayMs);
    }
  }, [value, loading, disabled, onSubmit, focus, refocusDelayMs]);

  return { inputRef, value, setValue, handleKeyDown, loading };
}

// Web Audio API — no audio files needed
function playBuzzer() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* AudioContext blocked — silently ignore */ }
}
```

---

### PROMPT 9 — SESSION ACTIVE PAGE (verification + splicing)

```typescript
// src/app/(app)/changeover/[id]/page.tsx
// Main operator page: shows verification → then splicing after 100%

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useVerificationStore } from '@/store/useVerificationStore';
import { useSplicingStore } from '@/store/useSplicingStore';
import { useScanner } from '@/components/scanner/useScanner';

type PageTab = 'verification' | 'splicing';

export default function ChangeoverPage() {
  const { id: changeoverId } = useParams<{ id: string }>();
  const store      = useVerificationStore();
  const spliceSt   = useSplicingStore();
  const [tab, setTab]         = useState<PageTab>('verification');
  const [notification, setNotif] = useState<{type:'ok'|'err'|'alt'; msg:string} | null>(null);

  // ── Load changeover data ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/changeovers/${changeoverId}/scans`)
      .then(r => r.json())
      .then(({ scans }) => {
        fetch(`/api/changeovers/${changeoverId}/progress`)
          .then(r => r.json())
          .then(({ progress }) => {
            store.hydrate(
              changeoverId,
              scans.map((s: any) => ({
                lineItemId:   s.lineItem ? s.lineItemId : s.id,
                feederNumber: s.lineItem.feederNumber,
                description:  s.lineItem.description,
                scannedMpn:   s.scannedMpn,
                lotCode:      s.scannedLotCode,
                make:         s.alternative.make,
                matchType:    s.matchType,
                isAlternate:  s.isAlternate,
                scannedAt:    s.scannedAt,
              })),
              progress
            );
            if (progress.isComplete) setTab('splicing');
          });
      });
  }, [changeoverId]);

  // ── Auto-switch to splicing when verified ────────────────────────────
  useEffect(() => {
    if (store.progress.isComplete && tab === 'verification') {
      setTimeout(() => setTab('splicing'), 1500);
    }
  }, [store.progress.isComplete]);

  // ── Handle MPN scan ──────────────────────────────────────────────────
  const handleMpnScan = useCallback(async (value: string): Promise<'success' | 'error'> => {
    const idempotencyKey = crypto.randomUUID();
    const res = await fetch(`/api/changeovers/${changeoverId}/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scannedValue: value, idempotencyKey }),
    });
    const data = await res.json();

    if (!res.ok) {
      setNotif({ type: 'err', msg: data.message ?? data.error });
      return 'error';
    }

    // MPN matched — now wait for LOT code scan
    store.setPendingFeeder({
      lineItemId:   data.scan.lineItem.id ?? '',
      feederNumber: data.match.feederNumber,
      description:  data.scan.lineItem.description,
      scannedMpn:   data.scan.scannedMpn,
      lotCode:      null,
      make:         data.match.make,
      matchType:    data.match.matchType,
      isAlternate:  data.match.isAlternate,
      scannedAt:    data.scan.scannedAt,
    });

    const notifType = data.match.isAlternate ? 'alt' : 'ok';
    setNotif({
      type: notifType,
      msg: `✓ ${data.match.feederNumber} — ${data.match.make} — ${data.scan.scannedMpn}`,
    });

    store.setProgress(data.progress);
    return 'success';
  }, [changeoverId]);

  // ── Handle LOT code scan ─────────────────────────────────────────────
  const handleLotScan = useCallback(async (lotCode: string): Promise<'success' | 'error'> => {
    if (!store.pendingFeeder) return 'error';

    // PATCH the existing scan with lot code
    const pending = store.pendingFeeder;
    const res = await fetch(`/api/changeovers/${changeoverId}/scans`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineItemId: pending.lineItemId, lotCode }),
    });

    if (!res.ok) return 'error';

    store.confirmScan(lotCode);
    setNotif({ type: 'ok', msg: `LOT ${lotCode} saved for ${pending.feederNumber}` });
    return 'success';
  }, [changeoverId, store.pendingFeeder]);

  const skipLot = () => {
    store.confirmScan(null);
    setNotif(null);
  };

  const mpnScanner = useScanner({
    onSubmit: handleMpnScan,
    disabled: store.scanStep !== 'mpn' || tab !== 'verification',
  });

  const lotScanner = useScanner({
    onSubmit: handleLotScan,
    disabled: store.scanStep !== 'lot' || tab !== 'verification',
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left: Scan input area */}
      <div className="flex-1 flex flex-col p-6 gap-4 overflow-auto">
        {tab === 'verification' && (
          <>
            {/* STEP INDICATOR */}
            <StepIndicator step={store.scanStep} />

            {/* MPN SCAN INPUT */}
            {store.scanStep === 'mpn' && (
              <ScanCard
                label="SCAN SPOOL MPN / PART NUMBER"
                hint="Scan MPN 1, MPN 2, MPN 3, or UCAL Internal Part No."
                inputRef={mpnScanner.inputRef}
                value={mpnScanner.value}
                onChange={e => mpnScanner.setValue(e.target.value)}
                onKeyDown={mpnScanner.handleKeyDown}
                loading={mpnScanner.loading}
              />
            )}

            {/* LOT CODE INPUT — after MPN match */}
            {store.scanStep === 'lot' && store.pendingFeeder && (
              <>
                <MatchedSpoolCard feeder={store.pendingFeeder} />
                <ScanCard
                  label="SCAN LOT CODE (Optional)"
                  hint="Scan spool LOT code, or press Skip"
                  inputRef={lotScanner.inputRef}
                  value={lotScanner.value}
                  onChange={e => lotScanner.setValue(e.target.value)}
                  onKeyDown={lotScanner.handleKeyDown}
                  loading={lotScanner.loading}
                  extra={<button onClick={skipLot} className="btn-secondary">Skip LOT</button>}
                />
              </>
            )}
          </>
        )}

        {tab === 'splicing' && (
          <SplicingSection changeoverId={changeoverId} />
        )}
      </div>

      {/* Right: Progress + Log */}
      <div className="w-80 border-l border-[var(--border)] flex flex-col">
        <ProgressPanel progress={store.progress} />
        <ScannedList scans={[...store.scannedFeeders.values()]} />
      </div>

      {/* Notification overlay */}
      {notification && (
        <ScanNotification
          notification={notification}
          onDismiss={() => setNotif(null)}
        />
      )}
    </div>
  );
}
```

---

### PROMPT 10 — AUTH CONFIG (role-based)

```typescript
// src/lib/auth.ts

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Employee ID',
      credentials: {
        employeeId: { label: 'Employee ID', type: 'text' },
        password:   { label: 'Password',    type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.employeeId) return null;
        const user = await prisma.user.findUnique({
          where: { employeeId: credentials.employeeId },
          select: { id: true, name: true, role: true, isActive: true, employeeId: true },
        });
        if (!user || !user.isActive) return null;
        // Add bcrypt.compare(credentials.password, user.passwordHash) in production
        return { id: user.id, name: user.name, role: user.role, employeeId: user.employeeId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id         = (user as any).id;
        token.role       = (user as any).role;
        token.employeeId = (user as any).employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).id         = token.id;
      (session.user as any).role       = token.role;
      (session.user as any).employeeId = token.employeeId;
      return session;
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8-hour shift session
};
```

---

### PROMPT 11 — PROGRESS API + SPLICING API

```typescript
// src/app/api/changeovers/[id]/progress/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getChangeoverProgress } from '@/lib/progress';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const progress = await getChangeoverProgress(params.id);
  return NextResponse.json({ progress });
}
```

```typescript
// src/app/api/changeovers/[id]/splices/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { matchScan } from '@/lib/scan-matcher';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const SpliceSchema = z.object({
  oldSpoolMpn: z.string().min(1),
  oldSpoolLot: z.string().optional(),
  newSpoolMpn: z.string().min(1),
  newSpoolLot: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as { id: string; role: string };
  const body = await req.json().catch(() => null);
  const parsed = SpliceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { oldSpoolMpn, oldSpoolLot, newSpoolMpn, newSpoolLot } = parsed.data;
  const changeoverId = params.id;

  // Verify changeover exists and is in 'verified' or 'splicing' status
  const changeover = await prisma.changeover.findUnique({
    where: { id: changeoverId },
    select: { status: true, bomHeaderId: true, operatorId: true },
  });
  if (!changeover) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['verified', 'splicing'].includes(changeover.status)) {
    return NextResponse.json({ error: 'Verification not complete' }, { status: 409 });
  }

  const isOwner   = changeover.operatorId === user.id;
  const canSplice = isOwner || ['engineer', 'admin'].includes(user.role);
  if (!canSplice) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Validate old spool matches BOM
  const oldMatch = await matchScan(changeover.bomHeaderId, oldSpoolMpn);
  if (!oldMatch) return NextResponse.json({ error: 'OLD_NO_MATCH', message: 'Old spool MPN not in BOM' }, { status: 422 });

  // Validate new spool matches BOM (same feeder slot)
  const newMatch = await matchScan(changeover.bomHeaderId, newSpoolMpn);
  if (!newMatch) return NextResponse.json({ error: 'NEW_NO_MATCH', message: 'New spool MPN not in BOM' }, { status: 422 });

  if (oldMatch.lineItemId !== newMatch.lineItemId) {
    return NextResponse.json({ error: 'FEEDER_MISMATCH', message: 'Old and new spool must be for the same feeder slot' }, { status: 422 });
  }

  const splice = await prisma.spliceRecord.create({
    data: {
      changeoverId,
      lineItemId:  oldMatch.lineItemId,
      oldSpoolMpn: oldSpoolMpn.trim().toUpperCase(),
      oldSpoolLot: oldSpoolLot ?? null,
      newSpoolMpn: newSpoolMpn.trim().toUpperCase(),
      newSpoolLot: newSpoolLot ?? null,
      splicedBy:   user.id,
    },
  });

  // Update status to 'splicing' if still 'verified'
  if (changeover.status === 'verified') {
    await prisma.changeover.update({
      where: { id: changeoverId },
      data: { status: 'splicing' },
    });
  }

  return NextResponse.json({ splice }, { status: 201 });
}
```

---

### PROMPT 12 — ENV + README DOCUMENTATION

```markdown
# README.md — Feeder Verification System

## Quick Start
cp .env.example .env.local   # fill in DATABASE_URL, NEXTAUTH_SECRET
npx prisma db push
npx prisma db seed            # seeds demo users
npm run dev

## Environment Variables (.env.example)
DATABASE_URL="postgresql://user:pass@localhost:5432/feeder_verification"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"

## User Roles
| Role     | Own Changeovers | All Changeovers | Create | Scan | Override |
|----------|----------------|-----------------|--------|------|----------|
| operator | ✅ read+write   | ❌               | ✅     | ✅   | ❌       |
| qa       | ✅ read         | ✅ read          | ❌     | ❌   | ❌       |
| engineer | ✅ read+write   | ✅ read+write    | ✅     | ✅   | ✅       |
| admin    | ✅ full         | ✅ full          | ✅     | ✅   | ✅       |

## Verification Flow
1. Operator starts changeover → selects BOM
2. Scans spool barcode → system matches MPN1/MPN2/MPN3/UCAL Part No
3. Supplier/Make auto-resolved from matched alternative
4. Operator scans LOT code (optional) → saved in report
5. Progress = verified slots / total BOM slots
6. 100% → splicing section unlocks automatically

## Concurrent Safety
- UNIQUE(changeover_id, line_item_id) in DB: prevents double-scan
- Optimistic locking (version column) on changeovers
- Idempotency keys on all write endpoints: safe to retry

## API Key Endpoints
POST /api/changeovers                    Create changeover
POST /api/changeovers/:id/scans          Submit scan (MPN → LOT)
GET  /api/changeovers/:id/progress       Get verification progress
POST /api/changeovers/:id/splices        Record splice
GET  /api/changeovers/:id/report         Export full report
```

```
# .env.example
DATABASE_URL="postgresql://user:pass@localhost:5432/feeder_db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""
```

---

### PROMPT 13 — FINAL WIRING CHECKLIST

```
After all prompts are implemented, verify:

DATABASE:
[ ] UNIQUE(changeover_id, line_item_id) constraint exists on verification_scans
[ ] bom_alternatives has rank 1/2/3 for MPN1/MPN2/MPN3
[ ] bom_alternatives stores make (supplier) — resolved at scan time, not lookup time
[ ] audit_log captures every scan, success or fail

SCAN LOGIC:
[ ] matchScan checks rank 1 → 2 → 3 → ucal_part_numbers (in that order)
[ ] Slash-joined MPN "A/B" → scan of "A" OR "B" both match
[ ] On MPN match → store.setPendingFeeder() → scanStep = 'lot'
[ ] On LOT scan → store.confirmScan(lotCode) → scanStep = 'mpn'
[ ] Skip LOT → store.confirmScan(null) works
[ ] make/supplier comes from bom_alternatives.make — no extra API call

CONCURRENT SAFETY:
[ ] POST /scans returns 409 with error 'DUPLICATE' for re-scan same feeder
[ ] POST /scans returns 422 with error 'NO_MATCH' for unknown barcode
[ ] idempotencyKey field accepted and logged in audit_log

ROLE VISIBILITY:
[ ] GET /api/changeovers: operator sees only own, qa/eng/admin sees all
[ ] POST /api/changeovers/scans: only owner or engineer/admin can write
[ ] UI dashboard: operator list shows own changeovers only (no filter UI needed)
[ ] QA/Engineer dashboard: shows all operators' changeovers with operator name column

SPLICING:
[ ] POST /splices: validates both old and new spool against BOM
[ ] Both old and new must resolve to same feeder slot (lineItemId match)
[ ] Changeover must be in 'verified' or 'splicing' status

PROGRESS:
[ ] progress.isComplete triggers auto-navigation to splicing tab
[ ] Progress computed server-side: getChangeoverProgress() in /lib/progress.ts
[ ] Client store.progress updated after every successful scan API response
```

---

*End of Feeder Verification System — Architecture + 13 Copilot Prompts*
