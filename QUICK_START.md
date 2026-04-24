# Quick Start Guide - Phases 5, 6, 7

## ⚡ 5-Minute Setup

### Prerequisites

- PostgreSQL running locally
- Node.js and pnpm installed
- Environment variables configured

### Quick Setup

```bash
# 1. Start API server
cd artifacts/api-server
pnpm install
pnpm dev

# 2. In another terminal, run migrations
cd lib/db
DATABASE_URL="postgresql://smtverify@localhost:5432/smtverify" pnpm push

# 3. Navigate back and seed data
cd ../../artifacts/api-server
# Server should be running on http://localhost:3000
```

### Company Logo

Configure the report branding values in `.env`:

```bash
COMPANY_NAME=UCAL Fuel Systems Limited
COMPANY_LOGO_PATH=./assets/company-logo.png
```

For frontend PDF rendering, place the logo file at:

```text
artifacts/feeder-scanner/public/assets/company-logo.png
```

## Default User Accounts

Run once after database migration:

```bash
pnpm --filter @workspace/api-server run seed:users
```

Default credentials (change after first login in production):

| Username | Password | Role |
|---|---|---|
| operator1 | Operator@123 | operator |
| operator2 | Operator@123 | operator |
| qa1 | QA@123456 | qa |
| engineer1 | Engineer@123 | engineer |

IMPORTANT: Change all default passwords before production deployment.
Use POST /api/auth/change-password after first login.

---

## 🎯 First Steps

### Test 1: Health Check

```bash
curl http://localhost:3000/api/health
```

### Test 2: Seed Database

```bash
curl -X POST http://localhost:3000/api/test/seed-quick
```

### Test 3: View Statistics

```bash
curl http://localhost:3000/api/test/stats | jq '.'
```

### Test 4: Try Traceability

```bash
curl http://localhost:3000/api/traceability/session/1/trace | jq '.'
```

### Test 5: Try Audit

```bash
curl http://localhost:3000/api/audit/logs/bom/1 | jq '.'
```

---

## 📁 Key Files

### Phase 5: UI Components

```
artifacts/feeder-scanner/src/components/scan-feedback.tsx
├── ScanResultDisplay - Real-time feedback
├── ScanHistory - Recent scans
└── SessionStats - Live stats
```

### Phase 6: Services & Routes

```
artifacts/api-server/src/
├── services/
│   ├── audit-service.ts - Audit operations
│   └── traceability-service.ts - Traceability queries
└── routes/
    ├── audit.ts - 7 audit endpoints
    └── traceability.ts - 7 traceability endpoints
```

### Phase 7: Testing

```
artifacts/api-server/src/
├── services/seed-service.ts - Data generation
└── routes/test.ts - 4 test endpoints
```

---

## 🧪 Common Commands

### Clear & Reseed

```bash
# Clear
curl -X POST http://localhost:3000/api/test/clear \
  -H "x-confirm-clear: CLEAR_DATABASE_CONFIRMED"

# Seed
curl -X POST http://localhost:3000/api/test/seed
```

### Quick Analysis

```bash
# Get DB stats
curl http://localhost:3000/api/test/stats

# Get alternate report
curl http://localhost:3000/api/traceability/alternate-usage?limit=20

# Check all component updates
curl http://localhost:3000/api/audit/action/update?limit=50
```

### User Activity

```bash
# Get all actions by operator
curl "http://localhost:3000/api/audit/user/john.smith@ucal.com"

# Get date range activity
curl "http://localhost:3000/api/audit/range?startDate=2026-04-01T00:00:00Z&endDate=2026-04-09T23:59:59Z"
```

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **PHASES_5_6_7_SUMMARY.md** | Executive overview |
| **PHASES_5_6_7_GUIDE.md** | Detailed implementation |
| **API_TESTING_GUIDE.md** | API endpoint reference |
| **API_REFERENCE.md** | Complete API catalog |

---

## 🔄 Integration with Frontend

### Using Scan Feedback Components

```typescript
import { ScanResultDisplay, SessionStats } from '@/components/scan-feedback';

// In your scanning component
<ScanResultDisplay 
  feedback={{
    status: 'pass',
    feederNumber: '05',
    expectedMpn: 'MPN-123456',
    scannedMpn: 'MPN-123456',
    lotNumber: 'LOT-2026-00001',
    dateCode: '15-26',
    reelId: 'REEL-001234',
    message: 'Component verified successfully',
    timestamp: new Date()
  }}
/>

// Display stats
<SessionStats
  totalScans={150}
  passScans={145}
  alternateScans={3}
  mismatchScans={2}
  uniqueFeeders={10}
  totalBomItems={12}
/>
```

---

## 🚀 Deployment Checklist

- [ ] Run database migrations
- [ ] Seed test data
- [ ] Test all 18 endpoints
- [ ] Verify stats endpoint
- [ ] Check audit trail
- [ ] Validate traceability chains
- [ ] Review error responses
- [ ] Load test with large dataset
- [ ] UAT with operators
- [ ] Production deploy

---

## 🐛 Troubleshooting

### Database Connection Error

```bash
# Check DATABASE_URL
echo $DATABASE_URL

# Test connection
psql postgresql://smtverify@localhost:5432/smtverify -c "SELECT 1"
```

### Seed Fails

```bash
# Run migrations first
cd lib/db
DATABASE_URL="postgresql://smtverify@localhost:5432/smtverify" pnpm push

# Then retry seed
curl -X POST http://localhost:3000/api/test/seed
```

### Can't Clear Database

```bash
# Verify confirmation header
curl -X POST http://localhost:3000/api/test/clear \
  -H "x-confirm-clear: CLEAR_DATABASE_CONFIRMED"
```

---

## 📊 What You Got

✅ **Phase 5**: 3 new UI components for enhanced scanning feedback
✅ **Phase 6**: 14 new API endpoints (7 audit + 7 traceability)
✅ **Phase 7**: 4 test endpoints + realistic data generation

**Total**: 18 endpoints, 2 services, 3 components, 4 docs

---

## 🎯 Next Steps

1. **Integrate Components**: Add scan feedback UI to session-active.tsx
2. **User Testing**: Get operator feedback on UI
3. **Load Testing**: Test with 10,000+ records
4. **Production Ready**: Final security review and deploy

---

## 📞 Need Help?

Check these resources:

1. API_REFERENCE.md - All endpoints with examples
2. PHASES_5_6_7_GUIDE.md - Implementation details
3. API_TESTING_GUIDE.md - Detailed testing instructions

---

**Ready to go! 🚀**

Start testing with: `curl http://localhost:3000/api/test/seed-quick`
