# Feeder Verification System — GitHub Copilot Implementation Prompt
**Version:** 1.0 | **Target Stack:** React + TypeScript + Tailwind CSS  
**Purpose:** Step-by-step Copilot prompt series to build the complete Feeder Verification & Splicing System

---

## SYSTEM OVERVIEW (READ FIRST)

You are building a **Manufacturing Feeder Verification & Splicing System** used on a production floor. Operators use barcode scanners to verify that the correct components (feeders) are loaded before production starts. The system has two major phases:

1. **Feeder Verification** — Operators scan: Feeder Number → Part/MPN → Lot Code (optional)
2. **Splicing** — After 100% verification, operators record spool changeovers: Feeder Number → Old Spool MPN/ID → New Spool MPN/ID

---

## PHASE 1 — PROJECT SETUP & DATA MODELS

### Prompt 1.1 — Project Scaffold

```
Create a new React + TypeScript + Vite project called "feeder-verification-system".

Install dependencies:
- tailwindcss, postcss, autoprefixer
- react-router-dom
- zustand (state management)
- react-hot-toast (notifications)
- lucide-react (icons)
- howler (buzzer/audio feedback)
- framer-motion (animations)

Set up folder structure:
src/
  components/
    ui/           ← reusable UI primitives
    notifications/ ← custom alert components
  pages/
    VerificationPage.tsx
    SplicingPage.tsx
  store/
    useBOMStore.ts
    useVerificationStore.ts
    useLogStore.ts
  types/
    index.ts
  data/
    bom.ts        ← mock BOM data
  hooks/
    useScanner.ts
    useProgress.ts
  utils/
    validation.ts
    audio.ts
```

---

### Prompt 1.2 — Type Definitions

```
In src/types/index.ts, define the following TypeScript interfaces and types:

// A single component option (one entry in BOM)
interface BOMEntry {
  feederId: string;           // e.g. "F01", "F02"
  alternatives: ComponentOption[];  // Array of valid alternatives for this feeder slot
  isOptional?: boolean;
}

// One valid component that can go into a feeder slot
interface ComponentOption {
  mpn: string;          // Manufacturer Part Number
  partId: string;       // Internal Part ID
  description: string;
}

// Scan event recorded for one feeder
interface FeederScan {
  feederId: string;
  mpn: string;
  partId: string;
  lotCode?: string;
  scannedAt: Date;
  status: 'verified' | 'error';
  matchedAlternative: ComponentOption;
}

// Log entry for system log
interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  feederId?: string;
  message: string;
  details?: Record<string, string>;
}

// Splicing record
interface SplicingRecord {
  feederId: string;
  oldSpoolMPN: string;
  newSpoolMPN: string;
  splicedAt: Date;
  verifiedAgainstBOM: boolean;
}

// Notification payload
interface NotificationPayload {
  type: 'success' | 'error' | 'warning' | 'info' | 'alternative';
  title: string;
  message: string;
  autoCloseDuration?: number; // milliseconds, default 3000
  feederId?: string;
}

// Progress calculation result
interface ProgressResult {
  verifiedCount: number;
  totalRequired: number;
  percentage: number;
  remainingFeeders: string[];
  isComplete: boolean;
}

export type {
  BOMEntry, ComponentOption, FeederScan, LogEntry,
  SplicingRecord, NotificationPayload, ProgressResult
};
```

---

### Prompt 1.3 — BOM Mock Data

```
In src/data/bom.ts, create mock BOM data that demonstrates:
- Total of 5 feeder slots required
- Only 2 feeders are PRESENT in the BOM for this job
- Feeder F01 has 2 alternative components (either can be used)
- Feeder F02 has 3 alternative components (any one can be used)

Example structure:

import { BOMEntry } from '../types';

export const BOM_DATA: BOMEntry[] = [
  {
    feederId: "F01",
    alternatives: [
      { mpn: "CAP-100N-0402", partId: "P1001", description: "100nF Capacitor 0402" },
      { mpn: "CAP-100N-0402-ALT", partId: "P1001B", description: "100nF Capacitor 0402 Alt Brand" }
    ]
  },
  {
    feederId: "F02",
    alternatives: [
      { mpn: "RES-10K-0603", partId: "P2001", description: "10K Resistor 0603" },
      { mpn: "RES-10K-0603-ALT1", partId: "P2001B", description: "10K Resistor 0603 Alt 1" },
      { mpn: "RES-10K-0603-ALT2", partId: "P2001C", description: "10K Resistor 0603 Alt 2" }
    ]
  }
];

// Helper: Get BOM entry by feeder ID
export const getBOMEntry = (feederId: string): BOMEntry | undefined =>
  BOM_DATA.find(e => e.feederId.toUpperCase() === feederId.toUpperCase());

// Helper: Validate MPN or PartID against a feeder's alternatives
export const validateComponent = (feederId: string, scannedValue: string): ComponentOption | null => {
  const entry = getBOMEntry(feederId);
  if (!entry) return null;
  return entry.alternatives.find(
    alt =>
      alt.mpn.toUpperCase() === scannedValue.toUpperCase() ||
      alt.partId.toUpperCase() === scannedValue.toUpperCase()
  ) ?? null;
};
```

---

## PHASE 2 — STATE MANAGEMENT (ZUSTAND STORES)

### Prompt 2.1 — Verification Store

```
In src/store/useVerificationStore.ts, create a Zustand store with this logic:

State:
- scannedFeeders: Map<string, FeederScan>  — keyed by feederId, one entry per feeder
- currentStep: 'feederId' | 'mpn' | 'lotCode' | 'complete'
- activeFeederInput: string  — the feeder ID currently being entered
- isVerificationComplete: boolean

Rules to enforce in actions:
1. A feeder can only be scanned ONCE. If the same feederId is submitted again, dispatch an error.
2. After ALL BOM feeders are verified, set isVerificationComplete = true.
3. Progress is calculated as: verifiedCount / totalRequired * 100
   - totalRequired = number of feeders in BOM (not 5, only the 2 present ones)
   - If F01 has alternatives A, B, C and operator scans B → that feeder is verified; don't wait for A or C.

Actions:
- submitFeederId(id: string): validates feeder exists in BOM, checks not already scanned
- submitMPN(value: string): validates against current feeder's alternatives
- submitLotCode(code: string): optional, saves to current scan
- resetCurrentScan(): clears active scan without saving
- resetAll(): clears everything (new job)

Selectors:
- getProgress(): returns ProgressResult
- isFeederAlreadyScanned(feederId: string): boolean
- getScannedList(): FeederScan[]
```

---

### Prompt 2.2 — Log Store

```
In src/store/useLogStore.ts, create a Zustand store:

State:
- logs: LogEntry[]

Actions:
- addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): auto-generates id (uuid) and timestamp
- clearLogs(): empties log array

Log every event:
- Feeder ID scanned (success/fail)
- MPN/Part scanned (success/fail/alternative-used)
- Lot code scanned
- Feeder already scanned (duplicate attempt)
- Feeder not found in BOM
- Verification complete
- Splicing started
- Splicing record saved

The log must show: timestamp, type icon, feeder ID, message, and details.
```

---

## PHASE 3 — SCANNER INPUT HOOK

### Prompt 3.1 — useScanner Hook

```
In src/hooks/useScanner.ts, create a custom React hook for scanner input behavior:

Requirements:
1. The input field is ALWAYS focused (auto-focus on mount, re-focus after any action).
2. For FEEDER NUMBER field:
   - Auto-submit after detecting a valid barcode scan (scanner sends data + Enter key).
   - No manual Enter button needed — the scan fires Enter automatically.
   - BUT if the field value is empty and Enter is pressed, do nothing.
   - If value changes and doesn't match expected format, show inline error.
3. For MPN/PART field:
   - Same auto-submit behavior on Enter.
4. For LOT CODE field:
   - Optional — has a "Skip" button AND auto-submits on Enter.
5. After a successful or failed scan:
   - Show notification (3 seconds auto-close).
   - On success: green notification, proceed to next field.
   - On error: red notification + play buzzer sound.
   - After notification closes (or after 10 seconds if error), automatically re-focus input.
6. After clicking any notification action button, the input regains focus.

Hook signature:
useScanner(options: {
  onSubmit: (value: string) => void;
  onError?: (value: string) => void;
  autoFocus?: boolean;
  resetAfterMs?: number;  // ms to auto-clear field after error, default 10000
})

Returns: { inputRef, value, setValue, handleKeyDown, reset }
```

---

## PHASE 4 — NOTIFICATION SYSTEM

### Prompt 4.1 — Custom Notification Component

```
In src/components/notifications/ScanNotification.tsx, build a custom notification component.

Design requirements (DO NOT use generic toast libraries for the visual):
- Positioned: top-right corner, fixed, z-index 9999
- Size: 320px wide, auto height
- Has a colored LEFT BORDER (4px) indicating status:
  - Success: #22c55e (green)
  - Error: #ef4444 (red)
  - Warning/Alternative: #f59e0b (amber)
  - Info: #3b82f6 (blue)
- Contains:
  - Icon (checkmark / X / warning triangle / info circle) — large, 28px
  - Title (bold, 15px)
  - Message body (13px, muted)
  - Optional: "Details" expandable section showing feeder ID, MPN, alternative used
  - Progress bar at bottom that depletes over auto-close duration
  - Close button (X) in top-right corner
- Animations:
  - Slides in from the right on mount (framer-motion)
  - Slides out to the right on dismiss
  - Multiple notifications stack vertically with 8px gap

For ALTERNATIVE COMPONENT notification specifically:
- Use amber/warning color
- Title: "⚠ Alternative Component Detected"
- Show: which feeder, which MPN was scanned, which alternative it matched
- Body text: "This is a registered alternative. Verification will proceed."
- Auto-close: 4 seconds (slightly longer)

Props:
interface ScanNotificationProps {
  notifications: NotificationPayload[];
  onDismiss: (index: number) => void;
}

Manage the notification queue in a useNotificationStore (zustand) with:
- push(payload: NotificationPayload)
- dismiss(id: string)
- Auto-dismiss after payload.autoCloseDuration ms
```

---

## PHASE 5 — VERIFICATION PAGE

### Prompt 5.1 — Page Layout & Design

```
In src/pages/VerificationPage.tsx, build the main verification page.

DESIGN AESTHETIC:
- Dark industrial theme: background #0f1117, card surfaces #1a1d27
- Accent color: #00d4aa (teal/mint) for active states and progress
- Error color: #ff4757
- Font: "JetBrains Mono" for scan inputs (monospace, scanner feel), "Inter" for labels
- Compact, information-dense layout — this is used on a factory floor monitor

PAGE LAYOUT (responsive, works on 1080p monitor and tablets):
┌─────────────────────────────────────────────────────┐
│  HEADER: Job ID | Date/Time | Status Badge           │
├─────────────────────────────────────────────────────┤
│  LEFT PANEL (60%)         │  RIGHT PANEL (40%)       │
│  ┌─────────────────────┐  │  ┌───────────────────┐  │
│  │  ACTIVE SCAN CARD   │  │  │  PROGRESS PANEL   │  │
│  │  Step indicator     │  │  │  Circular: XX%    │  │
│  │  [Feeder ID input]  │  │  │  F01 ✓ / F02 ✗   │  │
│  │  [MPN input]        │  │  │  Remaining list   │  │
│  │  [Lot Code input]   │  │  └───────────────────┘  │
│  └─────────────────────┘  │  ┌───────────────────┐  │
│                            │  │  LOG PANEL        │  │
│  SCANNED FEEDERS TABLE     │  │  (scrollable)     │  │
│  (live, updates per scan)  │  │                   │  │
│                            │  └───────────────────┘  │
└─────────────────────────────────────────────────────┘

ACTIVE SCAN CARD:
- Shows 3 steps: [1. Feeder ID] → [2. MPN/Part] → [3. Lot Code]
- Active step is highlighted; completed steps show checkmark
- Input field is large (font-size 24px), monospace, with a blinking cursor
- Label above input: "SCAN FEEDER NUMBER" / "SCAN MPN OR PART ID" / "SCAN LOT CODE (optional)"
- Under input: helper text showing expected format or "Press Enter to skip" for lot code
- Input border glows teal on focus, red on error (CSS box-shadow animation)

PROGRESS PANEL:
- Circular progress ring (SVG, animated) showing percentage
- Below ring: "2 / 2 Feeders Verified" or "1 / 2 Feeders Verified"
- Feeder status list: each feeder shows ID + status dot (green verified, gray pending)
- If feeder has alternatives, show small badge "ALT ACCEPTED" when an alternative was scanned

SCANNED FEEDERS TABLE:
- Columns: Feeder ID | MPN/Part | Lot Code | Time | Status
- Rows animate in from bottom when added (framer-motion)
- Status: green "VERIFIED" badge or red "ERROR" badge
- Table scrolls if content exceeds height; height is capped, NOT stretched

LOG PANEL:
- Compact log entries: [TIME] [TYPE ICON] [MESSAGE]
- Color-coded by type
- Max 100 entries, auto-scroll to bottom
- "Clear" button at top
```

---

### Prompt 5.2 — Scan Input Flow Logic

```
In VerificationPage.tsx, implement the 3-step scan flow:

STEP 1 — FEEDER ID:
- Input auto-focused on page load
- On Enter (or scanner fires Enter):
  a. Trim and uppercase the value
  b. Call store.submitFeederId(value)
  c. If NOT in BOM → show error notification + buzzer → clear input after 10s → re-focus
  d. If ALREADY SCANNED → show "Duplicate Scan" error notification + buzzer → clear after 10s
  e. If valid → show brief "Feeder Found" info notification → advance to Step 2

STEP 2 — MPN / PART ID:
- Input auto-focused immediately
- On Enter:
  a. Trim and uppercase
  b. Call store.submitMPN(value)
  c. If NOT matching any alternative → error notification + buzzer → clear after 10s → re-focus
  d. If matches EXACT primary → green success notification
  e. If matches an ALTERNATIVE → amber "Alternative Detected" notification (4s)
  f. Either (d) or (e) → advance to Step 3

STEP 3 — LOT CODE (Optional):
- Input auto-focused
- "SKIP" button visible
- On Enter OR Skip:
  a. Save lot code if provided
  b. Finalize FeederScan record → add to store
  c. Log the scan
  d. Show final "Feeder F0X Verified ✓" success notification
  e. Reset to Step 1 for next feeder

WHEN ALL FEEDERS VERIFIED (progress = 100%):
- Show a full-screen overlay/modal: "✓ ALL FEEDERS VERIFIED — Proceeding to Splicing"
- After 2 seconds OR on button click → navigate to /splicing using react-router
```

---

## PHASE 6 — SPLICING PAGE

### Prompt 6.1 — Splicing Page

```
In src/pages/SplicingPage.tsx, build the splicing page.

This page is only accessible after verification is 100% complete.
If user navigates here directly without completing verification, redirect to /verification.

PAGE DESIGN:
- Same dark industrial theme as Verification Page
- Header: "SPLICING STATION" | Job ID | Back button

SPLICING FORM LAYOUT:
┌────────────────────────────────────┐
│  SPLICING RECORD ENTRY             │
│                                    │
│  Step 1: [FEEDER NUMBER input]     │
│  Step 2: [OLD SPOOL MPN/ID input]  │
│  Step 3: [NEW SPOOL MPN/ID input]  │
│                                    │
│  [ CONFIRM & SAVE ]                │
└────────────────────────────────────┘

BELOW: Saved splicing records table
Columns: Feeder ID | Old Spool | New Spool | Time | BOM Match Status

VALIDATION RULES:
1. Feeder Number must exist in the verified BOM
2. Old Spool MPN must match the component that was verified for that feeder
   (it must match one of the feeder's alternatives from BOM)
3. New Spool MPN must ALSO match one of the feeder's alternatives from BOM
   (you can only splice to a compatible component)
4. All three fields required — no skipping
5. If any field fails → error notification + buzzer

FLOW:
- Same scanner-style auto-submit on Enter
- Same notification system as verification page
- On successful save → green notification → clear all three fields → re-focus feeder input
- All splicing records saved in useSplicingStore (zustand) and logged in useLogStore
```

---

## PHASE 7 — AUDIO & FEEDBACK

### Prompt 7.1 — Audio Utility

```
In src/utils/audio.ts, create audio feedback utilities using the Web Audio API (no external files needed):

// Generates tones programmatically — no audio files required

export const playSuccessBeep = () => {
  // Short double-beep, high pitch (880Hz), 150ms each, pleasant
}

export const playErrorBuzzer = () => {
  // Harsh buzzer sound, low pitch (180Hz), long duration (600ms), distorted feel
  // Should feel alarming — this is a factory floor error signal
}

export const playWarningTone = () => {
  // Medium pitch (550Hz), single beep, 300ms — for alternative component alerts
}

All functions use the AudioContext API. Create the context lazily (on first call).
Handle autoplay policy: wrap in try/catch, log warning if audio is blocked.
Export a single `playFeedback(type: 'success' | 'error' | 'warning')` function as default.
```

---

## PHASE 8 — ROUTING & APP SHELL

### Prompt 8.1 — App Router & Shell

```
In src/App.tsx, set up routing with react-router-dom v6:

Routes:
- "/" → redirect to "/verification"
- "/verification" → <VerificationPage />
- "/splicing" → <SplicingPage /> (guarded: redirect to /verification if not complete)

App Shell (persistent across routes):
- Top navbar: Logo/System name ("FVS — Feeder Verification System") | Clock (live, updates every second) | Job ID badge
- Bottom status bar: Current operator mode | Last action timestamp | BOM loaded indicator

In src/store/useVerificationStore.ts, add a guard:
- Export a selector `useIsVerificationComplete()` 
- SplicingPage uses this to redirect if false

Navigation between pages:
- Verification page: when 100% complete, auto-navigates after 2-second overlay
- Splicing page: has "← Back to Verification" button (only visible if verification is NOT locked)
```

---

## PHASE 9 — LOG VIEWER

### Prompt 9.1 — Log Panel Component

```
In src/components/LogPanel.tsx:

Build a compact, scrollable log panel component.

Each log entry row:
- Timestamp (HH:MM:SS format, monospace)
- Type icon: ✓ (success, green) | ✗ (error, red) | ⚠ (warning, amber) | ℹ (info, blue)
- Feeder ID badge (if applicable) — pill-shaped, teal background
- Message text

Log Panel features:
- Fixed height container (e.g. 280px), overflow-y: auto, custom scrollbar styled dark
- New entries appear at BOTTOM with a subtle fade-in animation
- "CLEAR LOG" button top-right (with confirmation: single click shows "Confirm?" then second click clears)
- "EXPORT LOG" button: downloads log as JSON file with timestamp in filename
- If log is empty: show "No events recorded yet" centered placeholder

The component accepts logs from useLogStore via zustand selector.
```

---

## PHASE 10 — RESPONSIVE LAYOUT

### Prompt 10.1 — Responsive Behavior

```
Ensure the following responsive behavior throughout the application:

1. All table/list containers use overflow-x: auto — never stretch the page width
2. The Active Scan Card maintains a minimum width of 320px, maximum 600px
3. On screens < 768px (tablets on factory floor):
   - Stack left and right panels vertically
   - Progress panel moves above the scan card
   - Log panel collapses to a toggle-able drawer from the bottom
4. Input fields: font-size minimum 18px on mobile (prevents iOS zoom)
5. Notification stack: on small screens, notifications appear at TOP CENTER instead of top-right
6. Tables: on small screens, show only essential columns (Feeder ID, Status, Time); hide MPN column with a "Show More" toggle
7. No horizontal scroll on any viewport
8. Test at: 1920×1080 (control room monitor), 1280×800 (operator station), 768×1024 (tablet)
```

---

## PHASE 11 — FINAL INTEGRATION & POLISH

### Prompt 11.1 — Integration Checklist

```
Perform a final integration pass:

1. Ensure every user action produces a log entry (check all store actions call useLogStore.addLog)
2. Ensure every error plays the buzzer sound
3. Ensure every success plays the success beep
4. Ensure every alternative-component detection plays the warning tone
5. Ensure all inputs auto-re-focus after notifications close or after 10 seconds
6. Ensure the "one scan per feeder" rule is enforced — duplicate feeders show error
7. Ensure progress calculation uses ACTUAL BOM length (2 feeders), not total component count (5)
8. Ensure splicing page is unreachable if verification < 100%
9. Ensure all three splicing fields validate against BOM before saving
10. Add a "Reset Session" button in the header that:
    - Shows a confirmation modal
    - On confirm: clears all stores, navigates to /verification, logs "Session Reset"
```

---

### Prompt 11.2 — UI Micro-Polish

```
Add these final UI polish details:

1. Progress ring: animate from 0 to current value on page load (framer-motion spring animation)
2. When a feeder is verified in the progress panel list, animate: gray dot → spinning → green checkmark
3. Scan input has a subtle "scanning" animation: a moving gradient line at the bottom of the input when waiting for scan
4. The "ALL VERIFIED" overlay uses a confetti-like particle animation (CSS only, 20 particles) before navigating
5. Error state: entire Active Scan Card border flashes red twice (CSS keyframe animation)
6. Log entries: highlight the most recent entry with a brighter background that fades out after 2s
7. Page title updates dynamically: "FVS | Verifying... (1/2)" or "FVS | Splicing"
8. Add a subtle grid/dot pattern to the dark background for industrial texture
```

---

## APPENDIX A — COMPONENT DECISION TREE (VERIFICATION LOGIC)

```
For feeder F01 with alternatives [A, B, C]:
- Operator scans B
- System finds B in F01's alternatives → MATCH
- F01 is marked VERIFIED
- Progress: F01 ✓ (system does NOT wait for A or C)
- Log: "F01 verified with alternative component B (P1001B)"

Progress formula:
  verifiedCount = number of BOM feeders that have at least one scan saved
  totalRequired = BOM_DATA.length  ← NOT the total 5, just the BOM feeders present (2)
  percentage = (verifiedCount / totalRequired) * 100

Complete = percentage === 100
```

---

## APPENDIX B — NOTIFICATION TIMING REFERENCE

| Event | Type | Auto-Close | Re-focus After |
|---|---|---|---|
| Feeder found in BOM | Info | 1.5s | Immediately |
| Feeder NOT in BOM | Error | 3s + buzzer | 10s after error |
| Duplicate feeder scan | Error | 3s + buzzer | 10s after error |
| MPN/Part matched (exact) | Success | 3s | Immediately |
| MPN/Part matched (alternative) | Warning | 4s | Immediately |
| MPN/Part NOT matched | Error | 3s + buzzer | 10s after error |
| Feeder fully verified | Success | 3s | Immediately |
| All feeders verified (100%) | Success | 2s → navigate | — |
| Splicing record saved | Success | 3s | Immediately |
| Splicing validation failed | Error | 3s + buzzer | 10s after error |

---

## APPENDIX C — LOG ENTRY EXAMPLES

```json
{ "type": "info",    "feederId": "F01", "message": "Feeder F01 found in BOM. Awaiting component scan." }
{ "type": "success", "feederId": "F01", "message": "F01 verified: MPN CAP-100N-0402-ALT matched as alternative." }
{ "type": "error",   "feederId": "F99", "message": "Feeder F99 not found in BOM. Scan rejected." }
{ "type": "error",   "feederId": "F01", "message": "Duplicate scan attempt for F01. Already verified." }
{ "type": "warning", "feederId": "F02", "message": "F02: Alternative component RES-10K-0603-ALT1 accepted." }
{ "type": "success",                    "message": "All 2/2 feeders verified. Verification complete. Navigating to Splicing." }
{ "type": "success", "feederId": "F01", "message": "Splicing recorded: OLD=CAP-100N-0402 → NEW=CAP-100N-0402-ALT. BOM validated." }
```

---

*End of Copilot Implementation Prompt — Feeder Verification System v1.0*
