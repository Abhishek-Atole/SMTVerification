# Testing Checklist - 16-Point SMT MES System

## Pre-Test Setup

### 1. Start Services
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
bash scripts/system-restart-recovery.sh start
```

### 2. Verify Services Running
- [ ] API Server: http://localhost:3000/api/health
- [ ] Frontend: http://localhost:5173
- [ ] Database: psql -h localhost -U smtverify -d smtverify (password: smtverify)
- [ ] ngrok Tunnel: https://nonangling-unspruced-taren.ngrok-free.dev

---

## Phase 1: Basic Functionality

### Create Test BOM
```sql
-- In PostgreSQL
INSERT INTO boms (name, description) VALUES 
  ('TEST-BOM-ALT', 'Test BOM with alternates') 
RETURNING id;
-- Note the ID for below queries

-- Primary components (feeder 1, 2, 3, 4)
INSERT INTO bom_items (bom_id, feeder_number, part_number, mpn, is_alternate, expected_mpn) 
VALUES 
  (1, 'F001', 'REF001', 'MPN001', false, 'MPN001'),
  (1, 'F002', 'REF002', 'MPN002', false, 'MPN002'),
  (1, 'F003', 'REF003', 'MPN003', false, 'MPN003'),
  (1, 'F004', 'REF004', 'MPN004', false, 'MPN004');

-- Alternates for F001 (should not count toward progress)
INSERT INTO bom_items (bom_id, feeder_number, part_number, mpn, is_alternate, expected_mpn, parent_item_id) 
VALUES 
  (1, 'F001', 'ALT001-A', 'MPN001-ALT-A', true, 'MPN001-ALT-A', 1),
  (1, 'F001', 'ALT001-B', 'MPN001-ALT-B', true, 'MPN001-ALT-B', 1);
```

### Test 1.1: Create Session
- [ ] Navigate to home page
- [ ] Click "Create New Session"
- [ ] Fill form: Company, Customer, Panel, Supervisor, Operator, QA, Shift
- [ ] Select the TEST-BOM-ALT
- [ ] Submit form
- [ ] Verify redirected to session page

### Test 1.2: Loading Tab Initial State
- [ ] Tab shows: "📦 LOADING (0 / 4)" - only required feeders counted ✅
- [ ] Splicing tab shows: "✂️ SPLICING (Remaining: 4)" - disabled ✅
- [ ] Splicing button is grayed out ✅
- [ ] Progress bar at 0% ✅
- [ ] Right panel shows only 4 required feeders (F001-F004), not alternates ✅

### Test 1.3: Feeder Scanning - Success Case
- [ ] Input field ready for feeder scan
- [ ] Scan: "F001"
- [ ] System prompts for MPN
- [ ] Enter: "MPN001"
- [ ] Verify message: "✅ VERIFIED (EXACT): Feeder F001 with mpn MPN001 PASSED"
- [ ] Progress updates: "📦 LOADING (1 / 4)" ✅
- [ ] Progress bar advances to 25% ✅
- [ ] F001 in right panel shows ✓ (green checkmark) ✅
- [ ] Splicing tab still disabled ✅

---

## Phase 2: Alternate Component Handling

### Test 2.1: Display Alternates in UI
- [ ] F001 in right panel shows PRIMARY badge
- [ ] Below F001, alternates are visible:
  - [ ] ALT001-A (MPN001-ALT-A)
  - [ ] ALT001-B (MPN001-ALT-B)
- [ ] Alternates styled differently (amber background) ✅
- [ ] Alternates indented with left border ✅

### Test 2.2: Scan with Alternate
- [ ] Scan: "F001"
- [ ] Enter: "MPN001-ALT-A" (one of the alternates)
- [ ] Verify message: "✅ VERIFIED (EXACT): Feeder F001 accepted (using alternate)" ✅
- [ ] Feeder F001 still marked as verified in progress
- [ ] Progress remains: "📦 LOADING (1 / 4)" (count unchanged - same feeder) ✅

### Test 2.3: Duplicate Scan Protection
- [ ] Scan: "F001" again
- [ ] System rejects: "⚠️ Feeder F001 already scanned" ✅
- [ ] Progress unchanged ✅

---

## Phase 3: Validation & Error Handling

### Test 3.1: Wrong MPN
- [ ] Scan: "F002"
- [ ] Enter: "WRONG-MPN"
- [ ] System rejects: "❌ VALIDATION FAILED: ... 0% match does NOT meet 95% threshold"
- [ ] Progress unchanged: "📦 LOADING (1 / 4)" ✅
- [ ] F002 shows ✗ (red X) in right panel ✅

### Test 3.2: Feeder Not Found
- [ ] Scan: "F999"
- [ ] System rejects: "❌ FEEDER NOT FOUND: F999 NOT in BOM"
- [ ] Progress unchanged ✅

### Test 3.3: Fuzzy Matching
- [ ] Scan: "F003"
- [ ] Enter: "MPN003-REV2" (similar but not exact)
- [ ] If fuzzy match >= 95%: ✅ VERIFIED (95% MATCH)
- [ ] If fuzzy match < 95%: ❌ VALIDATION FAILED
- [ ] Verify suggestion provided if near-match ✅

---

## Phase 4: Progress Tracking

### Test 4.1: Multiple Scans
- [ ] Complete F002: Scan "F002", enter "MPN002"
- [ ] Progress: "📦 LOADING (2 / 4)" ✅
- [ ] Complete F003: Scan "F003", enter "MPN003"
- [ ] Progress: "📦 LOADING (3 / 4)" ✅
- [ ] Complete F004: Scan "F004", enter "MPN004"
- [ ] Progress: "📦 LOADING (4 / 4)" ✅
- [ ] Progress bar at 100% ✅

### Test 4.2: Splicing Tab Enabled
- [ ] After 100% verification:
  - [ ] Splicing tab becomes enabled ✅
  - [ ] Button color changes (no longer grayed) ✅
  - [ ] Tooltip removed ✅
  - [ ] Text shows: "✂️ SPLICING (Remaining: 0)" ✅

---

## Phase 5: Splicing Workflow

### Test 5.1: Switch to Splicing Tab
- [ ] Click on Splicing tab
- [ ] Tab content switches to splicing interface ✅
- [ ] Shows input fields: Feeder, Old Spool, New Spool ✅

### Test 5.2: Record Spool Replacement
- [ ] Scan feeder: "F001"
- [ ] Enter old spool barcode: "OLD-SPOOL-001"
- [ ] Enter new spool barcode: "NEW-SPOOL-001"
- [ ] Submit
- [ ] Verify message: "✅ Feeder F001 spool successfully replaced" ✅
- [ ] Splice appears in right panel: "1 SPLICES" with F001 listed ✅

### Test 5.3: Splice Without Prior Verification
- [ ] Switch to Loading tab
- [ ] Scan new feeder (not yet verified): "F005"
- [ ] System rejects: "❌ FEEDER NOT FOUND: F005"
- [ ] Switch to Splicing tab
- [ ] Try to splice F005
- [ ] System rejects: "❌ Feeder F005 has not been verified. Please complete verification before splicing." ✅

---

## Phase 6: Audit Trail & Logging

### Test 6.1: Verify Scan Logs
```sql
SELECT * FROM audit_logs 
WHERE entity_type = 'feeder_scan' 
AND entity_id LIKE '%feeder_F001'
ORDER BY created_at DESC;
```
- [ ] Should have entries for each F001 scan attempt ✅
- [ ] Fields populated: entityType, action, changedBy (operator name), description ✅
- [ ] newValue contains: sessionId, feederNumber, mpnOrInternalId, status, verificationMode ✅

### Test 6.2: Verify Splice Logs
```sql
SELECT * FROM audit_logs 
WHERE entity_type = 'feeder_splice' 
AND entity_id LIKE '%feeder_F001'
ORDER BY created_at DESC;
```
- [ ] Should have entry for F001 splice ✅
- [ ] oldValue contains: old spoolBarcode ✅
- [ ] newValue contains: new spoolBarcode, replacementTime, durationSeconds ✅
- [ ] action = 'splice_recorded' ✅

### Test 6.3: Session History
```sql
SELECT s.*, COUNT(sc.id) as scan_count, COUNT(sp.id) as splice_count
FROM sessions s
LEFT JOIN scan_records sc ON s.id = sc.session_id
LEFT JOIN splice_records sp ON s.id = sp.session_id
WHERE s.id = ?
GROUP BY s.id;
```
- [ ] Session shows complete counts ✅
- [ ] Start time and end time recorded ✅
- [ ] Operator name preserved ✅

---

## Phase 7: Performance Validation

### Test 7.1: Response Time Monitoring
- [ ] Open browser DevTools → Network tab
- [ ] Scan multiple feeders
- [ ] Each scan request to POST /sessions/:id/scans:
  - [ ] Response includes `validationTimeMs` ✅
  - [ ] Response includes `performanceOk: true` if < 200ms ✅
  - [ ] Typical times: 50-100ms (well under 200ms) ✅

### Test 7.2: Database Query Performance
- [ ] Monitor API logs for query times
- [ ] Verify indexed lookups on: sessionId, feederNumber, status ✅
- [ ] Check scan response time with 145+ BOM items (if testing larger BOM) ✅

---

## Phase 8: Session Completion

### Test 8.1: End Session
- [ ] After all verifications and splices complete
- [ ] Click "End Session" button
- [ ] Verify session status changes to "completed" ✅
- [ ] Session shows completion summary: "4/4 feeders verified, 1 splice" ✅
- [ ] Session endTime recorded ✅

### Test 8.2: Report Generation
- [ ] Click "Download Report" or view session summary
- [ ] Report shows:
  - [ ] Session details (company, operator, shift) ✅
  - [ ] Verification summary (X/Y verified) ✅
  - [ ] Splice history ✅
  - [ ] Error history ✅
  - [ ] Duration ✅

---

## Phase 9: Edge Cases

### Test 9.1: Case Conversion
- [ ] Scan: "f001" (lowercase)
- [ ] System accepts and normalizes to "F001" ✅
- [ ] Message shows: "Case was converted" indicator ✅

### Test 9.2: Whitespace Handling
- [ ] Scan: "  F002  " (with spaces)
- [ ] System trims and accepts ✅
- [ ] MPN with spaces: "MPN 002" vs "MPN002" - handles both ✅

### Test 9.3: Missing Required Fields
- [ ] Try to create session without operator name
- [ ] System validates and shows error ✅
- [ ] Try to scan without MPN when BOM requires it
- [ ] System rejects: "MPN REQUIRED" ✅

---

## Phase 10: UI/UX Verification

### Test 10.1: Responsive Design
- [ ] Desktop view (> 1024px): Right panel visible ✅
- [ ] Tablet view (600-1024px): Right panel adapts ✅
- [ ] Mobile view (< 600px): Right panel hidden ✅

### Test 10.2: Visual Feedback
- [ ] Scan success: Green message + sound alert ✅
- [ ] Scan failure: Red message + warning sound ✅
- [ ] Duplicate: Orange message + alert sound ✅
- [ ] Input field autofocus after each action ✅

### Test 10.3: Real-time Updates
- [ ] Progress bar animates on progress change ✅
- [ ] BOM checklist updates in real-time ✅
- [ ] Tab enable/disable state updates immediately ✅

---

## ✅ TEST COMPLETION CHECKLIST

- [ ] Phase 1: Basic Functionality (1.1-1.3)
- [ ] Phase 2: Alternate Components (2.1-2.3)
- [ ] Phase 3: Validation & Errors (3.1-3.3)
- [ ] Phase 4: Progress Tracking (4.1-4.2)
- [ ] Phase 5: Splicing Workflow (5.1-5.3)
- [ ] Phase 6: Audit Trail (6.1-6.3)
- [ ] Phase 7: Performance (7.1-7.2)
- [ ] Phase 8: Session Completion (8.1-8.2)
- [ ] Phase 9: Edge Cases (9.1-9.3)
- [ ] Phase 10: UI/UX (10.1-10.3)

---

## Issue Reporting Template

If issues found, document:
```
Test #: [e.g., 2.1]
Issue: [description]
Steps to reproduce:
  1. [step]
  2. [step]
Expected result: [what should happen]
Actual result: [what happened]
Error message: [if any]
Logs: [relevant console/API logs]
```

---

**Status**: Ready for Testing  
**Total Tests**: 50+  
**Estimated Time**: 1-2 hours  
**Prerequisite**: Database populated with test BOM
