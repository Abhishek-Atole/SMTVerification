# SMTVerification — Master Copilot Implementation Prompt
## Features: Mode Lock · Auto-Scan · Session Log · Report · ID Format · Landscape PDF

---

Paste this entire prompt into GitHub Copilot Chat with `@workspace` active.
Read the full codebase before starting: `@workspace`

Implement every section below in exact order. After each section:
1. Show the exact files changed
2. Run `pnpm --filter @workspace/api-server run build` + `pnpm --filter @workspace/feeder-scanner run build`
3. Confirm both green
4. Show the git commit command
5. Say **"READY FOR NEXT SECTION"** and wait

Do NOT batch sections. One section = one commit.

---

## ═══════════════════════════════════════════════════
## SECTION 1 — CHANGEOVER ID FORMAT
## Change from any existing format to: SMT_YYYYMMDD_NNNNNN
## ═══════════════════════════════════════════════════

### 1.1 — Find all ID generation code
Search `@workspace` for: `CHG` OR `generateId` OR `changeover_id` OR `sessionId` generation.
Show every file and line that creates a changeover/session ID.

### 1.2 — Replace ID generator

Create or update the ID utility at:
`artifacts/api-server/src/lib/generateSessionId.ts`

```typescript
import { db } from '../db';
import { changeoverSessions } from '../db/schema';
import { like, desc } from 'drizzle-orm';
import { format } from 'date-fns';

export async function generateSessionId(): Promise<string> {
  const today = format(new Date(), 'yyyyMMdd');          // e.g. 20260425
  const prefix = `SMT_${today}_`;

  // Find highest sequence number for today
  const latest = await db
    .select({ id: changeoverSessions.id })
    .from(changeoverSessions)
    .where(like(changeoverSessions.id, `${prefix}%`))
    .orderBy(desc(changeoverSessions.id))
    .limit(1);

  let nextSeq = 1;
  if (latest.length > 0) {
    const lastSeq = parseInt(latest[0].id.split('_')[2] ?? '0', 10);
    nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  }

  const seq = String(nextSeq).padStart(6, '0');          // 6-digit zero-padded
  return `${prefix}${seq}`;                               // SMT_20260425_000001
}
```

### 1.3 — Update session creation route

In `artifacts/api-server/src/routes/sessions.ts` (or wherever sessions are created):
- Replace any hardcoded ID or old generator call with `await generateSessionId()`
- Confirm `changeover_sessions.id` column is `varchar(25)` or `text` (not integer)
- If it is currently an integer PK, generate a migration to change to `text` PK

### 1.4 — Update all references

Search `@workspace` for any hardcoded `CHG` prefix references in:
- Frontend display components
- Report generator
- API response types
- Test files

Replace all with the new `SMT_YYYYMMDD_NNNNNN` format.

### 1.5 — Validate

Generate a test session. Confirm the ID in the DB looks like:
`SMT_20260425_000001`

Commit:
```
git add -A
git commit -m "feat(sessions): change ID format to SMT_YYYYMMDD_NNNNNN with 6-digit sequence"
```

---

## ═══════════════════════════════════════════════════
## SECTION 2 — VERIFICATION MODE: AUTO (DEFAULT) + MANUAL (PASSWORD LOCKED)
## ═══════════════════════════════════════════════════

### 2.1 — Find existing mode implementation

Search `@workspace` for: `AUTO` OR `MANUAL` OR `verificationMode` OR `mode`
Show every file that references the two modes.

### 2.2 — Backend: Add mode to session schema

In `lib/db/src/schema/sessions.ts`, confirm or add:
```typescript
verificationMode: text('verification_mode')
  .notNull()
  .default('AUTO')
  .$type<'AUTO' | 'MANUAL'>(),
```
Generate Drizzle migration if column is missing.

### 2.3 — Backend: Mode validation on scan

In `artifacts/api-server/src/routes/verification.ts`, the POST `/api/verification/scan` handler must:
- Read `session.verificationMode` from the DB
- If `AUTO`: enforce exact match only (current behaviour — keep as-is)
- If `MANUAL`: same exact matching logic BUT log `verificationMode: 'MANUAL'` in `feeder_scans`

Add `verificationMode` column to `feeder_scans` table:
```typescript
verificationMode: text('verification_mode').notNull().default('AUTO')
```

### 2.4 — Frontend: Mode Toggle Component

Create `artifacts/feeder-scanner/src/components/ModeToggle.tsx`:

```typescript
import { useState, useCallback } from 'react';

interface ModeToggleProps {
  currentMode: 'AUTO' | 'MANUAL';
  onModeChange: (mode: 'AUTO' | 'MANUAL') => void;
  sessionId: string;
}

const MANUAL_PASSWORD = 'SMT@#123';   // stored only in frontend env — never sent to backend

export function ModeToggle({ currentMode, onModeChange, sessionId }: ModeToggleProps) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  // Clicking AUTO → MANUAL requires password
  const handleToggle = useCallback(() => {
    if (currentMode === 'AUTO') {
      setShowPasswordModal(true);
      setPasswordInput('');
      setError('');
    } else {
      // MANUAL → AUTO: no password needed, always allowed
      handleModeChange('AUTO');
    }
  }, [currentMode]);

  const handlePasswordSubmit = useCallback(async () => {
    if (passwordInput !== MANUAL_PASSWORD) {
      setError('Incorrect password. Access denied.');
      setPasswordInput('');
      return;
    }
    setShowPasswordModal(false);
    await handleModeChange('MANUAL');
  }, [passwordInput]);

  const handleModeChange = async (newMode: 'AUTO' | 'MANUAL') => {
    setIsChanging(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/mode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: newMode }),
      });
      if (!res.ok) throw new Error('Failed to update mode');
      onModeChange(newMode);
    } catch {
      setError('Failed to switch mode. Try again.');
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <>
      {/* Mode Toggle Button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        background: currentMode === 'AUTO' ? '#EFF6FF' : '#FEF3C7',
        border: `1.5px solid ${currentMode === 'AUTO' ? '#1D4ED8' : '#B45309'}`,
        borderRadius: '8px',
        cursor: isChanging ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        transition: 'all 0.2s',
        minWidth: '160px',
      }}
        onClick={!isChanging ? handleToggle : undefined}
        role="button"
        aria-label={`Current mode: ${currentMode}. Click to switch.`}
      >
        {/* Lock icon for MANUAL mode */}
        <span style={{ fontSize: '16px' }}>
          {currentMode === 'AUTO' ? '⚡' : '🔒'}
        </span>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: currentMode === 'AUTO' ? '#1D4ED8' : '#B45309',
          }}>
            {currentMode === 'AUTO' ? 'AUTO MODE' : 'MANUAL MODE'}
          </div>
          <div style={{ fontSize: '10px', color: '#6B7280' }}>
            {currentMode === 'AUTO' ? 'Click to switch to Manual' : 'Click to return to Auto'}
          </div>
        </div>
        {currentMode === 'AUTO' && (
          <span style={{
            marginLeft: 'auto',
            background: '#1D4ED8',
            color: '#fff',
            fontSize: '9px',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 700,
          }}>DEFAULT</span>
        )}
        {currentMode === 'MANUAL' && (
          <span style={{
            marginLeft: 'auto',
            background: '#B45309',
            color: '#fff',
            fontSize: '9px',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 700,
          }}>LOCKED</span>
        )}
      </div>

      {/* Password Modal — AUTO → MANUAL gate */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '32px',
            width: '340px',
            border: '2px solid #B45309',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔐</div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1A3557' }}>
                Manual Mode Access
              </h2>
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#6B7280' }}>
                Manual mode requires supervisor password
              </p>
            </div>

            <input
              type="password"
              placeholder="Enter supervisor password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: `1.5px solid ${error ? '#DC2626' : '#D1D5DB'}`,
                borderRadius: '8px',
                boxSizing: 'border-box',
                outline: 'none',
                marginBottom: '8px',
              }}
            />

            {error && (
              <p style={{ color: '#DC2626', fontSize: '12px', margin: '0 0 12px', textAlign: 'center' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setError(''); }}
                style={{
                  flex: 1, padding: '10px', fontSize: '13px',
                  border: '1.5px solid #D1D5DB', borderRadius: '8px',
                  background: '#fff', cursor: 'pointer', color: '#374151',
                }}
              >Cancel</button>
              <button
                onClick={handlePasswordSubmit}
                style={{
                  flex: 1, padding: '10px', fontSize: '13px', fontWeight: 700,
                  border: 'none', borderRadius: '8px',
                  background: '#B45309', color: '#fff', cursor: 'pointer',
                }}
              >Unlock</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

### 2.5 — Backend: PATCH /api/sessions/:id/mode route

Add to `artifacts/api-server/src/routes/sessions.ts`:
```typescript
// PATCH /api/sessions/:id/mode
// Updates verificationMode — AUTH REQUIRED, session must belong to operator
router.patch('/:id/mode', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { mode } = req.body as { mode: 'AUTO' | 'MANUAL' };

  if (!['AUTO', 'MANUAL'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be AUTO or MANUAL' });
  }

  const session = await db.query.changeoverSessions.findFirst({
    where: (s, { eq }) => eq(s.id, id),
  });

  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Operator can only update own session; QA/Engineer can update any
  if (req.actor.role === 'operator' && session.operatorId !== req.actor.userId) {
    return res.status(403).json({ error: 'Cannot modify another operator session' });
  }

  await db.update(changeoverSessions)
    .set({ verificationMode: mode })
    .where(eq(changeoverSessions.id, id));

  auditLog({ event: 'MODE_CHANGED', operatorId: req.actor.userId,
             sessionId: id, detail: `Mode changed to ${mode}`, ip: req.ip });

  return res.json({ sessionId: id, mode });
});
```

### 2.6 — Integrate ModeToggle into FeederVerification page

In `FeederVerification.tsx` (or equivalent page component):
- Import `ModeToggle`
- Add to the top header bar, right side:
  ```tsx
  <ModeToggle
    currentMode={session.verificationMode ?? 'AUTO'}
    onModeChange={(mode) => setSession(prev => ({ ...prev, verificationMode: mode }))}
    sessionId={session.id}
  />
  ```
- **Default is AUTO** — when a new session is created, `verificationMode` defaults to `'AUTO'`
- Mode badge must also appear visibly near the scan input area so operators can see current mode at a glance

### 2.7 — Visual mode indicator on scan input area

In the scan input section, add a persistent badge directly above the feeder input:
```tsx
<div style={{
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
  letterSpacing: '0.07em',
  background: session.verificationMode === 'AUTO' ? '#EFF6FF' : '#FEF3C7',
  color: session.verificationMode === 'AUTO' ? '#1D4ED8' : '#B45309',
  border: `1px solid ${session.verificationMode === 'AUTO' ? '#93C5FD' : '#FCD34D'}`,
}}>
  {session.verificationMode === 'AUTO' ? '⚡ AUTO — STRICT' : '🔒 MANUAL MODE'}
</div>
```

Commit:
```
git add -A
git commit -m "feat(mode): add AUTO (default) / MANUAL password-locked mode toggle with modal gate"
```

---

## ═══════════════════════════════════════════════════
## SECTION 3 — AUTO-SCAN: ACCEPT WITHOUT ANY KEY PRESS
## ═══════════════════════════════════════════════════

### 3.1 — Find existing scan submission logic

Search `@workspace` for the scan submission handler in the frontend.
Show the exact component and function where the scan value is submitted.
Confirm whether it currently requires Enter key or a button click.

### 3.2 — Implement 300ms debounce auto-submit for ALL scan fields

The scan flow has 3 fields: Feeder Number, MPN/Part ID, Lot Code.
Rules per field:

| Field | Auto-Submit | Trigger |
|---|---|---|
| Feeder Number | YES | 300ms debounce after last keystroke |
| MPN / Part ID | YES | 300ms debounce after last keystroke |
| Lot Code | NO (optional) | Enter key or button — operator may skip |

Create `artifacts/feeder-scanner/src/hooks/useAutoScan.ts`:

```typescript
import { useEffect, useRef, useCallback } from 'react';

interface UseAutoScanOptions {
  onScan: (value: string) => void;
  delayMs?: number;           // default 300
  minLength?: number;         // default 3 — ignore accidental single chars
  enabled?: boolean;          // default true
}

export function useAutoScan(
  value: string,
  { onScan, delayMs = 300, minLength = 3, enabled = true }: UseAutoScanOptions
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef<string>('');

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const trimmed = value.trim();

    // Do not re-submit the same value
    if (trimmed === lastSubmittedRef.current) return;

    // Ignore values that are too short (partial keystrokes)
    if (trimmed.length < minLength) {
      cancel();
      return;
    }

    cancel();
    timerRef.current = setTimeout(() => {
      lastSubmittedRef.current = trimmed;
      onScan(trimmed);
    }, delayMs);

    return cancel;
  }, [value, enabled]);

  // Call this after a successful scan to reset the debounce guard
  const reset = useCallback(() => {
    lastSubmittedRef.current = '';
    cancel();
  }, [cancel]);

  return { reset };
}
```

### 3.3 — Apply useAutoScan to Feeder Number field

In the Feeder Number input:
```typescript
const { reset: resetFeeder } = useAutoScan(feederInput, {
  onScan: handleFeederScan,
  delayMs: 300,
  minLength: 3,
  enabled: step === 'FEEDER',          // only active on step 1
});
```

`handleFeederScan` must:
1. POST to `/api/verification/feeder-check` (or equivalent)
2. On success → advance to step 2 (MPN input), reset feeder input
3. On error → show notification, re-focus feeder input, call `resetFeeder()`

### 3.4 — Apply useAutoScan to MPN/Part ID field

```typescript
const { reset: resetMpn } = useAutoScan(mpnInput, {
  onScan: handleMpnScan,
  delayMs: 300,
  minLength: 4,         // MPNs are at least 4 chars
  enabled: step === 'MPN',
});
```

`handleMpnScan` must:
1. POST to `/api/verification/scan` with `{ sessionId, feederNumber, scannedValue: mpn, lotCode: null }`
2. On success → advance to step 3 (Lot Code), reset MPN input
3. On error → show error notification, re-focus MPN input, call `resetMpn()`

### 3.5 — Lot Code field: Enter key or Skip only

The lot code field must NOT use useAutoScan. It must use:
```typescript
<input
  ref={lotCodeRef}
  value={lotCodeInput}
  onChange={e => setLotCodeInput(e.target.value)}
  onKeyDown={e => {
    if (e.key === 'Enter') handleLotCodeSubmit();
  }}
  placeholder="Scan lot code or press Enter to skip"
/>
<button onClick={handleLotCodeSubmit}>Skip / Submit</button>
```

`handleLotCodeSubmit` saves the lot code (empty string = skip) and resets to step 1.

### 3.6 — Focus management between steps

After each successful scan, auto-focus the NEXT input:
```typescript
useEffect(() => {
  if (step === 'FEEDER') feederInputRef.current?.focus();
  if (step === 'MPN') mpnInputRef.current?.focus();
  if (step === 'LOT') lotCodeInputRef.current?.focus();
}, [step]);
```

### 3.7 — Prevent double-submit

Add a `scanning` boolean state. When auto-scan fires:
- Set `scanning = true`
- Disable the input while request is in-flight
- Set `scanning = false` in finally block
- Re-focus the appropriate input

```typescript
const [scanning, setScanning] = useState(false);

async function handleFeederScan(value: string) {
  if (scanning) return;
  setScanning(true);
  try {
    // ... API call
  } finally {
    setScanning(false);
  }
}
```

Commit:
```
git add -A
git commit -m "feat(scan): auto-submit on 300ms debounce for feeder and MPN fields, no key press needed"
```

---

## ═══════════════════════════════════════════════════
## SECTION 4 — SESSION LOG: COMPLETE SCAN DATA
## Show actual scanned vs expected for every entry
## ═══════════════════════════════════════════════════

### 4.1 — Find the session log query

Search `@workspace` for the query that powers the live scan log table.
Show the exact Drizzle query. Confirm it JOINs `bom_items` to get expected MPN data.

If it does NOT join `bom_items`, fix it:

```typescript
const scanLog = await db
  .select({
    id:                  feederScans.id,
    feederNumber:        feederScans.feederNumber,
    scannedValue:        feederScans.scannedValue,       // ACTUAL scanned barcode
    matchedField:        feederScans.matchedField,
    matchedMake:         feederScans.matchedMake,
    lotCode:             feederScans.lotCode,
    status:              feederScans.status,
    verificationMode:    feederScans.verificationMode,
    scannedAt:           feederScans.scannedAt,
    // Expected data from BOM
    refDes:              bomItems.referenceLocation,
    componentDesc:       bomItems.description,
    packageSize:         bomItems.packageDescription,
    internalPartNumber:  bomItems.internalPartNumber,
    mpn1:                bomItems.mpn1,
    make1:               bomItems.make1,
    mpn2:                bomItems.mpn2,
    make2:               bomItems.make2,
    mpn3:                bomItems.mpn3,
    make3:               bomItems.make3,
  })
  .from(feederScans)
  .leftJoin(bomItems, and(
    eq(bomItems.feederNumber, feederScans.feederNumber),
    eq(bomItems.bomId, sql`(SELECT bom_id FROM changeover_sessions WHERE id = ${sessionId})`)
  ))
  .where(eq(feederScans.sessionId, sessionId))
  .orderBy(desc(feederScans.scannedAt));
```

### 4.2 — Expose via API

Ensure `GET /api/sessions/:id/scans` returns all fields above.
Response shape:
```typescript
{
  sessionId: string,
  scans: Array<{
    id: number,
    feederNumber: string,
    scannedValue: string,         // actual barcode operator scanned
    matchedField: string | null,  // 'mpn1' | 'mpn2' | 'mpn3' | 'internalPartNumber'
    matchedMake: string | null,
    lotCode: string | null,
    status: 'verified' | 'duplicate' | 'failed',
    verificationMode: 'AUTO' | 'MANUAL',
    scannedAt: string,            // ISO timestamp
    bom: {
      refDes: string | null,
      componentDesc: string | null,
      packageSize: string | null,
      internalPartNumber: string | null,
      expectedMpns: string[],     // [mpn1, mpn2, mpn3].filter(Boolean)
      makes: string[],            // [make1, make2, make3].filter(Boolean)
    }
  }>
}
```

### 4.3 — Update the live scan log table in the frontend

The scan log table must have these exact columns:

| # | Column | Source | Notes |
|---|---|---|---|
| 1 | Time | `scannedAt` | `HH:MM:SS AM/PM` |
| 2 | Feeder No. | `feederNumber` | plain text |
| 3 | Ref / Des | `bom.refDes` | from BOM |
| 4 | Component | `bom.componentDesc` | from BOM |
| 5 | Package | `bom.packageSize` | from BOM |
| 6 | Internal P/N | `bom.internalPartNumber` | from BOM |
| 7 | Expected MPN | `bom.expectedMpns.join(' / ')` | blue text |
| 8 | **Scanned (Actual)** | `scannedValue` | ← THIS is the real scan |
| 9 | Matched As | `matchedField` | e.g. "MPN 2 (YAGEO)" |
| 10 | Lot Code | `lotCode` | `—` if null |
| 11 | Mode | `verificationMode` | badge |
| 12 | Status | `status` | coloured badge |

Column 7 (Expected MPN): blue text, `#1D4ED8`
Column 8 (Scanned Actual):
- Green `#15803D` bold if primary match (mpn1 / internalPartNumber)
- Amber `#B45309` bold + " ▲" suffix if alternate (mpn2/mpn3)
- Red `#B91C1C` bold + " ✗" if failed

Column 12 Status badges:
- `verified` → green pill
- `duplicate` → amber pill
- `failed` → red pill

Mode badge:
- `AUTO` → blue pill `#1D4ED8`
- `MANUAL` → amber pill `#B45309`

Table must:
- Have `max-height: 42vh` with `overflow-y: auto`
- Have sticky header row (position: sticky, top: 0)
- New rows fade in from top
- Never stretch the page — inputs always visible above table

Commit:
```
git add -A
git commit -m "feat(log): expand session scan log with actual vs expected columns, BOM data, mode badge"
```

---

## ═══════════════════════════════════════════════════
## SECTION 5 — REMOVE ALL HARDCODED VALUES FROM UI HEADER
## ═══════════════════════════════════════════════════

### 5.1 — Find all hardcoded values

Search `@workspace` for hardcoded strings in header/nav components:
- Company name literals
- System title literals  
- Any static "SMT Verification" text that is not from config
- Hardcoded version numbers or dates

Show every file and line.

### 5.2 — Move all to environment config

Add to `.env` (and `.env.example`):
```
VITE_COMPANY_NAME=UCAL Fuel Systems Limited
VITE_COMPANY_SHORT=UCAL
VITE_SYSTEM_TITLE=SMT Changeover Verification System
VITE_SYSTEM_VERSION=2.0.0
VITE_LOGO_URL=/assets/company-logo.png
```

Create `artifacts/feeder-scanner/src/lib/appConfig.ts`:
```typescript
export const appConfig = {
  companyName:  import.meta.env.VITE_COMPANY_NAME  ?? 'Your Company',
  companyShort: import.meta.env.VITE_COMPANY_SHORT ?? 'CO',
  systemTitle:  import.meta.env.VITE_SYSTEM_TITLE  ?? 'SMT Verification',
  version:      import.meta.env.VITE_SYSTEM_VERSION ?? '1.0.0',
  logoUrl:      import.meta.env.VITE_LOGO_URL       ?? null,
} as const;
```

### 5.3 — Replace hardcoded text in all components

Find every component that hardcodes:
- Company name → replace with `appConfig.companyName`
- System title → replace with `appConfig.systemTitle`
- Logo img src → replace with `appConfig.logoUrl`

If logoUrl is null, fall back to initials avatar using `companyShort`.

### 5.4 — Company logo in navigation bar

In the top navigation/header component:
```tsx
import { appConfig } from '@/lib/appConfig';

function AppLogo() {
  if (appConfig.logoUrl) {
    return (
      <img
        src={appConfig.logoUrl}
        alt={appConfig.companyShort}
        style={{ height: '36px', width: 'auto', objectFit: 'contain' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div style={{
      height: '36px', padding: '0 12px',
      background: '#1A3557', borderRadius: '6px',
      display: 'flex', alignItems: 'center',
      fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.05em',
    }}>
      {appConfig.companyShort}
    </div>
  );
}
```

Commit:
```
git add -A
git commit -m "feat(config): remove all hardcoded company/title values, replace with VITE_ env config"
```

---

## ═══════════════════════════════════════════════════
## SECTION 6 — LANDSCAPE A4 PDF REPORT
## Full data: actual scanned vs expected, logo, proper layout
## ═══════════════════════════════════════════════════

### 6.0 — Find existing report generator

Search `@workspace` for: `generateReport` OR `pdfmake` OR `jsPDF` OR `puppeteer` OR `react-pdf`
Show the exact file, function name, and library used.

If the library is **pdfmake** — use pdfmake patterns below.
If the library is **jsPDF** — use jsPDF patterns below.
If it is another library — adapt the patterns to that library.

### 6.1 — CONSTANTS: color palette and config

At the top of the report generator file, define these ONLY colors:

```typescript
// ── Standard SMT Report Color Palette ─────────────────────────────────────
const C = {
  NAVY:         '#1A3557',   // header bg, outer borders, section titles
  BLUE:         '#1D4ED8',   // expected MPN, pass-rate cell, mode badge
  BLUE_LIGHT:   '#EFF6FF',   // expected MPN col bg, alt row
  WHITE:        '#FFFFFF',
  BLACK:        '#0F172A',   // body text
  GREY_DARK:    '#374151',   // secondary text
  GREY_MID:     '#6B7280',   // labels, captions
  GREY_LIGHT:   '#F3F4F6',   // info grid bg, approval bg
  GREY_BORDER:  '#D1D5DB',   // all table borders
  GREEN:        '#15803D',   // PASS status, primary match
  GREEN_BG:     '#F0FDF4',   // PASS row tint
  RED:          '#B91C1C',   // FAIL status, mismatch
  RED_BG:       '#FEF2F2',   // FAIL row bg
  AMBER:        '#B45309',   // WARNING, alternate MPN, MANUAL mode
  AMBER_BG:     '#FFFBEB',   // WARNING row bg
  BLUE_ACCENT:  '#2563EB',   // accent rule under header
} as const;

// ── Layout ─────────────────────────────────────────────────────────────────
const PAGE = {
  orientation: 'landscape' as const,
  pageSize:    'A4' as const,           // 297mm × 210mm landscape
  margin:      [10, 8, 10, 8] as const, // [left, top, right, bottom] mm
};

// ── Company config from environment ─────────────────────────────────────────
const CO_NAME  = process.env.COMPANY_NAME      ?? 'Your Company';
const CO_SHORT = process.env.COMPANY_SHORT     ?? 'CO';
const CO_LOGO  = process.env.COMPANY_LOGO_PATH ?? null;   // absolute path to PNG
```

### 6.2 — DATA QUERY for report (full join)

The report data function must return:
```typescript
async function getReportData(sessionId: string) {
  const session = await db.query.changeoverSessions.findFirst({
    where: (s, { eq }) => eq(s.id, sessionId),
    with: {
      bom: true,                    // bom_headers
      operator: true,               // users
      qaEngineer: true,             // users (qa)
      supervisor: true,             // users (supervisor)
      feederScans: {
        with: { bomItem: true },    // join bom_items per scan
        orderBy: (s, { asc }) => [asc(s.scannedAt)],
      },
    },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);

  const startMs = new Date(session.startedAt).getTime();
  const endMs   = session.completedAt
    ? new Date(session.completedAt).getTime()
    : Date.now();
  const durationMin = Math.round((endMs - startMs) / 60000);

  const totalFeeders   = session.feederScans.filter(s => s.status !== 'duplicate').length;
  const passCount      = session.feederScans.filter(s => s.status === 'verified').length;
  const failCount      = session.feederScans.filter(s => s.status === 'failed').length;
  const warnCount      = session.feederScans.filter(s => s.matchedField !== 'mpn1' && s.matchedField !== 'internalPartNumber' && s.status === 'verified').length;
  const passRate       = totalFeeders > 0 ? Math.round((passCount / totalFeeders) * 100) : 0;

  return { session, durationMin, totalFeeders, passCount, failCount, warnCount, passRate };
}
```

### 6.3 — REPORT STRUCTURE (pdfmake or jsPDF)

Build the report in this EXACT section order:

---

#### SECTION A — Header Band

One row, 3 cells, full page width, background `C.NAVY`:

**Left cell (15% width):**
- If `CO_LOGO` file exists: render image, height=16mm, max-width=45mm
- Else: render two-line text:
  - Line 1: `CO_SHORT` — 20pt bold, `C.WHITE`
  - Line 2: `CO_NAME` — 7pt, `#CBD5E1`

**Centre cell (52% width):**
- Line 1: `'SMT CHANGEOVER VERIFICATION REPORT'` — 14pt bold, `C.WHITE`, centered
- Line 2: `CO_NAME` — 8pt, `#BFDBFE`, centered
- Line 3: `'SMT Manufacturing Quality System'` — 7pt, `#93C5FD`, centered

**Right cell (33% width):**
- `'Changeover ID'` label — 8pt, `#93C5FD`, right-aligned
- `session.id` value — 12pt bold, `C.WHITE`, right-aligned (e.g. `SMT_20260425_000001`)
- Mode badge text:
  - AUTO mode → `'⚡ AUTO — STRICT MODE'` — 8pt, `#86EFAC`, right-aligned
  - MANUAL mode → `'🔒 MANUAL MODE'` — 8pt, `#FCD34D`, right-aligned

Below header band: horizontal rule, 3pt, `C.BLUE_ACCENT`, gap 3mm

---

#### SECTION B — Info Grid

3 rows × 10 columns (5 label+value pairs per row)
Background: `C.GREY_LIGHT`
Outer border: 1pt `C.NAVY`
Inner borders: 0.5pt `C.GREY_BORDER`

Row 1 data:
| Label | Value |
|---|---|
| Changeover ID | `session.id` |
| Panel ID | `session.bom.panelId ?? '—'` |
| Shift | `session.bom.shift ?? '—'` |
| Date | `format(session.startedAt, 'dd-MMM-yyyy')` |
| Duration | `'${durationMin} min'` |

Row 2 data:
| Label | Value |
|---|---|
| Customer | `session.bom.customer ?? '—'` |
| Machine | `session.bom.machine ?? '—'` |
| Operator | `session.operator.displayName ?? '—'` |
| Start Time | `format(session.startedAt, 'hh:mm:ss a')` |
| BOM Version | `session.bom.bomVersion ?? '—'` |

Row 3 data:
| Label | Value |
|---|---|
| PCB / Part No. | `session.bom.pcbPartNumber ?? '—'` |
| Line | `session.bom.line ?? '—'` |
| QA Engineer | `session.qaEngineer?.displayName ?? '—'` |
| End Time | `session.completedAt ? format(...) : 'In Progress'` |
| Supervisor | `session.supervisor?.displayName ?? '—'` |

Each cell: label 6.5pt bold `C.GREY_MID`, value 7.5pt bold `C.BLACK`, padding 3pt/5pt.

**NEVER show "N/A" — use em dash `'—'` for missing fields.**

---

#### SECTION C — Section Title

`'▌ Component Verification Details'`
10pt bold, `C.NAVY`, spacer 2mm after

---

#### SECTION D — Component Verification Table

**Page orientation: LANDSCAPE A4**
**Responsive column widths** — calculate at runtime:

```typescript
function getColWidths(usableWidth: number): number[] {
  const pct = [
    0.055,   // Feeder No.
    0.050,   // Ref/Des
    0.090,   // Component Desc
    0.070,   // Value/Pkg
    0.038,   // Pkg Size
    0.090,   // Internal P/N
    0.125,   // Expected MPN (BOM)   ← wider
    0.125,   // Scanned (Actual)     ← wider
    0.088,   // Matched As
    0.075,   // Lot Code
    0.042,   // Mode
    0.045,   // Status
    0.047,   // Time
  ];
  const sum = pct.reduce((a,b) => a+b, 0);
  return pct.map(p => usableWidth * (p / sum));
}
```

**Header row style:**
- Columns 1–6, 9–13: background `C.NAVY`, text `C.WHITE`, 6.5pt bold
- Column 7 (Expected MPN): background `C.BLUE`, text `C.WHITE`, 6.5pt bold
- Column 8 (Scanned Actual): background `C.BLUE_ACCENT` (`#2563EB`), text `C.WHITE`, 6.5pt bold

**Header labels** (use `\n` for line breaks to keep headers compact):
```
'Feeder\nNo.' | 'Ref /\nDes' | 'Component\nDescription' | 'Value' | 'Pkg\nSize' |
'Internal\nPart No.' | 'Expected MPN\n(BOM — valid options)' |
'Scanned Spool\n(Actual Scan)' | 'Matched\nAs' | 'Lot\nCode' | 'Mode' | 'Status' | 'Time'
```

**Body rows — build from `session.feederScans`:**

For each scan row:
```typescript
const expectedMpns = [
  scan.bomItem?.mpn1,
  scan.bomItem?.mpn2,
  scan.bomItem?.mpn3,
].filter(Boolean).join('\n');   // one MPN per line in the cell

const scannedVal  = scan.scannedValue ?? '—';
const isAlternate = scan.matchedField === 'mpn2' || scan.matchedField === 'mpn3';
const isPrimary   = scan.matchedField === 'mpn1' || scan.matchedField === 'internalPartNumber';
const isFailed    = scan.status === 'failed';
const isDuplicate = scan.status === 'duplicate';

const scannedColor = isFailed    ? C.RED
                   : isAlternate ? C.AMBER
                   : isPrimary   ? C.GREEN
                   : C.BLACK;

const scannedText  = isFailed    ? `${scannedVal} ✗`
                   : isAlternate ? `${scannedVal} ▲`
                   : scannedVal;

const matchedLabel = scan.matchedField === 'mpn1'             ? `MPN 1 (${scan.bomItem?.make1 ?? ''})`
                   : scan.matchedField === 'mpn2'             ? `MPN 2 (${scan.bomItem?.make2 ?? ''})`
                   : scan.matchedField === 'mpn3'             ? `MPN 3 (${scan.bomItem?.make3 ?? ''})`
                   : scan.matchedField === 'internalPartNumber' ? 'Internal P/N'
                   : 'No Match';

const rowBg = isFailed    ? C.RED_BG
            : isAlternate ? C.AMBER_BG
            : isDuplicate ? '#FFFBEB'
            : rowIndex % 2 === 0 ? C.WHITE : C.BLUE_LIGHT;

const modeText  = scan.verificationMode === 'MANUAL' ? 'MAN' : 'AUTO';
const modeColor = scan.verificationMode === 'MANUAL' ? C.AMBER : C.BLUE;
```

Row cell values:
1. `scan.feederNumber`
2. `scan.bomItem?.referenceLocation ?? '—'`
3. `scan.bomItem?.description ?? '—'`
4. `scan.bomItem?.description ?? '—'`   *(repeat or use value field if exists)*
5. `scan.bomItem?.packageDescription ?? '—'`
6. `scan.bomItem?.internalPartNumber ?? '—'`
7. `expectedMpns` — text color `C.BLUE`, background `C.BLUE_LIGHT`
8. `scannedText` — text color `scannedColor`, bold
9. `matchedLabel`
10. `scan.lotCode ?? '—'` — color `C.GREY_MID` if null
11. `modeText` — text color `modeColor`, bold, centered
12. `scan.status.toUpperCase()` — text color: green/red/amber per status
13. `format(scan.scannedAt, 'hh:mm:ss a')`

**Table borders:**
- Outer perimeter: 1.5pt `C.NAVY`
- After col 6 (before Expected MPN): 1pt `C.NAVY` — strong divider
- After col 8 (after Scanned): 1pt `C.NAVY` — strong divider
- All other inner lines: 0.4pt `C.GREY_BORDER`

**Header repeats on page 2+** (`repeatRows: 1` in pdfmake or equivalent)

**Row height: auto (content-driven)** — never fixed height

---

#### SECTION E — Legend

Single line, 6pt, `C.GREY_MID`, below table, spacer 2mm:

```
Legend — Scanned Spool:  Green = Primary MPN matched  |  Amber ▲ = Alternate MPN (BOM-approved)  |
Red ✗ = Mismatch (rejected)  |  Blue = Expected BOM options  |
AUTO STRICT: exact match only, fuzzy matching disabled
```

---

#### SECTION F — Summary Bar

Title: `'▌ Verification Summary'` — 10pt bold, `C.NAVY`, spacer 2mm

6 equal-width cells, full page width:

| Cell | Label | Value | Background |
|---|---|---|---|
| 1 | Total Feeders | `totalFeeders` | `C.NAVY` |
| 2 | PASS | `passCount` | `C.GREEN` |
| 3 | FAIL | `failCount` | `C.RED` |
| 4 | WARNING | `warnCount` | `C.AMBER` |
| 5 | Pass Rate | `'${passRate}%'` | `C.BLUE` |
| 6 | Status | `COMPLETE` or `FAILED` | green if 100%, red if fail |

All text `C.WHITE`. Label: 7pt. Value: 18pt bold. Border between cells: 0.5pt `C.WHITE`. Outer: 1pt `C.NAVY`.

---

#### SECTION G — Approvals

Title: `'▌ Approvals & Sign-off'` — 9pt bold, `C.NAVY`

4 equal-width cells: `SUPERVISOR` | `OPERATOR` | `QA ENGINEER` | `PRODUCTION MANAGER`

Each cell:
- Role label: 7.5pt bold, `C.GREY_MID`, centered
- 12mm blank space (signature area)
- Horizontal rule: 0.75pt `C.GREY_BORDER`, 70% width centered
- 1.5mm spacer
- Name from DB (operator/qa name where known, else blank line): 9pt bold, `C.BLACK`, centered
- `'Name / Signature / Date'`: 6.5pt, `C.GREY_MID`, centered

Background: `C.GREY_LIGHT`. Outer: 0.75pt `C.GREY_BORDER`. Inner: 0.5pt `C.GREY_BORDER`. Padding: 8pt all sides.

---

#### SECTION H — Footer

Horizontal rule: 0.5pt `C.GREY_BORDER`, spacer 2mm

Single line, 5.5pt, `C.GREY_MID`, centered:
```
SMTVerification System — Electronically Generated Report  |
Changeover: {session.id}  |  Date: {format(now, 'dd-MMM-yyyy')}  |
BOM Version: {bom.bomVersion ?? '—'}  |  Mode: {session.verificationMode} — STRICT  |
This document is valid without physical signature when QR-verified.
```

---

### 6.4 — Logo rendering

```typescript
import fs from 'fs';
import path from 'path';

function getLogoImageData(): string | null {
  if (!CO_LOGO) return null;
  const absPath = path.resolve(CO_LOGO);
  if (!fs.existsSync(absPath)) return null;
  const buffer = fs.readFileSync(absPath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
```

In the header left cell:
```typescript
const logoData = getLogoImageData();
const logoCell = logoData
  ? { image: logoData, fit: [45, 16], alignment: 'left' }
  : {
      stack: [
        { text: CO_SHORT, fontSize: 20, bold: true, color: C.WHITE },
        { text: CO_NAME, fontSize: 7, color: '#CBD5E1' },
      ]
    };
```

### 6.5 — API endpoint for PDF report

Ensure `GET /api/sessions/:id/report` (or `/report/pdf`):
- Calls `getReportData(sessionId)` then `generatePDF(data)`
- Streams the PDF as response:
  ```typescript
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="SMT_Report_${sessionId}.pdf"`);
  // stream or buffer the PDF
  ```

### 6.6 — Frontend Print / Download button

In the session view and the completed session screen:
```tsx
<button
  onClick={() => window.open(`/api/sessions/${sessionId}/report`, '_blank')}
  style={{
    padding: '8px 18px', borderRadius: '8px', fontSize: '13px',
    fontWeight: 700, border: 'none', cursor: 'pointer',
    background: C.NAVY, color: '#fff',
    display: 'flex', alignItems: 'center', gap: '6px',
  }}
>
  📄 Download Report (PDF)
</button>
```

Commit:
```
git add -A
git commit -m "feat(report): landscape A4 PDF with full scan data, logo, mode badge, actual vs expected columns, SMT_ ID format"
```

---

## ═══════════════════════════════════════════════════
## SECTION 7 — FINAL VALIDATION CHECKLIST
## Run after all 6 sections are committed
## ═══════════════════════════════════════════════════

```
Run full validation — no code changes, audit only.

1. pnpm --filter @workspace/api-server run build         → must be green
2. pnpm --filter @workspace/feeder-scanner run build     → must be green
3. pnpm audit --audit-level=high                         → show output

Then check each item and report ✅ PASS or ❌ FAIL with file + line:

ID FORMAT:
[ ] New session created with ID matching regex: ^SMT_\d{8}_\d{6}$
[ ] Old CHG format is gone from all files
[ ] Report PDF filename uses new SMT_ ID

MODE:
[ ] On new session load → mode defaults to AUTO
[ ] Clicking AUTO toggle → password modal appears
[ ] Wrong password → error shown, modal stays open
[ ] Correct password (SMT@#123) → switches to MANUAL
[ ] MANUAL → AUTO requires no password
[ ] Mode badge visible in scan input area
[ ] Mode stored in DB on changeover_sessions.verificationMode
[ ] Mode stored per scan on feeder_scans.verificationMode

AUTO-SCAN:
[ ] Feeder field: scan submits automatically after 300ms, no Enter needed
[ ] MPN field: scan submits automatically after 300ms, no Enter needed
[ ] Lot code: ONLY submits on Enter key or Skip button
[ ] Focus moves automatically: feeder → MPN → lot code → feeder
[ ] No double-submit possible (scanning=true guard)

SESSION LOG:
[ ] Col 7 "Expected MPN" shows actual MPN values in blue (not feeder no.)
[ ] Col 8 "Scanned Actual" shows the real barcode scanned by operator
[ ] YSM-001 does NOT appear in the Scanned column
[ ] Matched As column shows "MPN 2 (YAGEO)" style text
[ ] Mode column shows AUTO/MANUAL badge
[ ] Status badge colours correct (green/amber/red)
[ ] Log scrolls internally, inputs not pushed off screen

HARDCODED VALUES:
[ ] Zero hardcoded company name strings in any .tsx/.ts file
[ ] All company/title text comes from appConfig / VITE_ env vars
[ ] Logo renders from VITE_LOGO_URL if file exists

PDF REPORT:
[ ] Page is A4 Landscape (297×210mm)
[ ] Company logo or short name visible top-left of header
[ ] Header background is dark navy #1A3557
[ ] Blue accent line below header
[ ] Info grid: zero "N/A" fields — all populated or "—"
[ ] Duration shows correct minutes (not 2998)
[ ] Changeover ID in header is new SMT_ format
[ ] Mode badge visible in header (AUTO — STRICT or MANUAL)
[ ] Col 7 Expected MPN: blue text, shows all valid BOM MPNs
[ ] Col 8 Scanned (Actual): shows real scanned barcode
[ ] Primary match → green text
[ ] Alternate match → amber text + ▲ suffix
[ ] Failed → red text + ✗ suffix
[ ] FAIL rows have red background tint
[ ] Summary bar has 6 coloured cells
[ ] Approvals has 4 signature blocks
[ ] Footer single line with session ID and mode
[ ] PDF downloads as: SMT_Report_SMT_20260425_000001.pdf

If all pass, print:
"✅ ALL SECTIONS COMPLETE — SMTVerification ready for operator testing"

If any fail, implement the fix before printing.
```

---

## QUICK REFERENCE — Implementation Order

| Section | Feature | Est. Time | Key Files |
|---|---|---|---|
| 1 | ID Format `SMT_YYYYMMDD_NNNNNN` | 1h | `generateSessionId.ts`, `sessions.ts` schema |
| 2 | Mode Toggle (Auto default / Manual locked) | 2h | `ModeToggle.tsx`, sessions route |
| 3 | Auto-scan 300ms debounce, no keypress | 1.5h | `useAutoScan.ts`, FeederVerification page |
| 4 | Session log with actual vs expected data | 2h | scan log query, log table component |
| 5 | Remove hardcoded values | 1h | `appConfig.ts`, `.env`, header component |
| 6 | Landscape A4 PDF report | 4h | report generator, `/report` API route |
| 7 | Final validation | 0.5h | read-only audit |

**Total: ~12 hours**

Start with Section 1 — ID format. Type **"NEXT"** to proceed after each section completes.
