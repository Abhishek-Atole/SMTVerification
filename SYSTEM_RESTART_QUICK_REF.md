# System Restart & Recovery - Quick Reference

## ⚡ Quick Start

```bash
# Install auto-start on boot (one-time setup)
sudo bash scripts/setup-boot-autostart.sh

# System automatically recovers after power cut ✅
```

## 📋 Common Commands

### Check System Status
```bash
./scripts/system-restart-recovery.sh status
```

Output:
```
✓ API Server: RUNNING (PID: 12345)
✓ API Health: HEALTHY
✓ Frontend: HEALTHY
✓ Database: CONNECTED
```

### Manual Start/Stop
```bash
# Start
./scripts/system-restart-recovery.sh start

# Stop
./scripts/system-restart-recovery.sh stop

# Restart
./scripts/system-restart-recovery.sh restart

# Full recovery (if stuck)
./scripts/system-restart-recovery.sh recover
```

### Using Systemd
```bash
# Start service
sudo systemctl start smt-verification

# Stop service
sudo systemctl stop smt-verification

# Restart service
sudo systemctl restart smt-verification

# Check status
sudo systemctl status smt-verification

# Enable/disable auto-start
sudo systemctl enable smt-verification
sudo systemctl disable smt-verification
```

### View Logs
```bash
# Recovery logs
tail -f /var/log/smt-verification/restart-recovery.log

# API server logs
tail -f /var/log/smt-verification/api-server.log

# Frontend logs
tail -f /var/log/smt-verification/app-server.log

# Systemd journal (real-time)
sudo journalctl -u smt-verification -f

# Last 50 lines
sudo journalctl -u smt-verification -n 50
```

## 🔒 Lock Management

### Check Lock Status
```bash
./scripts/system-restart-recovery.sh check-lock
```

### Remove Stale Lock
```bash
# Automatic - system removes on next start
./scripts/system-restart-recovery.sh start

# Manual force-unlock (ONLY if stuck)
sudo ./scripts/system-restart-recovery.sh force-unlock
```

## 🩺 Health Checks

### Manual Health Check
```bash
curl http://localhost:3000/health     # API health
curl http://localhost:5173            # Frontend
```

### Check Services
```bash
# Check if port is in use
sudo lsof -i :3000
sudo lsof -i :5173

# Check running processes
ps aux | grep node

# Database connection
psql -h localhost -U postgres -d smt_verification -c "SELECT 1"
```

## 🆘 Emergency Recovery

### If System Won't Start

```bash
# Step 1: Check what's running
ps aux | grep node

# Step 2: Kill stuck processes
sudo lsof -ti:3000 | xargs kill -9
sudo lsof -ti:5173 | xargs kill -9

# Step 3: Force unlock
sudo ./scripts/system-restart-recovery.sh force-unlock

# Step 4: Full recovery
sudo ./scripts/system-restart-recovery.sh recover

# Step 5: Verify
./scripts/system-restart-recovery.sh status
```

### If Port is Blocked

```bash
# Find what's using port
sudo lsof -i :3000

# Kill it
sudo kill -9 <PID>

# Restart service
sudo systemctl restart smt-verification
```

### If Database Won't Connect

```bash
# Check PostgreSQL service
sudo systemctl status postgresql

# Start if needed
sudo systemctl start postgresql

# Test connection
psql -h localhost -U postgres -d smt_verification

# Check credentials
grep DB_ /etc/default/smt-verification
```

## 📊 What Happens Automatically

### On System Boot:
1. Systemd starts smt-verification service
2. Checks for stale/orphaned locks
3. Waits for database (30s timeout)
4. Starts API server on port 3000
5. Starts frontend app on port 5173
6. Verifies both are healthy
7. Logs to systemd journal

### Every 5 Minutes (Cron):
- Health check runs
- Services verified
- Issues logged

### On Service Failure:
- Auto-restart after 10 seconds
- Max 3 restarts per 5 minutes
- All attempts logged

## 📁 File Locations

```
Scripts:
├── scripts/system-restart-recovery.sh       (Main script)
├── scripts/setup-boot-autostart.sh          (Installer)
└── scripts/smt-verification.service         (Systemd file)

Configuration:
├── /etc/systemd/system/smt-verification.service  (Service config)
└── /etc/default/smt-verification                 (Environment vars)

Logs:
├── /var/log/smt-verification/restart-recovery.log   (Main)
├── /var/log/smt-verification/api-server.log         (API)
├── /var/log/smt-verification/app-server.log         (Frontend)
└── /var/log/smt-verification/health-check.log       (Cron health)

Locks:
├── /var/run/smt-verification/system.lock     (Lock file)
└── /var/run/smt-verification/server.pid      (PID file)

Status:
└── /tmp/smt-verification-status.json         (Current status)
```

## 🔧 Configuration

### Database (Edit `/etc/default/smt-verification`):
```bash
DB_HOST=localhost
DB_USER=postgres
DB_NAME=smt_verification
DB_PORT=5432
```

### Ports:
```
API:      3000
Frontend: 5173
```

### Restart Policy:
```
Restart on failure every 10 seconds
Max 3 restarts per 5 minutes
```

## ✅ Verification Checklist

- [ ] Scripts are executable: `ls -l scripts/*.sh`
- [ ] Service is installed: `systemctl list-units | grep smt`
- [ ] Service is enabled: `systemctl is-enabled smt-verification`
- [ ] Service is running: `systemctl is-active smt-verification`
- [ ] Logs are available: `ls /var/log/smt-verification/`
- [ ] Status is healthy: `./scripts/system-restart-recovery.sh status`

## 📞 Support

View full documentation:
```bash
less docs/SYSTEM_RESTART_GUIDE.md
```

For issues:
1. Check logs: `tail -f /var/log/smt-verification/restart-recovery.log`
2. Check status: `./scripts/system-restart-recovery.sh status`
3. Check systemd: `systemctl status smt-verification`
4. Manual recovery: `./scripts/system-restart-recovery.sh recover`

## 🎯 Common Scenarios

### Scenario: Power Cut
```
Power Cut
   ↓
System Restart
   ↓
Systemd auto-starts service
   ↓
Script detects and handles any locks
   ↓
Services start and verify healthy
   ↓
System Back Online ✅
```

### Scenario: Service Crashes
```
Service Crashes
   ↓
Systemd waits 10 seconds
   ↓
Systemd auto-restarts service
   ↓
Script performs full recovery
   ↓
System Back Online ✅
```

### Scenario: System Locked During Shutdown
```
System Locked (shutdown mid-operation)
   ↓
System Boots
   ↓
Script detects stale lock
   ↓
Script removes lock
   ↓
Services start fresh
   ↓
System Back Online ✅
```

## 🚀 That's it!

Your system is now resilient to power cuts and failures.

**Just follow the setup once, then it works automatically! 🎉**
