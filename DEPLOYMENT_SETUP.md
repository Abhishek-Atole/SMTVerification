# SMT Verification Auto-Start Configuration

To automatically start the SMT Verification servers on machine restart, add this line to your crontab:

```bash
@reboot /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/start-servers.sh
```

## Setup Instructions:

### Option 1: Using Crontab (Recommended for regular user)

1. Open crontab editor:
```bash
crontab -e
```

2. Add this line at the end:
```bash
@reboot /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/start-servers.sh
```

3. Save and exit (Ctrl+X, then Y, then Enter if using nano)

### Option 2: Manual Startup Script

Run the script manually anytime you need to start the servers:

```bash
/media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/start-servers.sh
```

### Option 3: Stop Servers

To stop all servers:

```bash
/media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/stop-servers.sh
```

## Verification

After setup, the servers will:
- Start automatically when the machine boots
- Be available at:
  - API: http://localhost:3000
  - Frontend: http://localhost:5173
- Log output to:
  - API logs: /var/log/smtverify-api.log
  - Frontend logs: /var/log/smtverify-frontend.log

## Manual Commands

**Start servers manually:**
```bash
/media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/start-servers.sh
```

**Stop servers:**
```bash
/media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/stop-servers.sh
```

**Check if running:**
```bash
ps aux | grep -E "node.*index.mjs|npm run dev" | grep -v grep
```

**View API logs:**
```bash
tail -f /var/log/smtverify-api.log
```

**View Frontend logs:**
```bash
tail -f /var/log/smtverify-frontend.log
```
