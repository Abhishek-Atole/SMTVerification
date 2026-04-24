# Quick Start Commands - 16-Point SMT MES System

## 🚀 Start Services

### Option 1: Using System Restart Script (Recommended)
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
bash scripts/system-restart-recovery.sh start
```

This will:
- ✅ Kill any running API/frontend processes
- ✅ Build API server
- ✅ Build frontend (BASE_PATH=/)
- ✅ Start API server on port 3000
- ✅ Start frontend on port 5173
- ✅ Display all URLs and status

### Option 2: Manual Startup

**Terminal 1 - API Server:**
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/artifacts/api-server
npm run build
npm run start
# Will run on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/artifacts/feeder-scanner
PORT=5173 BASE_PATH=/ npm run dev
# Will run on http://localhost:5173
```

---

## 🔗 Access Points

| Service | Local URL | Status | Purpose |
|---------|-----------|--------|---------|
| **Frontend** | http://localhost:5173 | ✅ | Main UI for feeder verification |
| **API Server** | http://localhost:3000 | ✅ | Backend API endpoints |
| **API Health** | http://localhost:3000/api/health | ✅ | API status check |
| **Database** | localhost:5432 | ✅ | PostgreSQL (user: smtverify) |
| **ngrok Tunnel** | https://nonangling-unspruced-taren.ngrok-free.dev | ✅ | Public access |

---

## 🗄️ Database Access

### Connect to Database
```bash
psql -h localhost -U smtverify -d smtverify
# Password: smtverify
```

### Quick Database Queries

**View all sessions:**
```sql
SELECT id, company_name, operator_name, status, created_at 
FROM sessions 
WHERE deleted_at IS NULL 
ORDER BY created_at DESC 
LIMIT 10;
```

**View scan records for session:**
```sql
SELECT id, feeder_number, status, internal_id_scanned, verification_mode, created_at
FROM scan_records 
WHERE session_id = :session_id 
ORDER BY scanned_at;
```

**View audit trail:**
```sql
SELECT entity_type, action, changed_by, description, created_at
FROM audit_logs 
WHERE entity_id LIKE '%session_:session_id%' 
ORDER BY created_at DESC;
```

**View BOM with alternates:**
```sql
SELECT feeder_number, part_number, is_alternate, mpn, expected_mpn
FROM bom_items 
WHERE bom_id = :bom_id 
ORDER BY feeder_number, is_alternate;
```

---

## 🧪 Testing Workflows

### Test 1: Quick Verification (5 min)
```bash
# 1. Start services
bash scripts/system-restart-recovery.sh start

# 2. Open browser
open http://localhost:5173

# 3. Create session with existing BOM
# 4. Scan F001-F004 with correct MPNs
# 5. Verify progress bar reaches 100%
# 6. Verify Splicing tab becomes enabled
# 7. Record one spool replacement
```

### Test 2: Alternate Components (5 min)
```sql
-- Add BOM with alternates to test
INSERT INTO boms (name) VALUES ('ALT-TEST') RETURNING id;
INSERT INTO bom_items (bom_id, feeder_number, part_number, is_alternate, mpn) VALUES
  (1, 'F001', 'PRIMARY', false, 'MPN-PRIMARY'),
  (1, 'F001', 'ALT-1', true, 'MPN-ALT-1'),
  (1, 'F001', 'ALT-2', true, 'MPN-ALT-2');
```

### Test 3: Validation Errors (3 min)
- Scan with wrong MPN → Should reject with message
- Scan with duplicate feeder → Should reject duplicate alert
- Scan non-existent feeder → Should show not found error

### Test 4: Performance Monitoring (2 min)
- Open DevTools Network tab
- Scan multiple feeders
- Check response times in Network tab
- Verify each scan < 200ms

---

## 📊 Useful Development Commands

### Build Only
```bash
# API Server
cd artifacts/api-server && npm run build

# Frontend
cd artifacts/feeder-scanner && PORT=5173 BASE_PATH=/ npm run build
```

### View Logs
```bash
# API Server logs (if running as service)
journalctl -u smt-verification -f

# Frontend development logs
# Check browser console (F12)
```

### Check Service Status
```bash
# Check if services are running
lsof -i :3000  # API Server
lsof -i :5173  # Frontend
psql -h localhost -U smtverify -d smtverify -c "SELECT 1;"  # Database
```

### Kill Services
```bash
# Stop all SMT services
pkill -f "node.*api-server"
pkill -f "node.*feeder-scanner"
pkill -f "vite"

# Or use:
bash scripts/system-restart-recovery.sh stop
```

---

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Database Connection Failed
```bash
# Check database is running
pg_isready -h localhost -U smtverify -d smtverify

# Test connection
psql -h localhost -U smtverify -d smtverify -c "SELECT 1;"
```

### Frontend Assets Return 404
```bash
# Verify BASE_PATH is set correctly
# Should be BASE_PATH=/ (not /api)
PORT=5173 BASE_PATH=/ npm run build
```

### API Compilation Errors
```bash
# Check TypeScript
cd artifacts/api-server
npm run build

# View full error
cat dist/index.mjs  # Should be valid JavaScript
```

---

## 📈 Performance Baseline

### Expected Performance
- **API Response Time**: 50-100ms (target < 200ms) ✅
- **Frontend Load Time**: 2-3 seconds
- **Database Query Time**: < 50ms
- **Scan Throughput**: 10-15 scans/minute

### Monitoring Commands
```bash
# Check API response time
time curl http://localhost:3000/api/sessions

# Check database query time
time psql -h localhost -U smtverify -d smtverify -c "SELECT COUNT(*) FROM scan_records;"

# Monitor system resources
top
```

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `IMPLEMENTATION_16_POINT_SUMMARY.md` | Complete feature documentation |
| `TESTING_CHECKLIST_16_POINT.md` | Comprehensive testing guide |
| `artifacts/api-server/src/routes/sessions.ts` | API endpoint implementation |
| `artifacts/feeder-scanner/src/pages/session-active.tsx` | Frontend main component |
| `lib/db/src/schema/` | Database schema definitions |
| `scripts/system-restart-recovery.sh` | System startup/shutdown script |
| `docs/guides/API_REFERENCE.md` | API documentation |

---

## 🎯 Typical Workflow

```
1. START SERVICES
   bash scripts/system-restart-recovery.sh start

2. OPEN BROWSER
   http://localhost:5173

3. CREATE SESSION
   - Company: Test Corp
   - Operator: John Doe
   - Select BOM with alternates
   - Start

4. LOADING TAB (Verify Components)
   - Scan feeder number
   - Enter MPN/Internal ID
   - Receive ✅ VERIFIED or ❌ VALIDATION FAILED
   - Progress bar advances for each required feeder
   - Continue until 100% complete

5. SPLICING TAB (Record Replacements)
   - Tab auto-enabled when 100% verified
   - Scan each feeder that needs spool replacement
   - Enter old and new spool barcodes
   - Record replacement

6. END SESSION
   - Click "End Session"
   - View summary report
   - Access audit trail

7. VERIFY AUDIT TRAIL
   SELECT * FROM audit_logs 
   WHERE entity_id LIKE '%session_1%' 
   ORDER BY created_at DESC;
```

---

## 🚨 Emergency Commands

### Full System Reset
```bash
# CAUTION: Resets database and clears data
bash scripts/system-restart-recovery.sh stop
bash scripts/system-restart-recovery.sh start
```

### Clear Old Sessions
```bash
# Soft delete sessions older than 7 days
UPDATE sessions 
SET deleted_at = NOW(), deleted_by = 'SYSTEM'
WHERE created_at < NOW() - INTERVAL '7 days' 
  AND deleted_at IS NULL;
```

### Force Kill Services
```bash
pkill -9 -f "node"
pkill -9 -f "vite"
systemctl stop smt-verification  # If running as service
```

---

## 💡 Tips & Tricks

1. **Quick Testing**: Use ngrok URL to test on mobile
2. **Database Backup**: `pg_dump smtverify > backup.sql`
3. **Database Restore**: `psql smtverify < backup.sql`
4. **Clear Logs**: `echo "" > /var/log/smt-verification.log`
5. **Frontend Hot Reload**: Already enabled in dev mode with Vite

---

**Last Updated**: April 22, 2026  
**System Status**: ✅ Ready for Production Testing
