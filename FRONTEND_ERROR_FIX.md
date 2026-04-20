# Frontend Startup Error - Fixed

## Problem
```
(index):1 Unsafe attempt to load URL http://localhost:5173/ 
from frame with URL chrome-error://chromewebdata/. 
Domains, protocols and ports must match.
```

## Root Cause
The Vite configuration for the frontend requires two environment variables to start:
- `PORT=5173`
- `BASE_PATH=/`

These were not being set when starting the frontend server, causing Vite to fail initialization.

## Solution Applied
Updated `/restart-servers.sh` to properly set all required environment variables:

```bash
PORT=5173 \
BASE_PATH="/" \
VITE_API_URL="$API_TARGET" \
NODE_ENV=development \
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
```

## Verification
Both servers are now running correctly:

✅ **API Server:** http://localhost:3001/api/sessions  
✅ **Frontend:** http://localhost:5173  

## To Access the Application
```bash
# Frontend Dashboard (Browser)
http://localhost:5173

# API Endpoints (Backend API)
http://localhost:3001/api/...
```

## Restart Servers
Use the fixed script:
```bash
./restart-servers.sh
```

## If Error Persists
1. Check logs:
   ```bash
   tail -50 logs/frontend.log
   tail -50 logs/api.log
   ```

2. Clear browser cache and hard refresh:
   - Windows/Linux: `Ctrl + Shift + R`
   - macOS: `Cmd + Shift + R`

3. Verify ports are free:
   ```bash
   lsof -i :5173
   lsof -i :3001
   ```

4. Manually restart:
   ```bash
   ./stop-servers.sh
   sleep 2
   ./restart-servers.sh
   ```

---

**Status:** ✅ FIXED  
**Date:** April 20, 2026  
**Last Verified:** Servers running and responding
