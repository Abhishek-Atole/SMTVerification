# Phase 5: Root-Cause Bug Fixes — Testing Guide

## Commit: d156f57
**All 4 interconnected bugs fixed — ready for testing**

---

## Quick Start

```bash
# Terminal 1: Start API server
cd artifacts/api-server && pnpm dev

# Terminal 2: Start Frontend
cd artifacts/feeder-scanner && pnpm dev
```

Navigate to: http://localhost:5173

---

## What Was Fixed

### 1. **Stale Closure Bug (CRITICAL)**
- **Before:** `handleScanBarcode` always read empty/stale `bomDetail?.items`
- **After:** Wrapped in `useCallback` with full dependency array — closure stays fresh
- **Test:** Check browser console for `[SCAN START] bomItemsCount: 8` (or your BOM size) on first scan

### 2. **Step Progression (Consequence of Bug 1)**
- **Before:** `scanStep` never advanced beyond "feeder"
- **After:** Step correctly transitions feeder → spool/mpn → lot
- **Test:** Scan 3 barcodes in sequence; console should show step progression

### 3. **"N/A" String Filtering (MPN Guard)**
- **Before:** MPN fields with "N/A" placeholders caused false negatives
- **After:** `normalizeMpn()` filters "N/A" before matching
- **Test:** Scan BOM with "N/A" MPN values; should match correctly

### 4. **Scanning Guard Finalization**
- **Before:** Ref could lock on errors, blocking subsequent scans
- **After:** Finally blocks guarantee ref release
- **Test:** Intentionally trigger errors; next scan should still work

---

## Testing Workflow

### Test 1: BOM Loaded Correctly
1. Start system and navigate to a verification session
2. Open browser DevTools (F12) → Console tab
3. **Expected:** Should see log on session load showing feeder list

### Test 2: First Scan (Feeder Number)
1. Scan a valid feeder number from your BOM (e.g., `F001`)
2. **Console Should Show:**
   ```
   [SCAN START] {
     input: "F001",
     scanStep: "feeder",
     bomLoaded: true,
     bomItemsCount: 8,    ← CRITICAL: Should be > 0, NOT 0
   }
   [DEBUG] Processing feeder step { normalizedInput: "F001", uiBomItemsCount: 8 }
   ```
3. **UI Should:** Show success alert "Feeder found in BOM"
4. **Next:** Input field placeholder should change to "SCAN MPN/ID"

### Test 3: Second Scan (MPN)
1. Scan a valid MPN for the feeder (e.g., `STM32L476` or whatever matches BOM)
2. **Console Should Show:**
   ```
   [SCAN START] { scanStep: "spool", ... }
   [DEBUG] Processing MPN step { pendingFeeder: "F001", normalizedInput: "STM32L476" }
   [MPN CHECK] { 
     candidates: ["STM32L476", "ALT-MPN", ...],  ← Filtered, NO "N/A" 
     normalizedInput: "STM32L476",
     internalTokens: [...]
   }
   ```
3. **UI Should:** Show success alert "Primary MPN Match" or "Alternate MPN Used"
4. **Next:** Input field placeholder should change to "SCAN LOT CODE (ENTER=SKIP)"

### Test 4: Third Scan (Lot Code)
1. Scan a lot code or press ENTER to skip
2. **Console Should Show:**
   ```
   [DEBUG] Processing lot step { normalizedInput: "LOT123", pendingFeeder: "F001", pendingMpnScan: "STM32L476" }
   ```
3. **UI Should:** Complete the scan and show verification result (AUTO mode) or save (MANUAL mode)
4. **Next:** Input field should reset to "SCAN FEEDER..."

### Test 5: Duplicate Feeder Prevention
1. Scan the same feeder number again (F001)
2. **Console Should Show:**
   ```
   ⚠️ DUPLICATE: Feeder "F001" already verified
   ```
3. **UI Should:** Reject with duplicate warning
4. **Expected:** Duplicate feeder cannot be scanned twice

### Test 6: Error Recovery (Scanning Guard)
1. Attempt to scan an invalid/non-existent feeder (e.g., `BADFEEDER`)
2. **UI Should:** Show error alert
3. **Next Scan:** Immediately scan a valid feeder
4. **Expected:** Next scan should work (no lock-up from ref)

### Test 7: MPN Mismatch (N/A Handling)
1. Find a BOM item with "N/A" or empty MPN values
2. Scan the feeder number for that item
3. Try scanning an MPN that doesn't match
4. **Console Should Show:**
   ```
   [MPN CHECK] { candidates: [...], ... }
   [MPN MISMATCH] { 
     scanned: "WRONGMPN",
     expected: ["EXPECTED1", "EXPECTED2"],  ← NO "N/A" in list
     displayList: "EXPECTED1 | EXPECTED2"
   }
   ```
5. **UI Should:** Show error with filtered candidates only (no "N/A" strings)

---

## Debug Log Reference

### Full Console Logs Expected

```
[SCAN START] {
  input: "F001",
  scanStep: "feeder",
  scanningRef: false,
  verificationInProgress: false,
  verificationLocked: false,
  sessionId: 1,
  bomLoaded: true,
  bomItemsCount: 8       ← KEY: This should be > 0 after Bug 1 fix
}

[DEBUG] Processing feeder step { normalizedInput: "F001", uiBomItemsCount: 8 }

// ... feeder processing ...

[DEBUG] Processing MPN step { pendingFeeder: "F001", normalizedInput: "STM32L476" }
[MPN CHECK] { 
  candidates: ["STM32L476"],
  normalizedInput: "STM32L476",
  internalTokens: []
}

[DEBUG] Processing lot step { normalizedInput: "LOT123", pendingFeeder: "F001", pendingMpnScan: "STM32L476" }

[SCAN COMPLETE] Flags reset
```

---

## Success Criteria

- [ ] `bomItemsCount > 0` appears in console logs (Bug 1 fixed)
- [ ] Step progression: feeder → spool → lot (Bug 2 fixed)
- [ ] MPN matching works with filtered candidates (Bug 3 fixed)
- [ ] No "N/A" strings in error messages (Bug 3 fixed)
- [ ] Errors don't cause scanning lock-up (Bug 4 verified)
- [ ] Duplicate feeders correctly rejected
- [ ] All 3 MPN field sources checked (mpn1 → mpn2 → mpn3 → internal)
- [ ] Case conversion tracked correctly
- [ ] Alternative MPN selection works

---

## Files Modified

- `artifacts/feeder-scanner/src/pages/session-active.tsx`
  - Added `useCallback` import
  - Added `normalizeMpn()` helper (filters "N/A")
  - Added `getFilteredMpnCandidates()` helper
  - Wrapped `handleScanBarcode` in `useCallback` (45+ dependencies)
  - Enhanced debug logging

---

## Troubleshooting

### Issue: `bomItemsCount: 0` still appearing
- **Cause:** Still using stale closure from old build
- **Fix:** Clear browser cache, hard refresh (Ctrl+Shift+R), rebuild frontend

### Issue: `scanStep` stuck on "feeder"
- **Cause:** `useCallback` dependency missing or wrong
- **Fix:** Check console for warnings, verify dependency array is complete

### Issue: "N/A" still appearing in error messages
- **Cause:** `normalizeMpn()` not applied correctly
- **Fix:** Check that `getFilteredMpnCandidates()` is being called in MPN step

### Issue: Scanning locks after error
- **Cause:** `scanningRef` not released in finally block
- **Fix:** Check that finally block exists and sets `scanningRef.current = false`

---

## Build Status

```
✓ feeder-scanner builds successfully
✓ api-server builds successfully  
✓ All TypeScript checks pass
```

Last verified: Phase 5 commit d156f57

---

## Next Steps

1. **Test end-to-end flow** using workflow above
2. **Verify all console logs** match expected format
3. **Check edge cases:** N/A values, duplicates, alternatives
4. **Performance test:** Multiple rapid scans
5. **Integration test:** With full session workflow

**Ready to deploy once testing complete!**
