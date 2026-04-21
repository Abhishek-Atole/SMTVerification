# API Testing Guide - Phases 5, 6, 7

## Quick Reference

### Base URL

```
http://localhost:3000/api
```

---

## 🔧 Phase 7 - Testing Endpoints

### 1. Seed Database

**Endpoint**: `POST /test/seed`

**Without body** (uses defaults):

```bash
curl -X POST http://localhost:3000/api/test/seed
```

**With custom options**:

```bash
curl -X POST http://localhost:3000/api/test/seed \
  -H "Content-Type: application/json" \
  -d '{
    "companiesCount": 3,
    "bomsPerCompany": 2,
    "feedersPerBom": 15,
    "componentsPerBom": 12,
    "alternatesPerComponent": 2,
    "sessionsPerBom": 3,
    "scansPerSession": 20
  }'
```

**Success Response**:

```json
{
  "success": true,
  "recordsCreated": 847
}
```

---

### 2. Quick Seed (Minimal Data)

**Endpoint**: `GET /test/seed-quick`

```bash
curl http://localhost:3000/api/test/seed-quick
```

**Perfect for**:

- Quick testing
- Demo purposes
- CI/CD pipelines
- Creates ~100 records

---

### 3. Get Database Statistics

**Endpoint**: `GET /test/stats`

```bash
curl http://localhost:3000/api/test/stats
```

**Response**:

```json
{
  "timestamp": "2026-04-09T14:32:10.123Z",
  "stats": {
    "boms": 12,
    "components": 96,
    "componentAlternates": 192,
    "feeders": 180,
    "bomItems": 96,
    "sessions": 36,
    "scans": 720,
    "splices": 180,
    "auditLogs": 1008
  },
  "total": 2520
}
```

---

### 4. Clear Database

**Endpoint**: `POST /test/clear`

⚠️ **Warning**: This is destructive and requires confirmation token

```bash
curl -X POST http://localhost:3000/api/test/clear \
  -H "x-confirm-clear: CLEAR_DATABASE_CONFIRMED"
```

**Success Response**:

```json
{
  "success": true,
  "message": "Database cleared"
}
```

**Without confirmation token**:

```json
{
  "error": "Clear action not confirmed. Include header: x-confirm-clear: CLEAR_DATABASE_CONFIRMED"
}
```

---

## 🔍 Phase 6 - Audit Trail Endpoints

### 1. Record Audit Log

**Endpoint**: `POST /audit/log`

```bash
curl -X POST http://localhost:3000/api/audit/log \
  -H "Content-Type: application/json" \
  -d '{
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
    "description": "Updated component MPN and activated for production"
  }'
```

**Response**:

```json
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
    "description": "Updated component MPN and activated for production",
    "createdAt": "2026-04-09T14:35:22.456Z"
  }
}
```

---

### 2. Get Audit Logs for Entity

**Endpoint**: `GET /audit/logs/:entityType/:entityId`

```bash
curl http://localhost:3000/api/audit/logs/component/COMP-12345
```

**Response**:

```json
{
  "entityType": "component",
  "entityId": "COMP-12345",
  "count": 7,
  "logs": [
    {
      "id": 42,
      "action": "update",
      "changedBy": "john.doe@ucal.com",
      "description": "Updated MPN",
      "createdAt": "2026-04-09T14:35:22.456Z"
    }
    // ... more logs
  ]
}
```

---

### 3. Get Change History

**Endpoint**: `GET /audit/changes/:entityType/:entityId`

```bash
curl http://localhost:3000/api/audit/changes/feeder/FEEDER-05
```

**Response**:

```json
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
      "before": {
        "status": "active"
      },
      "after": {
        "status": "maintenance"
      },
      "changedBy": "supervisor@ucal.com"
    }
  ],
  "totalChanges": 2
}
```

---

### 4. Get Entity Diff

**Endpoint**: `GET /audit/diff/:entityType/:entityId`

```bash
curl http://localhost:3000/api/audit/diff/component/COMP-789
```

**Response**:

```json
{
  "entityType": "component",
  "entityId": "COMP-789",
  "diffs": [
    {
      "action": "create",
      "timestamp": "2026-04-08T10:00:00Z",
      "before": null,
      "after": {
        "mpn": "MPN-123456",
        "name": "Capacitor 100µF"
      },
      "changedBy": "system"
    },
    {
      "action": "update",
      "timestamp": "2026-04-09T14:35:22Z",
      "before": {
        "category": "passive"
      },
      "after": {
        "category": "passive",
        "notes": "Updated specs"
      },
      "changedBy": "engineer@ucal.com"
    }
  ],
  "totalChanges": 2
}
```

---

### 5. Get User Actions

**Endpoint**: `GET /audit/user/:userId?limit=100`

```bash
curl "http://localhost:3000/api/audit/user/john.doe@ucal.com?limit=50"
```

**Response**:

```json
{
  "userId": "john.doe@ucal.com",
  "count": 23,
  "limit": 50,
  "logs": [
    {
      "id": 42,
      "entityType": "component",
      "entityId": "COMP-12345",
      "action": "update",
      "description": "Updated MPN",
      "createdAt": "2026-04-09T14:35:22.456Z"
    }
    // ... 22 more logs
  ]
}
```

---

### 6. Get Logs by Action Type

**Endpoint**: `GET /audit/action/:action?limit=100`

```bash
curl "http://localhost:3000/api/audit/action/update?limit=50"
```

**Valid action values**:

- `create`
- `update`
- `delete`
- `approve`
- `reject`
- `activate`
- `deactivate`

---

### 7. Get Logs by Date Range

**Endpoint**: `GET /audit/range?startDate=...&endDate=...&limit=1000`

```bash
curl "http://localhost:3000/api/audit/range?startDate=2026-04-01T00:00:00Z&endDate=2026-04-09T23:59:59Z&limit=500"
```

**Response**:

```json
{
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-04-09T23:59:59.000Z",
  "count": 247,
  "logs": [
    {
      "id": 1,
      "entityType": "bom",
      "entityId": "BOM-001",
      "action": "create",
      "description": "Created BOM",
      "changedBy": "admin@ucal.com",
      "createdAt": "2026-04-01T08:30:00Z"
    }
    // ... 246 more logs
  ]
}
```

---

## 📊 Phase 6 - Traceability Endpoints

### 1. Find Scans by Reel

**Endpoint**: `GET /traceability/reel/:reelId`

```bash
curl http://localhost:3000/api/traceability/reel/REEL-123456
```

**Response**:

```json
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
      "scannedAt": "2026-04-09T10:30:45Z"
    }
    // ... 14 more scans
  ]
}
```

---

### 2. Find Scans by Lot Number

**Endpoint**: `GET /traceability/lot/:lotNumber`

```bash
curl http://localhost:3000/api/traceability/lot/LOT-2026-00001
```

---

### 3. Find Scans by Date Code

**Endpoint**: `GET /traceability/date-code/:dateCode`

```bash
curl http://localhost:3000/api/traceability/date-code/14-26
```

---

### 4. Get Full Session Traceability

**Endpoint**: `GET /traceability/session/:sessionId/trace`

```bash
curl http://localhost:3000/api/traceability/session/5/trace
```

**Response**:

```json
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
    }
    // ... more feeders
  ]
}
```

---

### 5. Find Sessions Using a Reel

**Endpoint**: `GET /traceability/sessions-for-reel/:reelId`

```bash
curl http://localhost:3000/api/traceability/sessions-for-reel/REEL-123456
```

---

### 6. Find Sessions Using a Lot

**Endpoint**: `GET /traceability/sessions-for-lot/:lotNumber`

```bash
curl http://localhost:3000/api/traceability/sessions-for-lot/LOT-2026-00001
```

---

### 7. Get Alternate Usage Report

**Endpoint**: `GET /traceability/alternate-usage?limit=100`

```bash
curl "http://localhost:3000/api/traceability/alternate-usage?limit=50"
```

**Response**:

```json
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
    }
    // ... 40 more alternate usages
  ]
}
```

---

## 🧪 Complete Testing Workflow

### Step 1: Clear and Seed

```bash
# Clear old data
curl -X POST http://localhost:3000/api/test/clear \
  -H "x-confirm-clear: CLEAR_DATABASE_CONFIRMED"

# Seed fresh data
curl -X POST http://localhost:3000/api/test/seed
```

### Step 2: Get Statistics

```bash
curl http://localhost:3000/api/test/stats
```

### Step 3: Test Traceability

```bash
# Get first reel from stats, then query it
curl http://localhost:3000/api/traceability/reel/REEL-000001

# Get first session trace
curl http://localhost:3000/api/traceability/session/1/trace
```

### Step 4: Test Audit

```bash
# Test recording an audit log
curl -X POST http://localhost:3000/api/audit/log \
  -H "Content-Type: application/json" \
  -d '{
    "entityType": "component",
    "entityId": "TEST-123",
    "action": "create",
    "newValue": {"mpn": "TEST-MPN"},
    "changedBy": "test@example.com",
    "description": "Test audit log"
  }'

# Retrieve it
curl http://localhost:3000/api/audit/logs/component/TEST-123
```

---

## 📝 cURL Command Cheat Sheet

### JSON POST

```bash
curl -X POST <url> \
  -H "Content-Type: application/json" \
  -d '<json>'
```

### With Custom Headers

```bash
curl -H "X-Custom-Header: value" <url>
```

### Pretty Print JSON

```bash
curl <url> | jq '.'
```

### Save to File

```bash
curl <url> > response.json
```

---

## 🔐 Security Notes

1. **Clear Database Endpoint**: Requires explicit confirmation token
2. **Audit Logs**: Include user tracking via `changedBy`
3. **Entity IDs**: Should be validated on backend
4. **Date Range Queries**: Use ISO format for consistency

---

## 📈 Performance Tips

1. Use `limit` parameter on large queries
2. Filter by date range when querying audit logs
3. Use specific entity IDs instead of scanning all records
4. Consider pagination for large result sets
