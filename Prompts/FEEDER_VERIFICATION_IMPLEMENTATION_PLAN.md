# Complete Feeder Verification System — Implementation Plan

> **Target URL:** `http://localhost:5173/session`  
> **Current Issues:** Auto verification accepts everything, no log creation, scanned data not saved to report, manual verification missing, splicing not automated, reset not clearing data properly  
> **Goal:** Professional barcode scanner-first workflow with strict validation, supervisor override, detailed logging, and proper report generation

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION ACTIVE PAGE                          │
│  (http://localhost:5173/session)                                │
└─────────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   FEEDER     │  │   SPLICING   │  │    REPORTS   │
│ VERIFICATION │  │   SECTION    │  │   & LOGS     │
│  (AUTO MODE) │  │  (AUTO MODE) │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │
        ├─ Manual Override │
        │  (Password)      │
        │                  │
        ▼                  ▼
┌──────────────┐  ┌──────────────┐
│  SUPERVISOR  │  │  DETAILED    │
│   APPROVAL   │  │  SCAN LOG    │
│  (QA/SUPER)  │  │  (DATABASE)  │
└──────────────┘  └──────────────┘
```

---

## PHASE 1 — AUTO FEEDER VERIFICATION (STRICT MODE)

### 1.1 — Barcode Scanner Input Flow

**Current problem:** System accepts everything, no validation.

**Implementation:**

```typescript
// File: artifacts/feeder-scanner/src/pages/FeederVerification.tsx

interface ScanState {
  step: 'FEEDER' | 'MPN' | 'LOT' | 'COMPLETE';
  feederNumber: string | null;
  scannedMPN: string | null;
  lotCode: string | null;
  bomMatch: BomMatch | null;
  error: string | null;
}

interface BomMatch {
  feederNumber: string;
  internalPartNumber: string;
  mpn1: string;
  mpn2: string | null;
  mpn3: string | null;
  make1: string;
  make2: string | null;
  make3: string | null;
  matchedField: 'mpn1' | 'mpn2' | 'mpn3' | 'internalPartNumber' | null;
  matchedMake: string | null;
  isAlternate: boolean;  // true if mpn2 or mpn3 matched
}
```

**Scanner input handler with auto-validation:**

```typescript
const FeederVerificationAuto: React.FC = () => {
  const [scanState, setScanState] = useState<ScanState>({
    step: 'FEEDER',
    feederNumber: null,
    scannedMPN: null,
    lotCode: null,
    bomMatch: null,
    error: null,
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Auto-validate on input change (300ms debounce)
  const handleScanInput = (value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    debounceTimer.current = setTimeout(async () => {
      if (value.length < 3) return;  // minimum barcode length
      
      if (scanState.step === 'FEEDER') {
        await validateFeeder(value);
      } else if (scanState.step === 'MPN') {
        await validateMPN(value);
      }
    }, 300);
  };

  // STEP 1 — Feeder Number Validation
  const validateFeeder = async (feederNumber: string) => {
    try {
      // Call API to check if feeder exists in BOM
      const response = await fetch(`/api/verification/check-feeder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: currentSessionId, 
          feederNumber: feederNumber.trim() 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      
      if (data.alreadyScanned) {
        notify.error(
          `Feeder "${feederNumber}" already verified`,
          'To re-scan, reject the existing scan first.'
        );
        clearInput();
        return;
      }

      if (!data.found) {
        notify.error(
          `Feeder "${feederNumber}" not found in BOM`,
          'Check the feeder number and try again.'
        );
        playBuzzer();
        clearInput();
        return;
      }

      // Feeder found — advance to MPN scan
      notify.success(`Feeder "${feederNumber}" found in BOM`);
      setScanState({
        ...scanState,
        step: 'MPN',
        feederNumber: feederNumber.trim(),
        bomMatch: data.bomData,  // includes mpn1, mpn2, mpn3, make info
      });
      
      // Auto-focus next input
      setTimeout(() => inputRef.current?.focus(), 100);

    } catch (err) {
      notify.error('Validation failed', err.message);
      playBuzzer();
      clearInput();
    }
  };

  // STEP 2 — MPN/Part Number Validation (STRICT)
  const validateMPN = async (scannedValue: string) => {
    try {
      const response = await fetch(`/api/verification/validate-mpn`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          feederNumber: scanState.feederNumber,
          scannedValue: scannedValue.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const result = await response.json();

      if (!result.valid) {
        // MPN MISMATCH — show what was expected
        const expected = [
          scanState.bomMatch.mpn1,
          scanState.bomMatch.mpn2,
          scanState.bomMatch.mpn3,
        ].filter(Boolean).join(' | ');

        notify.error(
          `MPN mismatch for feeder ${scanState.feederNumber}`,
          `Scanned: ${scannedValue}\nExpected: ${expected}\n\n` +
          `To use alternate MPN, click Manual Override.`
        );
        playBuzzer();
        
        // Stay on MPN step, clear input, allow retry or manual override
        clearInput();
        return;
      }

      // MPN MATCHED
      if (result.isAlternate) {
        // Alternate component used — show warning
        notify.warning(
          `Alternate component used for ${scanState.feederNumber}`,
          `Matched: ${result.matchedField} — ${result.matchedMake}\n` +
          `${result.alternateCount} alternates available in BOM.`
        );
      } else {
        notify.success(`MPN matched for ${scanState.feederNumber}`);
      }

      // Advance to Lot Code step
      setScanState({
        ...scanState,
        step: 'LOT',
        scannedMPN: scannedValue.trim(),
        bomMatch: {
          ...scanState.bomMatch,
          matchedField: result.matchedField,
          matchedMake: result.matchedMake,
          isAlternate: result.isAlternate,
        },
      });

      setTimeout(() => inputRef.current?.focus(), 100);

    } catch (err) {
      notify.error('MPN validation failed', err.message);
      playBuzzer();
      clearInput();
    }
  };

  // STEP 3 — Lot Code (optional, Enter to skip)
  const handleLotCodeSubmit = async (lotCode: string) => {
    try {
      // Save the complete scan record to database
      const response = await fetch(`/api/verification/save-scan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          feederNumber: scanState.feederNumber,
          scannedValue: scanState.scannedMPN,
          lotCode: lotCode.trim() || null,
          matchedField: scanState.bomMatch.matchedField,
          matchedMake: scanState.bomMatch.matchedMake,
          status: 'verified',
          verificationMode: 'AUTO',
        }),
      });

      if (!response.ok) throw new Error('Failed to save scan');

      const data = await response.json();

      // Show success notification with full details
      notify.success(
        `Feeder ${scanState.feederNumber} verified successfully`,
        `MPN: ${scanState.scannedMPN}\n` +
        `Matched: ${scanState.bomMatch.matchedField} (${scanState.bomMatch.matchedMake})\n` +
        `Lot: ${lotCode || 'N/A'}\n` +
        `Progress: ${data.progress.verified}/${data.progress.total} (${data.progress.percent}%)`
      );

      // Update progress bar
      updateProgress(data.progress);

      // Reset to FEEDER step for next scan
      setScanState({
        step: 'FEEDER',
        feederNumber: null,
        scannedMPN: null,
        lotCode: null,
        bomMatch: null,
        error: null,
      });

      // Auto-focus feeder input for continuous scanning
      setTimeout(() => inputRef.current?.focus(), 2000);

    } catch (err) {
      notify.error('Failed to save scan', err.message);
      playBuzzer();
    }
  };

  // Render the current step's input field
  return (
    <div className="feeder-verification-auto">
      <ProgressBar progress={progress} />
      
      {scanState.step === 'FEEDER' && (
        <div className="scan-step">
          <label>Scan Feeder Number</label>
          <input
            ref={inputRef}
            type="text"
            placeholder="YSM-001"
            autoFocus
            onChange={(e) => handleScanInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') validateFeeder(e.currentTarget.value);
            }}
          />
          <p className="hint">Scan barcode or type and press Enter</p>
        </div>
      )}

      {scanState.step === 'MPN' && (
        <div className="scan-step">
          <label>Scan MPN / Part Number for {scanState.feederNumber}</label>
          <input
            ref={inputRef}
            type="text"
            placeholder="C0603C472K5RACAUTO"
            autoFocus
            onChange={(e) => handleScanInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') validateMPN(e.currentTarget.value);
            }}
          />
          <p className="hint">
            Expected: {scanState.bomMatch.mpn1}
            {scanState.bomMatch.mpn2 && ` | ${scanState.bomMatch.mpn2}`}
            {scanState.bomMatch.mpn3 && ` | ${scanState.bomMatch.mpn3}`}
          </p>
          <button onClick={() => openManualOverride()}>
            Manual Override (Supervisor)
          </button>
        </div>
      )}

      {scanState.step === 'LOT' && (
        <div className="scan-step">
          <label>Scan Lot Code (optional)</label>
          <input
            ref={inputRef}
            type="text"
            placeholder="LOT-2024-KR01"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleLotCodeSubmit(e.currentTarget.value);
              }
            }}
          />
          <p className="hint">Press Enter to skip if no lot code</p>
        </div>
      )}

      <ScanLogTable sessionId={currentSessionId} />
    </div>
  );
};
```

### 1.2 — API Endpoints for Validation

**File:** `artifacts/api-server/src/routes/verification.ts`

```typescript
// POST /api/verification/check-feeder
router.post('/check-feeder', auth, async (req, res) => {
  const { sessionId, feederNumber } = req.body;
  
  try {
    // 1. Get session and BOM
    const session = await db.query.changeoverSessions.findFirst({
      where: eq(changeoverSessions.id, sessionId),
    });
    
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    // 2. Check if feeder already scanned in this session
    const existingScan = await db.query.feederScans.findFirst({
      where: and(
        eq(feederScans.sessionId, sessionId),
        eq(feederScans.feederNumber, feederNumber),
        eq(feederScans.status, 'verified')
      ),
    });
    
    if (existingScan) {
      return res.json({ 
        found: true, 
        alreadyScanned: true,
        message: `Feeder ${feederNumber} already verified` 
      });
    }
    
    // 3. Look up feeder in BOM
    const bomItem = await db.query.bomItems.findFirst({
      where: and(
        eq(bomItems.bomId, session.bomId),
        eq(bomItems.feederNumber, feederNumber)
      ),
    });
    
    if (!bomItem) {
      return res.json({ 
        found: false,
        message: `Feeder ${feederNumber} not in BOM` 
      });
    }
    
    // 4. Return BOM data for this feeder
    res.json({
      found: true,
      alreadyScanned: false,
      bomData: {
        feederNumber: bomItem.feederNumber,
        internalPartNumber: bomItem.internalPartNumber,
        mpn1: bomItem.mpn1,
        mpn2: bomItem.mpn2,
        mpn3: bomItem.mpn3,
        make1: bomItem.make1,
        make2: bomItem.make2,
        make3: bomItem.make3,
        description: bomItem.description,
        packageDescription: bomItem.packageDescription,
      },
    });
    
  } catch (err) {
    console.error('Check feeder error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/verification/validate-mpn
router.post('/validate-mpn', auth, async (req, res) => {
  const { sessionId, feederNumber, scannedValue } = req.body;
  
  try {
    const session = await db.query.changeoverSessions.findFirst({
      where: eq(changeoverSessions.id, sessionId),
    });
    
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const bomItem = await db.query.bomItems.findFirst({
      where: and(
        eq(bomItems.bomId, session.bomId),
        eq(bomItems.feederNumber, feederNumber)
      ),
    });
    
    if (!bomItem) {
      return res.status(404).json({ error: 'Feeder not in BOM' });
    }
    
    // STRICT EXACT MATCH — case-insensitive, trimmed
    const scanned = scannedValue.trim().toUpperCase();
    const mpn1 = bomItem.mpn1?.trim().toUpperCase();
    const mpn2 = bomItem.mpn2?.trim().toUpperCase();
    const mpn3 = bomItem.mpn3?.trim().toUpperCase();
    
    // Also check internal part number tokens
    const internalTokens = (bomItem.internalPartNumber || '')
      .split(/\s+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
    
    let matchedField = null;
    let matchedMake = null;
    let isAlternate = false;
    
    if (mpn1 && scanned === mpn1) {
      matchedField = 'mpn1';
      matchedMake = bomItem.make1;
      isAlternate = false;
    } else if (mpn2 && scanned === mpn2) {
      matchedField = 'mpn2';
      matchedMake = bomItem.make2;
      isAlternate = true;
    } else if (mpn3 && scanned === mpn3) {
      matchedField = 'mpn3';
      matchedMake = bomItem.make3;
      isAlternate = true;
    } else if (internalTokens.includes(scanned)) {
      matchedField = 'internalPartNumber';
      matchedMake = null;
      isAlternate = false;
    } else {
      // NO MATCH
      return res.json({
        valid: false,
        error: 'MPN_MISMATCH',
        scanned: scannedValue,
        expected: [mpn1, mpn2, mpn3].filter(Boolean),
      });
    }
    
    // MATCH FOUND
    const alternateCount = [mpn1, mpn2, mpn3].filter(Boolean).length;
    
    res.json({
      valid: true,
      matchedField,
      matchedMake,
      isAlternate,
      alternateCount,
    });
    
  } catch (err) {
    console.error('Validate MPN error:', err);
    res.status(500).json({ error: 'Validation error' });
  }
});

// POST /api/verification/save-scan
router.post('/save-scan', auth, async (req, res) => {
  const { 
    sessionId, feederNumber, scannedValue, 
    lotCode, matchedField, matchedMake, 
    status, verificationMode 
  } = req.body;
  
  try {
    await db.transaction(async (tx) => {
      // Insert scan record
      await tx.insert(feederScans).values({
        sessionId,
        feederNumber,
        scannedValue,
        lotCode,
        matchedField,
        matchedMake,
        status,
        verificationMode: verificationMode || 'AUTO',
        operatorId: req.actor.userId,
        scannedAt: new Date(),
      });
      
      // Update progress
      const progress = await getSessionProgress(sessionId, tx);
      
      res.json({ success: true, progress });
    });
    
  } catch (err) {
    console.error('Save scan error:', err);
    res.status(500).json({ error: 'Failed to save scan' });
  }
});
```

---

## PHASE 2 — MANUAL OVERRIDE (PASSWORD PROTECTED)

### 2.1 — Supervisor Override Modal

When AUTO mode rejects an MPN but the operator wants to proceed
(e.g., using an unlisted alternate), they click "Manual Override".

**File:** `artifacts/feeder-scanner/src/components/ManualOverrideModal.tsx`

```typescript
interface ManualOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  feederNumber: string;
  scannedValue: string;
  expectedMPNs: string[];
  onApproved: (approverRole: 'supervisor' | 'qa', password: string) => void;
}

const ManualOverrideModal: React.FC<ManualOverrideModalProps> = ({
  isOpen, onClose, feederNumber, scannedValue, expectedMPNs, onApproved
}) => {
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'supervisor' | 'qa'>('supervisor');
  const [error, setError] = useState('');

  const handleApprove = async () => {
    try {
      // Verify supervisor/QA password
      const response = await fetch('/api/auth/verify-override', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, role }),
      });

      if (!response.ok) {
        throw new Error('Invalid password');
      }

      const data = await response.json();
      
      // Password correct — allow override
      onApproved(role, data.approverName);
      onClose();

    } catch (err) {
      setError('Invalid supervisor/QA password');
      playBuzzer();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content manual-override">
        <h2>⚠️ Manual Override Required</h2>
        
        <div className="override-details">
          <p><strong>Feeder:</strong> {feederNumber}</p>
          <p><strong>Scanned MPN:</strong> {scannedValue}</p>
          <p><strong>Expected (BOM):</strong> {expectedMPNs.join(' | ')}</p>
        </div>

        <div className="warning-box">
          <p>
            The scanned MPN does not match any BOM-approved option.
            To proceed, supervisor or QA approval is required.
          </p>
        </div>

        <div className="role-select">
          <label>
            <input 
              type="radio" 
              value="supervisor" 
              checked={role === 'supervisor'}
              onChange={() => setRole('supervisor')}
            />
            Supervisor Approval
          </label>
          <label>
            <input 
              type="radio" 
              value="qa" 
              checked={role === 'qa'}
              onChange={() => setRole('qa')}
            />
            QA Engineer Approval
          </label>
        </div>

        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApprove();
          }}
          autoFocus
        />

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button onClick={handleApprove} className="btn-primary">
            Approve Override
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 2.2 — Save Manual Override to Database

After supervisor approves, save the scan with special flag:

```typescript
await fetch('/api/verification/save-scan', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId,
    feederNumber,
    scannedValue,
    lotCode,
    matchedField: 'manual_override',  // special flag
    matchedMake: null,
    status: 'verified',
    verificationMode: 'MANUAL_OVERRIDE',
    approvedBy: approverName,
    approvedByRole: role,  // 'supervisor' or 'qa'
  }),
});
```

Update `feeder_scans` schema to include:
```sql
ALTER TABLE feeder_scans 
ADD COLUMN verificationMode VARCHAR(20) DEFAULT 'AUTO',
ADD COLUMN approvedBy VARCHAR(100),
ADD COLUMN approvedByRole VARCHAR(20);
```

---

## PHASE 3 — DETAILED SCAN LOG

### 3.1 — Real-time Scan Log Table

**File:** `artifacts/feeder-scanner/src/components/ScanLogTable.tsx`

```typescript
const ScanLogTable: React.FC<{ sessionId: number }> = ({ sessionId }) => {
  const [scans, setScans] = useState<ScanRecord[]>([]);

  useEffect(() => {
    // Fetch initial scans
    fetchScans();
    
    // Poll for updates every 2 seconds
    const interval = setInterval(fetchScans, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const fetchScans = async () => {
    const response = await fetch(
      `/api/verification/sessions/${sessionId}/scans`,
      { credentials: 'include' }
    );
    const data = await response.json();
    setScans(data.scans);
  };

  return (
    <div className="scan-log-container">
      <h3>Scan Log — Last 20 Records</h3>
      
      <table className="scan-log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Feeder</th>
            <th>Scanned Value</th>
            <th>Expected (BOM)</th>
            <th>Matched Field</th>
            <th>Make</th>
            <th>Lot Code</th>
            <th>Status</th>
            <th>Mode</th>
            <th>Approved By</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => (
            <tr 
              key={scan.id} 
              className={`status-${scan.status.toLowerCase()}`}
            >
              <td>{formatTime(scan.scannedAt)}</td>
              <td>{scan.feederNumber}</td>
              <td className="scan-value">{scan.scannedValue}</td>
              <td className="expected-value">
                {scan.bomMpn1}
                {scan.bomMpn2 && ` | ${scan.bomMpn2}`}
                {scan.bomMpn3 && ` | ${scan.bomMpn3}`}
              </td>
              <td>{scan.matchedField}</td>
              <td>{scan.matchedMake || '—'}</td>
              <td>{scan.lotCode || '—'}</td>
              <td>
                <span className={`badge badge-${scan.status.toLowerCase()}`}>
                  {scan.status}
                </span>
              </td>
              <td>
                <span className={`mode-${scan.verificationMode.toLowerCase()}`}>
                  {scan.verificationMode}
                </span>
              </td>
              <td>{scan.approvedBy || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

**API endpoint:**

```typescript
// GET /api/verification/sessions/:sessionId/scans
router.get('/sessions/:sessionId/scans', auth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const scans = await db.query.feederScans.findMany({
      where: eq(feederScans.sessionId, parseInt(sessionId)),
      orderBy: desc(feederScans.scannedAt),
      limit: 20,
    });
    
    // Enrich with BOM expected values
    const enrichedScans = await Promise.all(
      scans.map(async (scan) => {
        const bomItem = await db.query.bomItems.findFirst({
          where: and(
            eq(bomItems.feederNumber, scan.feederNumber),
            // Get bomId from session
          ),
        });
        
        return {
          ...scan,
          bomMpn1: bomItem?.mpn1,
          bomMpn2: bomItem?.mpn2,
          bomMpn3: bomItem?.mpn3,
        };
      })
    );
    
    res.json({ scans: enrichedScans });
    
  } catch (err) {
    console.error('Fetch scans error:', err);
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});
```

---

## PHASE 4 — SPLICING SECTION (AUTO MODE)

After feeder verification reaches 100%, user proceeds to splicing.

**File:** `artifacts/feeder-scanner/src/pages/Splicing.tsx`

```typescript
const SplicingAuto: React.FC = () => {
  const [step, setStep] = useState<'FEEDER' | 'OLD_SPOOL' | 'NEW_SPOOL'>('FEEDER');
  const [feederNumber, setFeederNumber] = useState('');
  const [oldSpoolMPN, setOldSpoolMPN] = useState('');
  const [newSpoolMPN, setNewSpoolMPN] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFeederScan = async (value: string) => {
    // Validate feeder exists in BOM
    const response = await fetch('/api/splicing/check-feeder', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ sessionId, feederNumber: value }),
    });

    if (!response.ok) {
      notify.error('Feeder not in BOM');
      playBuzzer();
      return;
    }

    notify.success(`Feeder ${value} found`);
    setFeederNumber(value);
    setStep('OLD_SPOOL');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleOldSpoolScan = async (value: string) => {
    // Validate old spool MPN matches BOM for this feeder
    const response = await fetch('/api/splicing/validate-spool', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ 
        sessionId, 
        feederNumber, 
        scannedValue: value,
        spoolType: 'old' 
      }),
    });

    if (!response.ok) {
      notify.error('Old spool MPN mismatch');
      playBuzzer();
      return;
    }

    notify.success('Old spool MPN matched');
    setOldSpoolMPN(value);
    setStep('NEW_SPOOL');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleNewSpoolScan = async (value: string) => {
    // Validate new spool MPN matches BOM
    const response = await fetch('/api/splicing/validate-spool', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ 
        sessionId, 
        feederNumber, 
        scannedValue: value,
        spoolType: 'new' 
      }),
    });

    if (!response.ok) {
      notify.error('New spool MPN mismatch');
      playBuzzer();
      return;
    }

    // All 3 fields validated — save splice record
    await saveSpliceRecord();
  };

  const saveSpliceRecord = async () => {
    const response = await fetch('/api/splicing/save', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        sessionId,
        feederNumber,
        oldSpoolMPN,
        newSpoolMPN,
        operatorId: currentUser.id,
      }),
    });

    if (!response.ok) {
      notify.error('Failed to save splice record');
      return;
    }

    notify.success(
      `Splice recorded for ${feederNumber}`,
      `Old: ${oldSpoolMPN} → New: ${newSpoolMPN}`
    );

    // Reset for next splice
    setStep('FEEDER');
    setFeederNumber('');
    setOldSpoolMPN('');
    setNewSpoolMPN('');
    setTimeout(() => inputRef.current?.focus(), 2000);
  };

  return (
    <div className="splicing-auto">
      <h2>Splicing — Spool Replacement</h2>
      
      {step === 'FEEDER' && (
        <div className="scan-step">
          <label>Scan Feeder Number</label>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFeederScan(e.currentTarget.value);
            }}
          />
        </div>
      )}

      {step === 'OLD_SPOOL' && (
        <div className="scan-step">
          <label>Scan Old Spool MPN for {feederNumber}</label>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOldSpoolScan(e.currentTarget.value);
            }}
          />
        </div>
      )}

      {step === 'NEW_SPOOL' && (
        <div className="scan-step">
          <label>Scan New Spool MPN for {feederNumber}</label>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewSpoolScan(e.currentTarget.value);
            }}
          />
        </div>
      )}

      <SpliceLogTable sessionId={sessionId} />
    </div>
  );
};
```

---

## PHASE 5 — RESET BUTTON

Add a "Reset Session" button that:
1. Confirms with user
2. Deletes all scans for this session
3. Resets progress to 0%
4. Returns to feeder verification step 1

```typescript
const handleResetSession = async () => {
  const confirmed = window.confirm(
    'Are you sure you want to reset this session?\n\n' +
    'All scanned feeders and splices will be deleted.\n' +
    'This action cannot be undone.'
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`/api/verification/sessions/${sessionId}/reset`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Reset failed');

    notify.success('Session reset', 'All scans cleared. Ready to start over.');
    
    // Reload the page or reset state
    window.location.reload();

  } catch (err) {
    notify.error('Reset failed', err.message);
  }
};
```

**API endpoint:**

```typescript
// POST /api/verification/sessions/:sessionId/reset
router.post('/sessions/:sessionId/reset', auth, async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    await db.transaction(async (tx) => {
      // Delete all scans for this session
      await tx.delete(feederScans)
        .where(eq(feederScans.sessionId, parseInt(sessionId)));
      
      // Delete all splices for this session
      await tx.delete(spliceRecords)
        .where(eq(spliceRecords.sessionId, parseInt(sessionId)));
      
      // Update session status back to active
      await tx.update(changeoverSessions)
        .set({ status: 'active', completedAt: null })
        .where(eq(changeoverSessions.id, parseInt(sessionId)));
    });
    
    res.json({ success: true, message: 'Session reset' });
    
  } catch (err) {
    console.error('Reset session error:', err);
    res.status(500).json({ error: 'Failed to reset session' });
  }
});
```

---

## PHASE 6 — FINAL REPORT WITH SCANNED DATA

Update the report generator to include:
- **Scanned Value** column showing actual barcode scanned
- **Expected MPN** column showing BOM options
- **Matched Field** showing which field matched (mpn1/mpn2/mpn3)
- **Verification Mode** (AUTO / MANUAL_OVERRIDE)
- **Approved By** (supervisor/QA name if manual override)

See the report implementation prompt in the previous message.

---

## IMPLEMENTATION ORDER

Paste each section into Copilot Chat one at a time:

1. **PHASE 1** — Auto feeder verification with strict validation
2. **PHASE 2** — Manual override modal with password
3. **PHASE 3** — Real-time scan log table
4. **PHASE 4** — Auto splicing section
5. **PHASE 5** — Reset session button
6. **PHASE 6** — Final report with scanned data columns

After each phase, run the app and test the workflow end-to-end
before moving to the next phase.

Commit after each phase:
```
git commit -m "feat(verification): implement phase N — [description]"
```
