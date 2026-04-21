# 🌐 Network Access Guide - SMT Dashboard

## System Information

- **Primary Network IP:** `192.168.0.110`
- **Dashboard Port:** `5173` (Frontend)
- **API Port:** `3000` (Backend)
- **Database:** PostgreSQL (localhost:5432)
- **Network:** 192.168.0.0/24 (Wi-Fi network)

---

## 📱 Access Methods

### 1. **Local Access (Same Machine)**
Best for development and testing on the machine hosting the system.

```
Frontend: http://localhost:5173
API:      http://localhost:3000
```

### 2. **Local Network Access (LAN - Mobile & Other PCs on Same Wi-Fi)**
Access from other devices connected to **192.168.0.0** network.

```
Frontend: http://192.168.0.110:5173
API:      http://192.168.0.110:3000
```

**Requirements:**
- Device must be connected to the **SAME Wi-Fi network** (critical!)
- Ports 5173 and 3000 must not be blocked
- Modern web browser (Chrome, Firefox, Safari, Edge)

### 3. **Remote Access (Internet - ngrok Tunnel)**
Access from anywhere on the internet via ngrok.

```
Frontend: https://nonangling-unspruced-taren.ngrok-free.dev
```

---

## 🔐 Authentication

All access methods require credentials:

| Role | Dashboard Access | API Access |
|------|------------------|-----------|
| **QA** | ✅ Full access | ✅ All endpoints |
| **Engineer** | ✅ Full access | ✅ All endpoints |
| **Operator** | ❌ Blocked (403) | ❌ Blocked (401) |

---

## 📱 Mobile Phone Access (Step-by-Step)

### On Your Mobile Phone:

1. **Connect to the SAME Wi-Fi network** as your computer
   - Network name should match your computer's Wi-Fi SSID
   
2. **Open any web browser** (Chrome, Safari, Firefox, Edge, etc.)

3. **In the address bar, type:**
   ```
   http://192.168.0.110:5173
   ```

4. **Press Enter/Go**

5. **You should see the login page**

6. **Enter QA or Engineer credentials**

7. **Dashboard loads with real-time data!** ✅

### Important Notes:
- ⚠️ Make sure you're on **Wi-Fi**, not mobile data (4G/5G)
- ⚠️ Must be same network as computer (192.168.0.x)
- ⚠️ Include the port number **:5173** (don't forget!)
- ⚠️ Use **http://** not https:// (ngrok uses https)

---

## 🖥️ Other PCs on Same Network

Same instructions as mobile - use `http://192.168.0.110:5173`

---

## ✅ Verification Checklist

- [x] Frontend server running on port 5173
- [x] API server running on port 3000
- [x] Listening on all network interfaces (0.0.0.0)
- [x] Network IP correctly identified: 192.168.0.110
- [x] ngrok tunnel active for internet access
- [x] Database connectivity verified
- [x] Security middleware enforcing role-based access
- [x] Real-time polling configured (2-second intervals)

---

## 🔧 Troubleshooting

### Issue: "Connection Refused" / "Server Not Responding"

**Don't use 10.83.113.10 - that's a Docker/virtual interface!**

**Use the correct IP: 192.168.0.110**

**Check if servers are running:**
```bash
ps aux | grep -E "node|vite" | grep -v grep
```

**If not running, start servers:**
```bash
bash start-servers.sh
```

### Issue: "Connection Timed Out" on Mobile

**Cause: Phone is not on the same Wi-Fi network**

**Solution:**
1. Go to phone settings
2. Check Wi-Fi connection
3. Make sure it's the same SSID/network name as your computer
4. Disconnect from mobile data (4G/5G)
5. Try again: `http://192.168.0.110:5173`

### Issue: Can't find the right Wi-Fi network

**Run on your computer:**
```bash
iwconfig 2>/dev/null | grep SSID
# or
nmcli device wifi list
# or check in your OS network settings
```

Then connect your phone to the same network.

### Issue: "Unauthorized - please login"

**This is normal!** The API requires authentication. 
- The frontend handles login automatically
- Make sure you're accessing via **port 5173** (not port 3000)
- Log in with QA or Engineer credentials

### Issue: Page loads but empty/no data

**Check:**
1. Are you logged in with QA or Engineer role?
2. Is the database connected? Check API at: `http://192.168.0.110:3000/api/health`
3. Restart servers: `bash start-servers.sh`

---

## 📊 Network Configuration

Your system is on **192.168.0.0/24** network:

| Device | IP | Notes |
|--------|-----|-------|
| Your Computer | 192.168.0.110 | Primary - use this for all access |
| Router/Gateway | 192.168.0.1 | Network gateway |
| Your Mobile | 192.168.x.x | Must be same 192.168.0.x range |
| Docker Bridge | 192.168.122.1 | Internal only |
| Docker Network | 172.17.0.1 | Internal only |

---

## 🌍 Access URLs Summary

| Endpoint | URL | From | Status |
|----------|-----|------|--------|
| **Frontend** | http://localhost:5173 | Your Computer | ✅ |
| **Frontend** | http://192.168.0.110:5173 | Same Wi-Fi Network | ✅ |
| **Frontend (ngrok)** | https://nonangling-unspruced-taren.ngrok-free.dev | Internet | ✅ |
| **API** | http://localhost:3000 | Your Computer | ✅ |
| **API** | http://192.168.0.110:3000 | Same Wi-Fi Network | ✅ |

---

## 📝 Last Updated

- **Date:** April 15, 2026
- **System:** SMT Verification Dashboard
- **Network IP:** 192.168.0.110 (CORRECTED)
- **Status:** ✅ All access methods verified and working

---

## 📞 Quick Troubleshooting Command

Run this on your computer to get all access URLs:

```bash
echo "=== Your Dashboard Access URLs ===" && \
echo "Localhost: http://localhost:5173" && \
echo "Network:   http://192.168.0.110:5173" && \
echo "Internet:  https://nonangling-unspruced-taren.ngrok-free.dev"
```
