# 🌐 Network Access Guide - SMT Dashboard

## System Information

- **Machine IP Address:** `10.83.113.10`
- **Dashboard Port:** `5173` (Frontend)
- **API Port:** `3000` (Backend)
- **Database:** PostgreSQL (localhost:5432)

---

## 📱 Access Methods

### 1. **Local Access (Same Machine)**
Best for development and testing on the machine hosting the system.

```
Frontend: http://localhost:5173
API:      http://localhost:3000
```

### 2. **Local Network Access (LAN - Other PCs on Same Network)**
Access from other computers connected to the same network.

```
Frontend: http://10.83.113.10:5173
API:      http://10.83.113.10:3000
```

**Requirements:**
- Other PC must be on the same network (Wi-Fi or LAN)
- Ports 5173 and 3000 must not be blocked by firewall
- Modern web browser (Chrome, Firefox, Safari, Edge)

### 3. **Remote Access (Internet - ngrok Tunnel)**
Access from anywhere on the internet via ngrok.

```
Frontend: https://nonangling-unspruced-taren.ngrok-free.dev
```

**Note:** API is not exposed via ngrok. Frontend handles requests to local API automatically.

---

## 🔐 Authentication

All access methods require credentials:

| Role | Dashboard Access | API Access |
|------|------------------|-----------|
| **QA** | ✅ Full access | ✅ All endpoints |
| **Engineer** | ✅ Full access | ✅ All endpoints |
| **Operator** | ❌ Blocked (403) | ❌ Blocked (401) |

---

## 🚀 How to Access from Another PC (Step-by-Step)

### On Another PC Connected to Same Network:

1. Open a web browser (Chrome, Firefox, Safari, etc.)
2. In the address bar, type:
   ```
   http://10.83.113.10:5173
   ```
3. Press Enter
4. You should see the SMT Dashboard login page
5. Enter your QA or Engineer credentials
6. Dashboard will load with real-time data

### Via Command Line:

**Mac/Linux/WSL:**
```bash
curl http://10.83.113.10:5173
```

**Windows (PowerShell):**
```powershell
Invoke-WebRequest http://10.83.113.10:5173
```

---

## ✅ Verification Checklist

- [x] Frontend server running on port 5173
- [x] API server running on port 3000
- [x] Listening on network interface (0.0.0.0)
- [x] ngrok tunnel active
- [x] Database connectivity verified
- [x] Security middleware enforcing role-based access
- [x] All 9 dashboard endpoints responding
- [x] Real-time polling configured (2-second intervals)

---

## 🔧 Troubleshooting

### Issue: "Connection Refused" / "Server Not Responding"

**Check if servers are running:**
```bash
ps aux | grep -E "node|vite" | grep -v grep
```

**If not running, start servers:**
```bash
bash start-servers.sh
```

### Issue: "Unauthorized - please login"

**This is normal!** The API requires authentication. The frontend handles login automatically.

### Issue: "Connection Timed Out"

**Possible causes:**
1. Firewall blocking ports 5173 or 3000
   - Whitelist ports: 5173, 3000

2. PC not on same network
   - Both PCs must be on same Wi-Fi or LAN

3. IP address changed
   - Run `hostname -I` to verify current IP

---

## 📊 Features Available

After logging in with QA or Engineer credentials:

- **Real-Time KPIs:** 7 key performance indicators
- **Interactive Charts:** 4 visualizations (Pie, Bar, Line, Component)
- **Session Tabs:** Switch between different scan sessions
- **Real-time updates:** Every 2 seconds
- **Performance Metrics:** Verification rates, defect rates, efficiency

---

## 📝 Last Updated

- **Date:** April 15, 2026
- **System:** SMT Verification Dashboard
- **Status:** ✅ All access methods verified and working
