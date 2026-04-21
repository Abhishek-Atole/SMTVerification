# System Restart & Recovery Guide

## Overview

This guide explains the automatic system restart and recovery mechanisms for the SMT Verification system. These scripts ensure that after a **power cut**, **system failure**, or **restart**, your system automatically starts and recovers with proper lock management.

## Architecture

### Components

1. **system-restart-recovery.sh** - Main recovery script
   - Handles lock management
   - Manages process lifecycle
   - Performs health checks
   - Starts/stops services

2. **smt-verification.service** - Systemd service file
   - Ensures auto-start on boot
   - Manages service dependencies
   - Handles restart policies
   - Logs to systemd journal

3. **setup-boot-autostart.sh** - Installation script
   - Installs systemd service
   - Configures environment
   - Sets up health check cron job
   - Creates necessary directories

## Installation

### Prerequisites

- Linux system (Ubuntu, Debian, CentOS, etc.)
- Root/sudo access
- Node.js and npm/pnpm installed
- PostgreSQL running

### Quick Setup (Recommended)

```bash
cd /media/abhishek-atole/Courses/Final SMT MES\ SYSTEM/SMTVerification/scripts
sudo bash setup-boot-autostart.sh
```

This will:
- Install the systemd service
- Configure auto-start on boot
- Set up health check monitoring
- Create necessary directories
- Set proper permissions

### Manual Setup

If you prefer manual installation:

```bash
# 1. Make scripts executable
chmod +x system-restart-recovery.sh
chmod +x setup-boot-autostart.sh

# 2. Copy service file to systemd
sudo cp smt-verification.service /etc/systemd/system/

# 3. Reload systemd
sudo systemctl daemon-reload

# 4. Enable service
sudo systemctl enable smt-verification.service

# 5. Start service
sudo systemctl start smt-verification.service
```

## Usage

### Manual Commands

```bash
# Start the system (acquire lock, start services)
./system-restart-recovery.sh start

# Stop the system gracefully
./system-restart-recovery.sh stop

# Restart the system
./system-restart-recovery.sh restart

# Full recovery (force unlock + restart)
./system-restart-recovery.sh recover

# Check current status
./system-restart-recovery.sh status

# Check lock status
./system-restart-recovery.sh check-lock

# Force unlock (DANGEROUS - use only if stuck)
./system-restart-recovery.sh force-unlock

# Clear recovery logs
./system-restart-recovery.sh clean-logs
```

### Systemd Commands

```bash
# Start service
sudo systemctl start smt-verification

# Stop service
sudo systemctl stop smt-verification

# Restart service
sudo systemctl restart smt-verification

# Check status
sudo systemctl status smt-verification

# Enable on boot (if not already enabled)
sudo systemctl enable smt-verification

# Disable auto-start on boot
sudo systemctl disable smt-verification

# View logs
journalctl -u smt-verification -f

# View service unit file
systemctl cat smt-verification
```

## Lock Management

### How Locks Work

The system uses a lock file (`/var/run/smt-verification/system.lock`) to prevent multiple instances from running simultaneously.

### Lock States

```
✓ No Lock
  └─ System is free to start

⚠️  Active Lock (Process Running)
  ├─ If process is responsive → Wait
  └─ If process is dead → Clean up and restart

⏳ Stale Lock (Older than 1 hour)
  └─ Auto-remove and restart

🔒 Locked Process Dead
  ├─ Clean up orphaned lock
  └─ Restart system
```

### Manual Lock Management

#### Check Lock Status
```bash
./system-restart-recovery.sh check-lock
```

#### Handle Stale Lock
```bash
# Automatic - handled on startup
./system-restart-recovery.sh start
```

#### Force Unlock (Only if Stuck)
```bash
sudo ./system-restart-recovery.sh force-unlock
```

**Warning**: Only use force-unlock if:
- System is completely unresponsive
- Previous restart attempt failed
- You're sure no valid process is running

## Automatic Recovery Scenarios

### Scenario 1: Power Cut & System Restart

```
┌─ Power Cut
│
├─ System Restarts
│
├─ Systemd calls smt-verification.service
│
├─ Service runs system-restart-recovery.sh
│
├─ Script checks for locks:
│  ├─ If stale → Remove and continue
│  └─ If active → Check if process alive
│
├─ Acquire new lock
│
├─ Stop any running services
│
├─ Wait for database to be ready
│
├─ Start API server (port 3000)
│
├─ Start frontend app (port 5173)
│
├─ Health checks
│  ├─ API endpoint check
│  └─ Frontend availability check
│
└─ Log recovery completion
   ↓
System Back Online ✅
```

### Scenario 2: System Locked During Shutdown

```
┌─ System Shutdown (with lock active)
│
├─ Power Cut/Reboot
│
├─ System Restarts
│
├─ Systemd calls smt-verification.service
│
├─ Script detects active lock
│
├─ Checks if process still running
│  └─ Process not running (dead)
│
├─ Removes orphaned lock
│
├─ Starts fresh system
│
└─ System Online ✅
```

### Scenario 3: Service Crash During Operation

```
┌─ Service Crashes
│
├─ Systemd Restart Policy Triggered
│  (After 10 seconds)
│
├─ system-restart-recovery.sh restart called
│
├─ Stops current process
│
├─ Health checks database
│
├─ Starts fresh API server
│
├─ Verifies health
│
└─ Service Running Again ✅
```

## Health Checks

### Automatic Health Monitoring

The system has built-in health checks:

```bash
# API Health Check (HTTP /health endpoint)
curl http://localhost:3000/health

# Frontend Health Check (HTTP request)
curl http://localhost:5173

# Manual Health Check
./system-restart-recovery.sh status
```

### Health Check Results

```
✓ API Health: HEALTHY        → OK
✓ Frontend: HEALTHY          → OK
✓ Database: CONNECTED        → OK
⚠️  API Health: UNHEALTHY     → May retry
⚠️  Database: NOT CONNECTED   → Cannot start
```

### Cron-Based Health Monitoring

A cron job runs every 5 minutes to verify system health:

```bash
# View health check logs
tail -f /var/log/smt-verification/health-check.log

# Check health check cron job
sudo cat /etc/cron.d/smt-verification-health
```

## Logging

### Log Locations

```
/var/log/smt-verification/
├── restart-recovery.log      # Main recovery script logs
├── api-server.log            # API server stdout/stderr
├── app-server.log            # Frontend app stdout/stderr
└── health-check.log          # Cron health check results

/var/log/syslog               # System logs (search for smt-verification)
```

### View Logs

```bash
# View recovery logs
tail -f /var/log/smt-verification/restart-recovery.log

# View API server logs
tail -f /var/log/smt-verification/api-server.log

# View systemd journal
sudo journalctl -u smt-verification -f

# View all logs for service
sudo journalctl -u smt-verification --no-pager

# View logs since last boot
sudo journalctl -u smt-verification -b

# View with timestamps
sudo journalctl -u smt-verification -o short-iso
```

### Log Format

```
[2024-04-21 14:35:22] [INFO] Setting up required directories...
[2024-04-21 14:35:22] [SUCCESS] Directories ready
[2024-04-21 14:35:22] [INFO] Checking prerequisites...
[2024-04-21 14:35:22] [INFO] ✓ Node.js found: v18.14.0
```

## Troubleshooting

### System Won't Start

```bash
# Check service status
sudo systemctl status smt-verification

# View detailed logs
sudo journalctl -u smt-verification -n 50

# Check if port 3000 is in use
sudo lsof -i :3000

# Kill any stuck processes
sudo lsof -ti:3000 | xargs kill -9

# Try manual recovery
sudo /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/scripts/system-restart-recovery.sh recover
```

### Database Connection Failed

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Verify database exists
psql -l

# Check database credentials
grep DB_ /etc/default/smt-verification

# Test connection manually
psql -h localhost -U postgres -d smt_verification
```

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Force unlock and restart
sudo /path/to/system-restart-recovery.sh force-unlock
sudo systemctl restart smt-verification
```

### Lock File Stuck

```bash
# Check lock status
./system-restart-recovery.sh check-lock

# Remove stale lock (automatic on next start attempt)
sudo rm -f /var/run/smt-verification/system.lock

# Force unlock
sudo ./system-restart-recovery.sh force-unlock

# Restart service
sudo systemctl restart smt-verification
```

### Health Check Fails

```bash
# Check API directly
curl -v http://localhost:3000/health

# Check frontend directly
curl -v http://localhost:5173

# View health check logs
tail -f /var/log/smt-verification/health-check.log

# Check with more retries
curl --retry 5 --retry-delay 2 http://localhost:3000/health
```

## Performance Tuning

### Recovery Timeout

Edit `/etc/systemd/system/smt-verification.service`:

```ini
[Service]
TimeoutStartSec=300    # Increase from default 90 seconds
```

### Health Check Retries

Edit the script variable:

```bash
HEALTH_CHECK_RETRIES=10  # Increase from 5
```

### Startup Wait Time

Edit the script:

```bash
ExecStartPre=/bin/sleep 10  # Increase from 5 seconds
```

## Production Checklist

- [ ] Installation script ran successfully
- [ ] Service shows as enabled: `systemctl is-enabled smt-verification`
- [ ] Service can start: `sudo systemctl start smt-verification`
- [ ] Service can stop: `sudo systemctl stop smt-verification`
- [ ] Health checks pass: `./system-restart-recovery.sh status`
- [ ] Logs are being written: `tail /var/log/smt-verification/*.log`
- [ ] Cron health check is active: `sudo cat /etc/cron.d/smt-verification-health`
- [ ] Systemd journal is clean: `sudo journalctl -u smt-verification | head -20`
- [ ] Tested manual recovery: `./system-restart-recovery.sh recover`
- [ ] All required ports are available (3000, 5173)
- [ ] Database is accessible from boot
- [ ] Node.js and npm/pnpm are in system PATH

## Uninstallation

If you need to remove the auto-start configuration:

```bash
# Stop service
sudo systemctl stop smt-verification

# Disable service
sudo systemctl disable smt-verification

# Remove service file
sudo rm /etc/systemd/system/smt-verification.service

# Remove environment config
sudo rm /etc/default/smt-verification

# Remove health check cron
sudo rm /etc/cron.d/smt-verification-health

# Reload systemd
sudo systemctl daemon-reload

# Clean up directories (optional)
sudo rm -rf /var/log/smt-verification
sudo rm -rf /var/run/smt-verification
```

## Advanced Configuration

### Custom Database Connection

Edit `/etc/default/smt-verification`:

```bash
DB_HOST=your-remote-host
DB_USER=your-user
DB_NAME=your-database
DB_PORT=5432
```

Then restart:

```bash
sudo systemctl restart smt-verification
```

### Custom Ports

Edit the startup script to use different ports:

```bash
PORT=8080 ./system-restart-recovery.sh start
```

### Integration with Monitoring

Send recovery events to monitoring system:

```bash
# Edit system-restart-recovery.sh and add:
curl -X POST https://monitoring.example.com/alert \
  -d "system=smt-verification&event=recovered"
```

## Support

For issues or questions:
1. Check logs: `tail -f /var/log/smt-verification/restart-recovery.log`
2. Review this guide's troubleshooting section
3. Check systemd status: `systemctl status smt-verification`
4. Verify prerequisites are installed
5. Test manual commands first before relying on automation

## Related Documentation

- [QUICK_START.md](../QUICK_START.md) - Project setup
- [DEPLOYMENT_SETUP.md](../docs/setup/DEPLOYMENT_SETUP.md) - Production deployment
- [API_REFERENCE.md](../docs/guides/API_REFERENCE.md) - API endpoints
