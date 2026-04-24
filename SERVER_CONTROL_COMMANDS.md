# Server Control Commands

## 🛑 STOP/TURN OFF THE SERVER

### Option 1: Using System Script (Recommended)
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
bash scripts/system-restart-recovery.sh stop
```

### Option 2: Manual Kill Commands
```bash
# Kill API Server
pkill -f "node.*api-server"

# Kill Frontend
pkill -f "vite"

# Kill ngrok
pkill -f "ngrok"

# Or kill ALL Node processes
pkill -9 -f "node"
```

### Option 3: Kill by Port
```bash
# Kill process on port 3000 (API)
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Kill process on port 5173 (Frontend)
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Kill process on port 4040 (ngrok)
lsof -i :4040 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

---

## 🚀 START THE SERVER

### Option 1: Full System Start (Recommended)
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
bash scripts/system-restart-recovery.sh start
```

This will:
- ✅ Kill any existing processes
- ✅ Build API server
- ✅ Build frontend
- ✅ Start API server (port 3000)
- ✅ Start frontend (port 5173)
- ✅ Display all URLs

### Option 2: Manual Startup (3 Terminals)

**Terminal 1 - API Server:**
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/artifacts/api-server
npm run build
npm run start
# Runs on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/artifacts/feeder-scanner
PORT=5173 BASE_PATH=/ npm run dev
# Runs on http://localhost:5173
```

**Terminal 3 - ngrok (see below)**

---

## 🌐 NGROK SERVER COMMANDS

### Start ngrok
```bash
# Make sure you have ngrok installed
ngrok --version

# Start ngrok tunnel on port 5173 (frontend)
ngrok http 5173
```

**Output will show:**
```
Session Status                online
Account                       [your-account]
Version                        3.x.x
Region                        [region]
Forwarding                    https://[random-string].ngrok-free.dev -> http://localhost:5173
```

### Stop ngrok
```bash
# Press Ctrl+C in the ngrok terminal, or:
pkill -f ngrok

# Or kill by port
lsof -i :4040 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Access via ngrok
- Use the HTTPS URL provided (e.g., `https://xxx-xxx-xxx.ngrok-free.dev`)
- This gives public access to your local frontend

---

## 📋 COMPLETE WORKFLOW

### Start Everything
```bash
# Terminal 1: Start all services
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
bash scripts/system-restart-recovery.sh start

# Terminal 2: Start ngrok (after services are running)
ngrok http 5173
```

### Stop Everything
```bash
# Option A: Use script
bash scripts/system-restart-recovery.sh stop

# Option B: Kill manually
pkill -f "node"
pkill -f "vite"
pkill -f "ngrok"
```

### Restart Everything
```bash
# Kill and restart
bash scripts/system-restart-recovery.sh stop
sleep 2
bash scripts/system-restart-recovery.sh start
```

---

## ✅ VERIFY SERVICES ARE RUNNING

```bash
# Check API Server
curl http://localhost:3000/api/health

# Check Frontend (will show HTML)
curl http://localhost:5173 | head -20

# Check Database
psql -h localhost -U smtverify -d smtverify -c "SELECT 1"

# List all running services
ps aux | grep -E "node|vite|ngrok"

# Check ports
lsof -i :3000   # API
lsof -i :5173   # Frontend
lsof -i :4040   # ngrok
```

---

## 🔗 ACCESS POINTS (After Starting)

| Service | URL | Type |
|---------|-----|------|
| Frontend (Local) | http://localhost:5173 | Private |
| Frontend (ngrok) | https://xxx.ngrok-free.dev | Public |
| API Server | http://localhost:3000 | Private |
| API Health | http://localhost:3000/api/health | Private |
| Database | localhost:5432 | Private |

---

## 💡 QUICK COMMANDS

| Action | Command |
|--------|---------|
| **Start All** | `bash scripts/system-restart-recovery.sh start` |
| **Stop All** | `bash scripts/system-restart-recovery.sh stop` |
| **Restart All** | `bash scripts/system-restart-recovery.sh stop && sleep 2 && bash scripts/system-restart-recovery.sh start` |
| **Start ngrok** | `ngrok http 5173` |
| **Stop ngrok** | `pkill -f ngrok` |
| **Check API** | `curl http://localhost:3000/api/health` |
| **Kill All Node** | `pkill -9 -f "node"` |
| **Kill Port 3000** | `lsof -i :3000 \| grep LISTEN \| awk '{print $2}' \| xargs kill -9` |

---

## ⚡ ONE-LINER QUICK START

```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification && bash scripts/system-restart-recovery.sh start && sleep 5 && echo "✅ Services Ready!" && echo "Frontend: http://localhost:5173" && echo "API: http://localhost:3000"
```

---

**Last Updated**: April 22, 2026
