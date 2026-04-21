# Phase 2 & 3 Integration Instructions

## Frontend Dashboard Page - Created ✅

**File Created:** `artifacts/feeder-scanner/src/pages/real-time-dashboard.tsx`

### Features Implemented

✅ 7 KPI Cards (Pass Rate, Passes, Defect Rate, Mismatches, Avg Scan Time, Total Scans, Alternate Passes)
✅ 4 Interactive Charts:

- Validation Results Pie Chart (Pass/Mismatch/Alternate)
- Top Feeder Defects Bar Chart
- Hourly Trends Line Chart (24-hour timeline)
- Top Component Defects Bar Chart

✅ 3 Tabbed Detail Sections:

- Verification Records Table (50 most recent)
- Alarm Panel (severity levels: critical/warning/info)
- Operator Performance Metrics

✅ Session Selector Dropdown
✅ Real-time Polling (2-second refetch when session active)
✅ Session Efficiency Footer (Status, Duration, Throughput, Efficiency %)
✅ Dark Mode Support with Tailwind CSS
✅ Responsive Grid Layout (mobile, tablet, desktop)

---

## Navigation Integration - Step-by-step

**File:** `artifacts/feeder-scanner/src/components/layout.tsx`

### Step 1: Add icon import (line 2)

Change from:

```typescript
import { LayoutDashboard, Boxes, History, PlusSquare, BarChart3, LogOut, Sun, Moon, Menu, X, Trash2 } from "lucide-react";
```

To:

```typescript
import { LayoutDashboard, Boxes, History, PlusSquare, BarChart3, LogOut, Sun, Moon, Menu, X, Trash2, TrendingUp } from "lucide-react";
```

### Step 2: Add Real-Time Dashboard nav item (line ~17, in NAV_ITEMS array)

After the Analytics line, add:

```typescript
    { href: "/real-time-dashboard", label: "Real-Time Dashboard", icon: TrendingUp, roles: ["engineer", "qa"] },
```

**Complete NAV_ITEMS array:**

```typescript
  const NAV_ITEMS = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["engineer", "qa", "operator"] },
    { href: "/session/new", label: "New Session", icon: PlusSquare, roles: ["engineer", "operator"] },
    { href: "/bom", label: "BOM Manager", icon: Boxes, roles: ["engineer"] },
    { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["engineer", "qa"] },
    { href: "/real-time-dashboard", label: "Real-Time Dashboard", icon: TrendingUp, roles: ["engineer", "qa"] },
    { href: "/sessions", label: "Session History", icon: History, roles: ["engineer", "qa", "operator"] },
    { href: "/trash", label: "Trash Bin", icon: Trash2, roles: ["engineer"] },
  ];
```

### Step 3: Register route (file routing)

Depending on your routing setup, register route for `/real-time-dashboard` pointing to the new dashboard page.

---

## Real-Time Dashboard Polling Strategy

**Implemented:**

- All 8 queries use conditional `refetchInterval`
- When sessionId is selected: `refetchInterval: 2000` (2 seconds) - ACTIVE
- When no sessionId: `refetchInterval: false` - DISABLED
- `staleTime: 0` - Data immediately considered stale
- All queries fetch independently with separate cache keys

**Performance:**

- Non-blocking queries (each has independent loading state)
- Minimal CPU impact with 2-second interval
- Graceful fallback if API unavailable
- Session selector triggers all queries to reset cache

---

## Dashboard Endpoints Summary

All endpoints require integration via Phase 1 (dashboard.ts import in routes/index.ts):

| Endpoint | Method | Query Param | Response Fields |
|----------|--------|-------------|-----------------|
| /dashboard/kpi | GET | sessionId | totalScans, passRate, defectRate, avgCycleTime, uniqueOperators |
| /dashboard/verification | GET | sessionId, limit | records[], total, returned |
| /dashboard/alarms | GET | sessionId | alarms[], totalMismatches, activeAlarms |
| /dashboard/operator | GET | sessionId | operators[], totalOperators |
| /dashboard/time-analysis | GET | sessionId | timeline[] (hourly) |
| /dashboard/feeder-analysis | GET | sessionId | feeders[], totalFeeders, problematicFeeders |
| /dashboard/component-analysis | GET | sessionId | components[], totalComponentTypes, problematicComponents |
| /dashboard/traceability/:panelId | GET | - | panelId, totalComponents, components[] |
| /dashboard/efficiency | GET | sessionId | sessionStatus, totalDurationMinutes, throughput, efficiency |

---

## Next Steps: Phase 4-7

### Phase 4: Database Indexes

- Verify indexes on: `(sessionId, validationResult)`, `(scannedAt)`, `(feederNumber)`
- Run SQL if missing:

```sql
CREATE INDEX IF NOT EXISTS idx_scan_records_session_validation 
  ON scan_records(session_id, validation_result);
CREATE INDEX IF NOT EXISTS idx_scan_records_scanned_at 
  ON scan_records(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_records_feeder 
  ON scan_records(feeder_number);
```

### Phase 5: React Query Integration

- Already implemented with conditional refetchInterval
- Session selector triggers cache invalidation
- All queries independent with separate keys

### Phase 6: Security Testing

- Backend: Verify/add middleware to check user role (QA/Engineer only)
- Frontend: Navigation automatically hidden from operators (role filter)
- Test endpoints with unauthorized user (expect 403)

### Phase 7: Git Commit

- Add real-time-dashboard.tsx
- Update layout.tsx with nav item
- Add dashboard.ts endpoint import to routes/index.ts
- Commit message: "feat: Add industrial-grade real-time analytics dashboard with KPIs, charts, and operator metrics"

---

## Testing Checklist

- [ ] Backend: All 9 endpoints return data with correct schema
- [ ] Frontend: Dashboard loads without errors
- [ ] Charts: Display correct data (pie 3-way split, bar charts sorted)
- [ ] Tables: Pagination works, formatting correct
- [ ] Real-time: Metrics update every 2 seconds when session active
- [ ] Session Selector: Changes all queries (reflected in tabs)
- [ ] Navigation: Link visible only to engineer/qa roles
- [ ] Dark Mode: All components display correctly
- [ ] Responsive: Works on mobile (test with DevTools)
- [ ] Security: Operator user cannot access /real-time-dashboard (redirect or 403)
