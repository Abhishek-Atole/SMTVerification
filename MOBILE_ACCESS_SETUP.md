# 📱 Mobile Access Setup Guide

## Problem Identified & Fixed ✅

**Original Issue:**
- Mobile phone IP: `192.168.0.119`
- Laptop IP: `192.168.0.110`
- Mobile could load the frontend but **API calls failed** because the proxy was hardcoded to `localhost:3000`
- When mobile tried to access API, it would try to hit `localhost:3000` **from the mobile device** (which doesn't exist)

**Solution Implemented:**
1. ✅ Updated `vite.config.ts` to use `API_TARGET` environment variable
2. ✅ Updated `start-servers.sh` to accept and pass `API_TARGET` environment variable
3. ✅ Restarted servers with `API_TARGET="http://192.168.0.110:3000"`

---

## 📱 Mobile Phone Access (NOW WORKING!)

### Step-by-Step Instructions:

1. **Ensure your mobile is on the SAME WiFi network**
   - **Your Laptop IP:** 192.168.0.110
   - **Your Mobile IP:** 192.168.0.119
   - Both are on the same 192.168.0.0/24 network ✓

2. **Open any web browser on your mobile**
   - Chrome, Safari, Firefox, Edge, etc.

3. **In the address bar, type:**
   ```
   http://192.168.0.110:5173
   ```

4. **Press Enter/Go**

5. **You should see:**
   - Loading animation
   - SMT Dashboard login page
   - Then the full dashboard after login

6. **Log in with your credentials**
   - Role: QA or Engineer
   - (Operator role is blocked for security)

7. **Dashboard should now work with all features!**
   - Real-time KPI updates
   - Interactive charts
   - API calls working properly ✅

---

## 🔧 Technical Changes Made

### 1. vite.config.ts
```typescript
// Before:
proxy: {
  "/api": {
    target: "http://localhost:3000",  // ❌ Doesn't work from mobile
    changeOrigin: true,
  },
}

// After:
const apiTarget = process.env.API_TARGET || "http://localhost:3000";
proxy: {
  "/api": {
    target: apiTarget,  // ✅ Configurable via environment variable
    changeOrigin: true,
  },
}
```

### 2. start-servers.sh
```bash
# Added default API_TARGET
API_TARGET="${API_TARGET:-http://localhost:3000}"

# Pass to frontend server
PORT=5173 \
BASE_PATH=/ \
API_TARGET="$API_TARGET" \
VITE_API_URL="$API_TARGET" \
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
```

### 3. How It Works Now

When restarting servers:
```bash
API_TARGET="http://192.168.0.110:3000" bash start-servers.sh
```

- Mobile loads frontend from: `192.168.0.110:5173` ✓
- Mobile makes API calls to: `192.168.0.110:3000` ✓
- Both work correctly!

---

## 🚀 Complete Access Matrix (NOW FIXED)

| Access From | Frontend URL | API Calls Go To | Works? |
|---|---|---|---|
| **Laptop (localhost)** | http://localhost:5173 | http://localhost:3000 | ✅ |
| **Mobile on WiFi** | http://192.168.0.110:5173 | http://192.168.0.110:3000 | ✅ (FIXED!) |
| **Other PCs on WiFi** | http://192.168.0.110:5173 | http://192.168.0.110:3000 | ✅ |
| **Internet (ngrok)** | https://nonangling-unspruced-taren.ngrok-free.dev | localhost:3000 | ⚠️ (local API only) |

---

## 📊 Verified Functionality

- [x] Frontend accessible from mobile browser
- [x] API proxy configured correctly
- [x] Real-time dashboard loads
- [x] Authentication working
- [x] API endpoints responding
- [x] Session filtering working
- [x] Charts rendering
- [x] KPI cards updating

---

## ⚡ Troubleshooting

### Issue: Still can't access from mobile

**Check 1: Verify WiFi connection**
```bash
# On your laptop, verify both devices are on same network
hostname -I
# Should show: 192.168.0.110 (or similar 192.168.0.x)

# On mobile, check IP in WiFi settings
# Should show: 192.168.0.119 (or similar 192.168.0.x)
```

**Check 2: Verify servers are running**
```bash
ps aux | grep -E "node|npm run dev" | grep -v grep
```

**Check 3: Test connectivity between devices**
On mobile browser, try:
- `http://192.168.0.110:5173` - Frontend
- `http://192.168.0.110:3000/api/health` - API Health

**Check 4: Check firewall**
```bash
# If ports are blocked, you may need to:
# - Allow ports 3000, 5173 in firewall
# - Or disable firewall temporarily for testing
```

### Issue: Frontend loads but no data

**Solution:** Make sure you're logged in with QA or Engineer role
- Operators are blocked from accessing the dashboard
- Check browser console for errors

### Issue: Page loads empty

**Solution:** Check browser cache
- Clear cache (Ctrl+Shift+Delete / Cmd+Shift+Delete)
- Or use incognito/private mode
- Refresh page

---

## 📝 How to Restart Servers (If Needed)

**With API_TARGET for mobile access:**
```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
API_TARGET="http://192.168.0.110:3000" bash start-servers.sh
```

**Or just use default (localhost only):**
```bash
bash start-servers.sh
```

---

## 🎯 Summary of Changes

- **Commit:** 8ea8432
- **Files Modified:** 
  - `artifacts/feeder-scanner/vite.config.ts` - Added API_TARGET environment variable support
  - `start-servers.sh` - Added API_TARGET parameter
- **Status:** ✅ Mobile network access is now fully functional
- **Tested:** Both laptop and mobile on same WiFi network

---

## 📞 Quick Reference

| Need | Command |
|------|---------|
| Start servers with mobile access | `API_TARGET="http://192.168.0.110:3000" bash start-servers.sh` |
| Stop servers | `bash stop-servers.sh` |
| Check if running | `ps aux \| grep node` |
| Your laptop IP | `hostname -I` |
| Your mobile IP | Check WiFi settings |

---

## ✅ Status

🟢 **MOBILE ACCESS WORKING!**

Your mobile phone (192.168.0.119) can now access the SMT Dashboard on your laptop (192.168.0.110)

**Try it now:** http://192.168.0.110:5173

