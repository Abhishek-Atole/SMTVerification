# SMTVerification System — GitHub Copilot Implementation Prompt

> **Repo:** `Abhishek-Atole/SMTVerification`  
> **Stack:** React + TypeScript (Vite) · Express.js · PostgreSQL · Drizzle ORM · pnpm workspaces  
> **Goal:** Implement all updates described below **incrementally**, one file/feature at a time. Commit after each step. Keep Copilot prompts short and targeted.

---

## 0. Context Snapshot (Read Before Any Prompt)

```
SMTVerification/
├── artifacts/
│   ├── api-server/        ← Express backend
│   ├── feeder-scanner/    ← React frontend
│   └── mockup-sandbox/
├── lib/db/                ← Drizzle ORM schema + migrations
├── docs/
└── scripts/
```

**BOM columns (from h.csv / existing import):**

| Column | Field Name |
|---|---|
| SR NO | `srNo` |
| Feeder Number | `feederNumber` |
| UCAL Internal Part Number | `internalPartNumber` (may contain multiple IDs space-separated) |
| Required Qty | `requiredQty` |
| Reference Location | `referenceLocation` |
| Description | `description` |
| Package/Description | `packageDescription` |
| Make 1 | `make1` |
| MPN 1 | `mpn1` |
| Make 2 | `make2` |
| MPN 2 | `mpn2` |
| Make 3 | `make3` |
| MPN 3 | `mpn3` |
| Remarks | `remarks` |

**Verification acceptance rule:** A scan is valid if the scanned value matches **any one of**: `internalPartNumber` tokens, `mpn1`, `mpn2`, or `mpn3` (case-insensitive, trimmed). Whichever alternative is loaded, only **that feeder slot** is considered done — the other alternatives are NOT awaited.

---

## 1. Database Schema Update

### Prompt for Copilot

```
In lib/db/schema.ts, update the BOM table to add the following columns if they don't exist:
make1, mpn1, make2, mpn2, make3, mpn3, remarks (all text, nullable).
The internalPartNumber column must support space-separated multiple IDs stored as a single text field.

Also add a changeover_sessions table:
- id (serial PK)
- operatorId (integer, FK to users)
- bomId (integer, FK to bom_headers)
- status: enum('active','completed','cancelled')
- startedAt, completedAt (timestamps)
- createdAt (timestamp, default now)

Add a feeder_scans table:
- id (serial PK)
- sessionId (FK to changeover_sessions)
- feederNumber (text)
- scannedValue (text)  — raw barcode scan
- matchedField (text)  — which field matched: 'internalPartNumber'|'mpn1'|'mpn2'|'mpn3'
- matchedMake (text)   — the Make value corresponding to matched MPN
- lotCode (text, nullable)
- status: enum('verified','failed')
- scannedAt (timestamp, default now)
- operatorId (FK to users)

Generate the Drizzle migration after schema changes.
```

---

## 2. BOM Import Logic Update

### Prompt for Copilot

```
In artifacts/api-server/src/routes/bom.ts (or wherever BOM CSV import is handled):
Update the CSV parser to map these header aliases to schema fields:
- "UCAL Internal Part Number" → internalPartNumber (trim whitespace, collapse newlines to space)
- "Make 1" → make1, "MPN 1" → mpn1
- "Make 2" → make2, "MPN 2" → mpn2
- "Make 3" → make3, "MPN 3" → mpn3
- "Remarks" → remarks

For internalPartNumber: some cells contain multiple IDs separated by spaces or newlines.
Store them as-is (single text field, space-separated after normalization).

The BOM CSV has 2 header rows (row 1 = customer info, row 2 = column names).
Skip row 1, parse row 2 as headers. Skip blank rows.

Return { imported: number, skipped: number, errors: string[] } in the response.
```

---

## 3. Verification Logic (Core Business Rules)

### Prompt for Copilot

```
Create artifacts/api-server/src/services/verificationService.ts

Export a function:
  verifyFeederScan(feederNumber: string, scannedValue: string, sessionId: number): Promise<VerifyResult>

VerifyResult type:
{
  valid: boolean;
  feederNumber: string;
  matchedField: 'internalPartNumber' | 'mpn1' | 'mpn2' | 'mpn3' | null;
  matchedMake: string | null;
  hasAlternates: boolean;
  alternateCount: number;
  errorCode: 'FEEDER_NOT_FOUND' | 'COMPONENT_MISMATCH' | 'ALREADY_SCANNED' | null;
}

Rules:
1. Look up feederNumber in BOM for the session's bomId.
   If not found → { valid: false, errorCode: 'FEEDER_NOT_FOUND' }

2. Check if feederNumber already has a verified scan in this session.
   If yes → { valid: false, errorCode: 'ALREADY_SCANNED' }

3. Match scannedValue (case-insensitive trim) against:
   a. Each space-separated token in internalPartNumber
   b. mpn1, mpn2, mpn3
   First match wins. Record matchedField and matchedMake (make1/make2/make3 corresponding to matched mpn).

4. If no match → { valid: false, errorCode: 'COMPONENT_MISMATCH' }

5. hasAlternates = (mpn2 is not null || mpn3 is not null)
   alternateCount = count of non-null mpn fields

Progress calculation:
  Export getSessionProgress(sessionId): Promise<{ verified: number; total: number; percent: number }>
  total = distinct feeder numbers in BOM for this session's bomId
  verified = distinct feeder numbers with a 'verified' scan in this session
  percent = Math.round((verified / total) * 100)
```

---

## 4. API Routes

### Prompt for Copilot

```
In artifacts/api-server/src/routes/verification.ts, create these endpoints:

POST /api/verification/sessions
  Body: { operatorId, bomId }
  Creates a new changeover_session with status='active'
  Returns the session object

GET /api/verification/sessions/:sessionId/progress
  Returns { verified, total, percent, verifiedFeeders: string[] }

POST /api/verification/scan
  Body: { sessionId, feederNumber, scannedValue, lotCode? }
  Calls verificationService.verifyFeederScan()
  If valid: inserts into feeder_scans with status='verified', returns VerifyResult + progress
  If invalid: inserts into feeder_scans with status='failed', returns VerifyResult (no progress update)
  Log all attempts to feeder_scans regardless of result.

GET /api/verification/sessions/:sessionId/scans
  Returns all scans for the session ordered by scannedAt desc

All endpoints must use transactions where multiple writes occur.
Use pg pool with max:20 connections to support concurrent requests.
```

---

## 5. Feeder Verification Page (Frontend)

### Prompt for Copilot

```
Create artifacts/feeder-scanner/src/pages/FeederVerification.tsx

This is a scanner-first operator UI. Layout:
- Page title: "Feeder Verification" with session progress bar (e.g. 6/18 Feeders — 33%)
- Three sequential scan fields shown one at a time:
  Step 1: Feeder Number (auto-focus on load)
  Step 2: Part / MPN (shown after valid feeder scan)
  Step 3: Lot Code (optional — shown after valid MPN scan, operator can press Enter to skip)

Scan field behavior:
- Input is a plain <input type="text"> that auto-focuses.
- On each keystroke, if input length >= 4, start a 300ms debounce timer.
  When timer fires, call the verify API automatically (no Enter needed for feeder number).
  For MPN field: same debounce auto-verify.
  For Lot Code: require Enter key press (or allow skip on Enter with empty value).

After each field is auto-verified:
  - Show notification (see Notification spec below)
  - On success: advance to next step, auto-focus next field
  - On failure: play buzzer sound (use Web Audio API, 200Hz, 300ms burst), show error notification,
    after 10 seconds (or on notification dismiss button click) clear field and re-focus for re-entry

After all 3 steps complete (or Lot Code skipped):
  - Save the verified scan record
  - Show success notification with feeder number + matched MPN + make
  - Reset to Step 1 (Feeder Number) automatically after 2 seconds
  - Update progress bar

Progress bar:
  When progress reaches 100%, show a "Proceed to Splicing →" button that navigates to /splicing

Notification spec:
  - Position: top-right, stacked
  - Types: SUCCESS (green), ERROR (red with buzzer), WARNING (amber), INFO (blue)
  - SUCCESS: auto-dismiss after 3 seconds
  - ERROR: stays until clicked or 10s timeout; on dismiss → re-focus input
  - WARNING: shown when alternate components exist, auto-dismiss 4 seconds
    Content: "ℹ️ Alternate component used — [MPN] by [Make]. [N] alternatives available."
  - Each notification has a close (✕) button
  - Animate in from right, fade out on dismiss

All scans logged in real-time to /api/verification/scan
```

---

## 6. Splicing Page (Frontend)

### Prompt for Copilot

```
Create artifacts/feeder-scanner/src/pages/Splicing.tsx

This page is shown only after feeder verification is 100% complete.
It handles OLD spool → NEW spool replacement logging.

Layout:
- Page title: "Splicing" with session info (operator, BOM name, timestamp)
- Three fields per splice record:
  1. Feeder Number  — scanner input, auto-verify against BOM (same debounce pattern)
  2. Old Spool MPN or ID — scanner input, must match BOM for that feeder
  3. New Spool MPN or ID — scanner input, must match BOM for that feeder

All three fields must 100% match BOM before the record is accepted.
  - If Feeder Number not in BOM → error notification
  - If Old Spool MPN doesn't match → error notification + buzzer
  - If New Spool MPN doesn't match → error notification + buzzer

On successful splice:
  - Save to splice_records table (feederNumber, oldMpn, newMpn, sessionId, operatorId, splicedAt)
  - Show success notification, advance to next splice entry

Use same notification and buzzer logic as FeederVerification page.
Log all splice attempts to API.
```

---

## 7. Changeover Session Scope (Operator Isolation)

### Prompt for Copilot

```
In the session model and API:
- A changeover session is created when an operator logs in and starts a changeover.
- A session is tied to a single operatorId.
- Operators can only see and interact with their own active session.
- QA and Engineer roles can view all sessions (read-only GET endpoints).

Add role-based middleware in artifacts/api-server/src/middleware/auth.ts:
  - 'operator' role: can POST scans for their own sessionId only
  - 'qa' and 'engineer' roles: can GET any session data
  - Validate sessionId ownership on every POST /api/verification/scan

Add GET /api/verification/sessions?role=qa (returns all sessions for QA/Engineer)
Add GET /api/verification/sessions/mine (returns only current operator's active session)
```

---

## 8. Notification Component (Reusable)

### Prompt for Copilot

```
Create artifacts/feeder-scanner/src/components/NotificationSystem.tsx

Export:
  - NotificationProvider (wrap app root)
  - useNotification() hook with methods:
      notify.success(message, details?)
      notify.error(message, details?, onDismiss?: () => void)
      notify.warning(message, details?)
      notify.info(message, details?)

Notification component:
  - Fixed position: top-right, z-index 9999
  - Width: 360px max
  - Each toast: rounded card with left color bar, icon, title, optional details, close button
  - SUCCESS: green (#16a34a), ✓ icon
  - ERROR: red (#dc2626), ✗ icon, plays buzzer on mount (Web Audio API)
  - WARNING: amber (#d97706), ⚠ icon
  - INFO: blue (#2563eb), ℹ icon
  - Entry animation: slide in from right (CSS transform translateX)
  - Exit: fade + slide out
  - Auto-dismiss timers: SUCCESS=3s, WARNING=4s, ERROR=10s, INFO=5s
  - Stack up to 5 notifications; oldest dismissed first when limit reached

Buzzer function (exported separately as playBuzzer()):
  Uses Web Audio API, OscillatorNode at 200Hz, gain 0.3, duration 300ms.
  Call on ERROR notification mount only.
```

---

## 9. Progress Calculation Fix for Alternate Components

### Prompt for Copilot

```
In verificationService.ts, update getSessionProgress():

A feeder is considered "complete" when ANY ONE of its alternate components is scanned.
Do NOT wait for other alternatives once one is verified.

Logic:
  total = count of distinct feederNumbers in BOM for this bomId
  verified = count of distinct feederNumbers that have at least one 'verified' scan in this session

Example: Feeder YSM-001 has mpn1=X, mpn2=Y, mpn3=Z.
  If operator scans Y → feeder YSM-001 is verified. X and Z are NOT required.
  verified count for YSM-001 = 1 (complete).

This means the progress percent correctly reflects real-world partial completion.
```

---

## 10. Responsive UI Grid for Scan Log

### Prompt for Copilot

```
In FeederVerification.tsx, add a scan log table below the input area.

Table columns: Feeder | Scanned Value | Matched Field | Make | Lot Code | Status | Time

Requirements:
- Use a CSS Grid or TailwindCSS responsive table wrapper with overflow-x: auto
- On small screens (< 768px): hide "Matched Field" and "Make" columns
- On medium screens (768–1024px): show all columns
- Table must NOT stretch the container. Use table-layout: fixed with defined column widths.
- Rows animate in (fade-in 0.3s) when new scan is added
- SUCCESS rows: light green background; FAILED rows: light red background
- Pagination: show last 20 scans, "Load more" button for older entries
- The table height is max 40vh with internal scroll — does not push input fields off screen
```

---

## 11. API Concurrency & Connection Pooling

### Prompt for Copilot

```
In artifacts/api-server/src/db/connection.ts:
Configure pg Pool with:
  max: 20
  idleTimeoutMillis: 30000
  connectionTimeoutMillis: 2000

All write endpoints (/scan, /sessions) must use db transactions:
  await db.transaction(async (tx) => { ... })

For POST /api/verification/scan:
  Use SELECT ... FOR UPDATE on the feeder_scans row check (ALREADY_SCANNED guard)
  to prevent race conditions when two clients scan same feeder concurrently.

Add a health check endpoint GET /api/health that returns pool stats.
```

---

## 12. Documentation Update

### Prompt for Copilot

```
Update docs/INDEX.md to add links to new feature docs.

Create docs/features/scanning/FEEDER_VERIFICATION_FLOW.md with:
- Scan flow diagram (ASCII)
- Field matching priority order
- Alternate component behavior explanation
- Progress calculation rules
- Error codes and their meanings

Create docs/features/scanning/SPLICING_FLOW.md with:
- Splice record fields
- Validation rules
- Session scope

Keep docs concise — bullet points only, max 2 pages each.
```

---

## Implementation Order (Paste into Copilot One at a Time)

| Step | File(s) to Create/Edit | Copilot Prompt Section |
|---|---|---|
| 1 | `lib/db/schema.ts` + migration | §1 |
| 2 | BOM import route | §2 |
| 3 | `verificationService.ts` | §3 + §9 |
| 4 | `routes/verification.ts` | §4 |
| 5 | `middleware/auth.ts` | §7 |
| 6 | `NotificationSystem.tsx` | §8 |
| 7 | `FeederVerification.tsx` | §5 + §10 |
| 8 | `Splicing.tsx` | §6 |
| 9 | DB connection pooling | §11 |
| 10 | Docs | §12 |

**Commit message convention:**
```
feat(db): add changeover_sessions and feeder_scans tables
feat(api): verification scan endpoint with alternate component logic
feat(ui): FeederVerification page with debounce auto-scan
feat(ui): Splicing page
feat(ui): NotificationSystem with buzzer
fix(progress): alternate component completion logic
docs: feeder verification and splicing flow docs
```

---

## Key Rules Summary (Paste at Top of Every Copilot Chat)

```
Project: SMTVerification monorepo (pnpm workspaces)
Stack: React+TypeScript, Express.js, PostgreSQL+Drizzle ORM
BOM verification: match scanned value against internalPartNumber tokens OR mpn1/mpn2/mpn3
Alternate logic: if feeder has mpn1+mpn2+mpn3, ANY ONE verified = feeder complete
Session scope: operator sees only own session; QA/engineer see all (read-only)
Scan fields order: 1=FeederNumber (auto-debounce) 2=MPN/PartID (auto-debounce) 3=LotCode (Enter)
Notifications: SUCCESS 3s auto-dismiss, ERROR 10s + buzzer + onDismiss re-focus, WARNING 4s
No form tags in React — use onClick/onChange handlers only
```