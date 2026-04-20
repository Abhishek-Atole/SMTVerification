# Server Management Scripts - Quick Reference

## Available Scripts

### 1. **restart-servers.sh** (Recommended for full restart)
Complete restart of all servers with status verification and logging.

```bash
./restart-servers.sh
```

**Features:**
- ✅ Stops all running servers
- ✅ Prevents port conflicts
- ✅ Builds API if needed
- ✅ Auto-waits for servers to be ready
- ✅ Displays status dashboard
- ✅ Shows log file locations

**With Live Logs:**
```bash
./restart-servers.sh --logs
```

**With Custom API Target (for network access):**
```bash
API_TARGET="http://192.168.1.100:3001" ./restart-servers.sh
```

---

### 2. **stop-servers.sh** (Stop all servers)
Quickly stop all running servers.

```bash
./stop-servers.sh
```

**Stops:**
- API Server (Node.js)
- Frontend Server (Vite)
- Ngrok tunnel (if running)

---

### 3. **start-servers.sh** (Start only)
Start servers individually.

```bash
./start-servers.sh
```

**Starts:**
- API Server on port 3001
- Frontend Server on port 5173

---

## Common Workflows

### Quick Restart (Recommended)
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
./restart-servers.sh
```

### Restart with Live Logs
```bash
./restart-servers.sh --logs
```

### Stop & Check
```bash
./stop-servers.sh
ps aux | grep node
```

### Manual Restart (Step by Step)
```bash
./stop-servers.sh
sleep 2
./start-servers.sh
```

---

## Port Configuration

| Service | Port | Environment |
|---------|------|-------------|
| API Server | 3001 | NODE_ENV=production |
| Frontend | 5173 | Development/Vite |
| Database | 5432 | PostgreSQL |

---

## Log Files

All logs stored in: `/media/abhishek-atole/Courses/Final SMT MES SYSTEM/SMTVerification/logs/`

```bash
# View API server logs
tail -f logs/api.log

# View Frontend logs
tail -f logs/frontend.log

# View Build logs
tail -f logs/build.log

# View all logs
tail -f logs/*.log
```

---

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3001
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Kill process on port 5173
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### API Not Responding
```bash
# Check if process is running
ps aux | grep "node.*index.mjs"

# Check logs
tail -50 logs/api.log

# Test endpoint
curl http://localhost:3001/api/sessions
```

### Frontend Not Loading
```bash
# Check if process is running
ps aux | grep "npm run dev"

# Check logs
tail -50 logs/frontend.log

# Test port
curl http://localhost:5173
```

---

## Advanced: Custom Configuration

### Set Environment Variables
```bash
export API_TARGET="http://192.168.1.100:3001"
export DATABASE_URL="postgresql://user:pass@host:5432/db"
./restart-servers.sh
```

### Check Server Status
```bash
echo "=== API Server Status ==="
curl -s http://localhost:3001/api/sessions | jq '.count'

echo "=== Frontend Status ==="
curl -s http://localhost:5173 | head -20
```

---

## Performance Notes

- **API Server Memory:** ~138MB (stable)
- **Build Time:** ~5.7 seconds
- **API Startup:** ~2-3 seconds
- **Frontend Startup:** ~4-5 seconds
- **Full Restart:** ~15 seconds total

---

**Created:** April 20, 2026
**Location:** `/media/abhishek-atole/Courses/Final SMT MES SYSTEM/SMTVerification/`
