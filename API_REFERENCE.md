# SMT MES System - Complete API Reference

Generated: April 9, 2026

---

## 🌐 API Base URL
```
http://localhost:3000/api
```

---

## 📊 Complete Endpoint Reference

### **Test Endpoints** (Phase 7)
| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| POST | `/test/seed` | Generate sample data | `{ success, recordsCreated }` |
| GET | `/test/seed-quick` | Quick seed (~100 records) | `{ success, recordsCreated, message }` |
| GET | `/test/stats` | Database statistics | `{ timestamp, stats, total }` |
| POST | `/test/clear` | Clear all data (destructive) | `{ success, message }` |

---

### **Audit Endpoints** (Phase 6)
| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| POST | `/audit/log` | Record audit entry | `{ success, log }` |
| GET | `/audit/logs/:entityType/:entityId` | Get entity audit logs | `{ entityType, entityId, count, logs }` |
| GET | `/audit/changes/:entityType/:entityId` | Get change history | `{ entityType, entityId, changes, totalChanges }` |
| GET | `/audit/diff/:entityType/:entityId` | Get entity diffs | `{ entityType, entityId, diffs, totalChanges }` |
| GET | `/audit/user/:userId` | Get user actions | `{ userId, count, limit, logs }` |
| GET | `/audit/action/:action` | Get logs by action | `{ action, count, limit, logs }` |
| GET | `/audit/range` | Get logs by date range | `{ startDate, endDate, count, logs }` |

---

### **Traceability Endpoints** (Phase 6 - Extended from Phase 4)
| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| GET | `/traceability/reel/:reelId` | Find scans by reel | `{ reelId, count, scans }` |
| GET | `/traceability/lot/:lotNumber` | Find scans by lot | `{ lotNumber, count, scans }` |
| GET | `/traceability/date-code/:dateCode` | Find scans by date code | `{ dateCode, count, scans }` |
| GET | `/traceability/session/:sessionId/trace` | Get full session trace | `{ sessionId, count, trace }` |
| GET | `/traceability/sessions-for-reel/:reelId` | Get sessions for reel | `{ reelId, count, sessions }` |
| GET | `/traceability/sessions-for-lot/:lotNumber` | Get sessions for lot | `{ lotNumber, count, sessions }` |
| GET | `/traceability/alternate-usage` | Alternate usage report | `{ count, limit, report }` |

---

## 🔗 Request/Response Examples

### Phase 7: Test Endpoints

#### Seed Database
```bash
Request:
POST /api/test/seed
Content-Type: application/json
{
  "companiesCount": 3,
  "bomsPerCompany": 2,
  "feedersPerBom": 15,
  "componentsPerBom": 12,
  "alternatesPerComponent": 2,
  "sessionsPerBom": 3,
  "scansPerSession": 20
}

Response:
{
  "success": true,
  "recordsCreated": 2847
}
```

#### Get Database Stats
```bash
Request:
GET /api/test/stats

Response:
{
  "timestamp": "2026-04-09T14:35:22.123Z",
  "stats": {
    "boms": 6,
    "components": 48,
    "componentAlternates": 96,
    "feeders": 90,
    "bomItems": 48,
    "sessions": 18,
    "scans": 360,
    "splices": 45,
    "auditLogs": 2160
  },
  "total": 2871
}
```

---

### Phase 6: Audit Endpoints

#### Record Audit Log
```bash
Request:
POST /api/audit/log
Content-Type: application/json
{
  "entityType": "component",
  "entityId": "COMP-12345",
  "action": "update",
  "oldValue": {
    "mpn": "OLD-MPN-123",
    "status": "inactive"
  },
  "newValue": {
    "mpn": "NEW-MPN-456",
    "status": "active"
  },
  "changedBy": "john.doe@ucal.com",
  "description": "Updated MPN and activated component"
}

Response:
{
  "success": true,
  "log": {
    "id": 42,
    "entityType": "component",
    "entityId": "COMP-12345",
    "action": "update",
    "oldValue": "{...}",
    "newValue": "{...}",
    "changedBy": "john.doe@ucal.com",
    "description": "Updated MPN and activated component",
    "createdAt": "2026-04-09T14:35:22.456Z"
  }
}
```

#### Get Audit Logs
```bash
Request:
GET /api/audit/logs/component/COMP-12345

Response:
{
  "entityType": "component",
  "entityId": "COMP-12345",
  "count": 5,
  "logs": [
    {
      "id": 42,
      "action": "update",
      "oldValue": "{...}",
      "newValue": "{...}",
      "changedBy": "john.doe@ucal.com",
      "description": "Updated MPN and activated component",
      "createdAt": "2026-04-09T14:35:22.456Z"
    },
    ...
  ]
}
```

#### Get Change History
```bash
Request:
GET /api/audit/changes/feeder/FEEDER-05

Response:
{
  "entityType": "feeder",
  "entityId": "FEEDER-05",
  "changes": [
    {
      "timestamp": "2026-04-08T10:00:00Z",
      "action": "create",
      "before": null,
      "after": {
        "feederNumber": "05",
        "status": "active"
      },
      "changedBy": "system"
    },
    {
      "timestamp": "2026-04-09T14:35:22Z",
      "action": "update",
      "before": {"status": "active"},
      "after": {"status": "maintenance"},
      "changedBy": "supervisor@ucal.com"
    }
  ],
  "totalChanges": 2
}
```

---

### Phase 6: Traceability Endpoints

#### Get Reel Scans
```bash
Request:
GET /api/traceability/reel/REEL-123456

Response:
{
  "reelId": "REEL-123456",
  "count": 15,
  "scans": [
    {
      "id": 1,
      "sessionId": 5,
      "feederNumber": "03",
      "scannedMpn": "MPN-654321",
      "lotNumber": "LOT-2026-00001",
      "dateCode": "14-26",
      "status": "ok",
      "validationResult": "pass",
      "alternateUsed": false,
      "scannedAt": "2026-04-09T10:30:45Z"
    },
    ...
  ]
}
```

#### Get Session Trace
```bash
Request:
GET /api/traceability/session/5/trace

Response:
{
  "sessionId": 5,
  "count": 8,
  "trace": [
    {
      "scanId": 42,
      "feederId": 1,
      "feederNumber": "01",
      "reelId": "REEL-001234",
      "scannedMpn": "MPN-111111",
      "lotNumber": "LOT-2026-00001",
      "dateCode": "15-26",
      "status": "ok",
      "validationResult": "pass",
      "alternateUsed": false,
      "scannedAt": "2026-04-09T10:15:00Z"
    },
    ...
  ]
}
```

#### Get Alternate Usage Report
```bash
Request:
GET /api/traceability/alternate-usage?limit=50

Response:
{
  "count": 42,
  "limit": 50,
  "report": [
    {
      "feederNumber": "05",
      "scannedMpn": "ALT-MPN-999999",
      "alternateUsed": true,
      "sessionId": 7,
      "scannedAt": "2026-04-09T11:45:30Z"
    },
    {
      "feederNumber": "12",
      "scannedMpn": "ALT-MPN-888888",
      "alternateUsed": true,
      "sessionId": 8,
      "scannedAt": "2026-04-09T12:20:15Z"
    },
    ...
  ]
}
```

---

## 🧪 Complete Testing Workflow

### Step 1: Initialize
```bash
# Clear old data
curl -X POST http://localhost:3000/api/test/clear \
  -H "x-confirm-clear: CLEAR_DATABASE_CONFIRMED"

# Seed new data
curl -X POST http://localhost:3000/api/test/seed
```

### Step 2: Verify
```bash
# Get statistics
curl http://localhost:3000/api/test/stats | jq '.'
```

### Step 3: Test Features
```bash
# Test traceability
curl http://localhost:3000/api/traceability/session/1/trace | jq '.'

# Test audit
curl http://localhost:3000/api/audit/logs/bom/1 | jq '.'

# Test alternates
curl http://localhost:3000/api/traceability/alternate-usage | jq '.'
```

---

## 📋 Query Parameters Reference

### Audit Endpoints
| Endpoint | Parameter | Type | Example | Required |
|----------|-----------|------|---------|----------|
| `/audit/user/:userId` | limit | number | 50 | No (default: 100) |
| `/audit/action/:action` | limit | number | 50 | No (default: 100) |
| `/audit/range` | startDate | ISO 8601 | 2026-04-01T00:00:00Z | Yes |
| `/audit/range` | endDate | ISO 8601 | 2026-04-09T23:59:59Z | Yes |
| `/audit/range` | limit | number | 500 | No (default: 1000) |

### Traceability Endpoints
| Endpoint | Parameter | Type | Example | Required |
|----------|-----------|------|---------|----------|
| `/traceability/alternate-usage` | limit | number | 100 | No (default: 100) |

---

## 🔐 Authentication & Headers

### Required Headers
```
Content-Type: application/json
```

### Special Headers
```
x-confirm-clear: CLEAR_DATABASE_CONFIRMED  (Required for POST /test/clear)
```

---

## 🚨 Error Handling

### Common HTTP Status Codes
| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | GET request successful |
| 400 | Bad Request | Missing required fields |
| 403 | Forbidden | Missing confirmation header |
| 404 | Not Found | Entity/endpoint not found |
| 500 | Server Error | Database or service error |

### Error Response Format
```json
{
  "error": "Failed to [operation]: [reason]"
}
```

---

## 🎯 Common Workflows

### Workflow 1: Trace a Component Used in Session
```bash
# 1. Get session trace
curl http://localhost:3000/api/traceability/session/5/trace | jq '.'

# 2. For each scan, check the reel
REEL_ID="REEL-001234"
curl http://localhost:3000/api/traceability/reel/$REEL_ID | jq '.'

# 3. Check lot history
LOT="LOT-2026-00001"
curl http://localhost:3000/api/traceability/lot/$LOT | jq '.'
```

### Workflow 2: Audit Entity Changes
```bash
# 1. Get all changes for a component
curl http://localhost:3000/api/audit/changes/component/COMP-123 | jq '.changes'

# 2. Get before/after comparison
curl http://localhost:3000/api/audit/diff/component/COMP-123 | jq '.diffs'

# 3. Get who made the changes
curl http://localhost:3000/api/audit/logs/component/COMP-123 | jq '.logs[].changedBy'
```

### Workflow 3: User Activity Report
```bash
# 1. Get all actions by user
curl http://localhost:3000/api/audit/user/john.doe@ucal.com | jq '.logs'

# 2. Filter by action type
curl http://localhost:3000/api/audit/action/update | jq '.logs'

# 3. Get date-ranged audit trail
curl "http://localhost:3000/api/audit/range?startDate=2026-04-01T00:00:00Z&endDate=2026-04-09T23:59:59Z" | jq '.logs'
```

---

## 🚀 Performance Tips

1. **Use limit parameter** on large result sets
2. **Filter by date range** for audit queries
3. **Use specific IDs** instead of full table scans
4. **Cache results** client-side when possible
5. **Batch requests** to reduce round trips

---

## 📞 Support

For issues or questions, refer to:
- **API_TESTING_GUIDE.md** - Detailed testing guide
- **PHASES_5_6_7_GUIDE.md** - Implementation guide
- **PHASES_5_6_7_SUMMARY.md** - Executive summary

---

**Generated**: April 9, 2026
**Version**: 1.0.0
**Status**: Ready for Production

