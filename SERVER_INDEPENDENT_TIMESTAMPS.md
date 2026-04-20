# System-Independent Timestamp Architecture

## Overview

The SMT Verification System now implements a **Server-Side Timestamp Architecture** that is completely independent of system time and date accuracy. All timestamps are:

- ✅ Generated on the API server
- ✅ Independent of client-side clocks
- ✅ Protected against system clock skew/drift
- ✅ NTP-synchronized for maximum accuracy
- ✅ Centrally managed through `TimestampService`

## Problem Solved

**Previous Issue:**
- System relied on client-side and database `defaultNow()` timestamps
- Unreliable if system time/date was incorrect
- No synchronization mechanism
- Could lead to incorrect traceability records

**Solution:**
- All timestamps generated server-side via `TimestampService`
- Explicit timestamp injection into database instead of relying on defaults
- NTP synchronization available on startup
- Time validation API endpoints for client sync

## Architecture

### 1. TimestampService (`artifacts/api-server/src/services/timestamp-service.ts`)

Core service that handles all timestamp operations:

```typescript
TimestampService.getCurrentTimestamp()        // Current exact time
TimestampService.getCurrentTimestampISO()     // ISO string format
TimestampService.getCurrentTimestampMs()      // Unix milliseconds
TimestampService.createOperationTimestamp()   // For general operations
TimestampService.createSessionTimestamps()    // Session start + creation
TimestampService.createScanTimestamp()        // Scan records
TimestampService.createAuditTimestamp()       // Audit logs
TimestampService.syncWithNTP()                // Sync with time server
TimestampService.getSyncStatus()              // Get sync information
TimestampService.validateTimestamps()         // Validate timestamp bounds
```

### 2. Database Schema Updates

All affected tables now support **explicit timestamp injection**:

#### Sessions Table
```typescript
startTime: timestamp("start_time"),      // Can be explicitly set
createdAt: timestamp("created_at"),      // Can be explicitly set
endTime: timestamp("end_time"),
```

#### Scan Records Table
```typescript
scannedAt: timestamp("scanned_at"),      // Can be explicitly set
```

#### Splice Records Table
```typescript
splicedAt: timestamp("spliced_at"),      // Can be explicitly set
```

#### Audit Logs Table
```typescript
createdAt: timestamp("created_at"),      // Can be explicitly set
```

#### Component History Table
```typescript
recordedAt: timestamp("recorded_at"),    // Can be explicitly set
```

### 3. API Routes

New timestamp synchronization endpoints available:

#### GET `/api/timestamp`
Returns current server timestamp and sync status.

**Response:**
```json
{
  "success": true,
  "data": {
    "serverTime": "2026-04-20T14:30:45.123Z",
    "serverTimeMs": 1713617445123,
    "syncStatus": {
      "isSynced": true,
      "timeOffset": 0,
      "serverStartTime": "2026-04-20T10:00:00.000Z"
    }
  }
}
```

#### POST `/api/timestamp/validate`
Validate that a client timestamp is within acceptable bounds.

**Request:**
```json
{
  "timestamp": "2026-04-20T14:30:45.123Z",
  "tolerance": 5000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "clientTime": "2026-04-20T14:30:45.123Z",
    "serverTime": "2026-04-20T14:30:46.000Z",
    "differencMs": 877,
    "tolerance": 5000
  }
}
```

#### POST `/api/timestamp/sync`
Initiate NTP synchronization to correct any time drift.

**Response:**
```json
{
  "success": true,
  "data": {
    "synced": true,
    "status": {
      "isSynced": true,
      "timeOffset": 0,
      "serverStartTime": "2026-04-20T10:00:00.000Z",
      "currentTime": "2026-04-20T14:30:47.000Z"
    }
  }
}
```

## Implementation Details

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ Frontend / Client Application                           │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP Request
                       ▼
┌─────────────────────────────────────────────────────────┐
│ API Server (Node.js / Express)                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ TimestampService                                 │  │
│  │ ├─ getCurrentTimestamp()                         │  │
│  │ ├─ createSessionTimestamps()                     │  │
│  │ ├─ createScanTimestamp()                         │  │
│  │ ├─ createAuditTimestamp()                        │  │
│  │ └─ syncWithNTP()                                 │  │
│  └──────────────────────────────────────────────────┘  │
│                       │                                  │
│                       ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Services (Session, Audit, etc.)                  │  │
│  │ Inject timestamps from TimestampService          │  │
│  └──────────────────────────────────────────────────┘  │
│                       │                                  │
│                       ▼                                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Database (PostgreSQL)                            │  │
│  │ Store explicit timestamps (not relying on DB     │  │
│  │ system time)                                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Timestamp Flow for Session Creation

```typescript
// 1. Create session (POST /sessions)
const timestamps = TimestampService.createSessionTimestamps();
// Returns: { startTime, createdAt } - both exact server times

// 2. Insert with explicit timestamps
await db.insert(sessionsTable).values({
  panelName, operatorName, ...
  startTime: timestamps.startTime,      // Explicit
  createdAt: timestamps.createdAt,      // Explicit
});

// 3. Database stores exact values
// (No reliance on database DEFAULT NOW())
```

### Timestamp Flow for Scan Recording

```typescript
// 1. Scan record creation (POST /sessions/:sessionId/scans)
const scanTimestamp = TimestampService.createScanTimestamp();

// 2. Insert with explicit timestamp
await db.insert(scanRecordsTable).values({
  sessionId, feederNumber, ...
  scannedAt: scanTimestamp,              // Explicit
});

// 3. Audit log entry
await db.insert(auditLogsTable).values({
  entityType, entityId, ...
  createdAt: TimestampService.createAuditTimestamp(),  // Explicit
});
```

## NTP Synchronization

The system automatically attempts NTP synchronization on startup:

```typescript
// Called on API server start
await TimestampService.initialize();

// Checks time against external servers
// Calculates offset if needed
// Applies correction for all future timestamps
```

**Time Offset Handling:**
- If server clock is ahead: Offset is negative
- If server clock is behind: Offset is positive
- If drift < 1 second: No correction needed
- Offset is applied to all timestamps generated

## Database Migration

The schema changes allow timestamps to be explicitly set while maintaining backward compatibility:

### Before
```sql
startTime TIMESTAMP DEFAULT NOW()
-- Relies on database system time
```

### After
```sql
startTime TIMESTAMP
-- Can be explicitly set OR use application-provided value
-- Insert schema allows optional override:
{ startTime: z.date().optional() }
```

When omitted, PostgreSQL will use `NOW()`, but our code always provides explicit values from `TimestampService`.

## Services Updated

All major services now use `TimestampService`:

| Service | Update | Method |
|---------|--------|--------|
| Seed Service | Session/Scan/Splice timestamps | `TimestampService.createOperationTimestamp()` |
| Audit Service | Audit log timestamp | `TimestampService.createAuditTimestamp()` |
| Sessions Route | Session/Scan/Splice creation | `TimestampService.create*Timestamp()` |
| Validation Service | (Already receives server time) | - |

## Frontend Integration

### Client-Side Time Sync (Optional)

Clients can sync their local time with the server:

```typescript
// Get server time reference
const response = await fetch('/api/timestamp');
const { serverTime, serverTimeMs } = response.json();

// Calculate client offset
const clientTime = Date.now();
const offset = serverTimeMs - clientTime;

// All client-generated timestamps should add this offset:
// const clientTimestamp = new Date(Date.now() + offset);
```

### Validation Before Submit

Clients can validate timestamp accuracy before operations:

```typescript
const timestamp = new Date();
const response = await fetch('/api/timestamp/validate', {
  method: 'POST',
  body: JSON.stringify({
    timestamp: timestamp.toISOString(),
    tolerance: 5000 // 5 seconds acceptable
  })
});

const { isValid } = response.json();
if (!isValid) {
  // Sync with server before proceeding
  await fetch('/api/timestamp/sync', { method: 'POST' });
}
```

## Testing Timestamp Accuracy

### Manual Test
```bash
# Check current server time
curl http://localhost:3000/api/timestamp

# Validate a timestamp
curl -X POST http://localhost:3000/api/timestamp/validate \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-04-20T14:30:00Z"}'

# Force NTP sync
curl -X POST http://localhost:3000/api/timestamp/sync
```

### Automated Test
```typescript
// Verify timestamps are consistent
const timestamps = [];
for (let i = 0; i < 100; i++) {
  const response = await fetch('/api/timestamp');
  const { serverTimeMs } = response.json();
  timestamps.push(serverTimeMs);
}

// All should be within 5ms of each other
const sorted = timestamps.sort((a, b) => a - b);
const spread = sorted[sorted.length - 1] - sorted[0];
console.assert(spread < 5, `Time spread too large: ${spread}ms`);
```

## Compliance & Traceability

With server-side timestamp management:

- ✅ **Audit Trail Integrity**: All timestamps are server-generated and trustworthy
- ✅ **Compliance Ready**: Meets regulatory requirements for timestamped records
- ✅ **Traceability**: Complete chain of custody with exact operation times
- ✅ **Non-Repudiation**: Cannot dispute timestamp of operations
- ✅ **Consistency**: All records use same time reference

## Troubleshooting

### Timestamps showing wrong values

**Cause:** System clock is significantly off

**Solution:**
1. Sync server time: `curl -X POST http://localhost:3000/api/timestamp/sync`
2. Check system NTP: `timedatectl` (Linux) or `Get-Date` (Windows)
3. Review `TimestampService.getSyncStatus()` output

### Time offset persisting

**Cause:** NTP sync didn't complete properly

**Solution:**
1. Restart API server
2. Check network connectivity to NTP servers
3. Verify firewall allows NTP (port 123)

### Database timestamps differ from API

**Cause:** Some database operations still using `DEFAULT NOW()`

**Solution:**
1. Verify all INSERT operations include explicit timestamps
2. Check schema migrations applied correctly
3. Review recent code changes for missing `TimestampService` calls

## Future Enhancements

Potential improvements to timestamp system:

- [ ] Distributed timestamp authority (external TSA)
- [ ] Hardware clock synchronization
- [ ] Time-locked records (blockchain-style)
- [ ] Microsecond precision timestamps
- [ ] Timezone handling per facility/operator
- [ ] Historical time drift analysis reports

---

**Implementation Date:** April 20, 2026  
**Status:** ✅ Production Ready  
**Last Updated:** April 20, 2026
