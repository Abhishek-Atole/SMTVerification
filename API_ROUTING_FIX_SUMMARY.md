# API Routing Issue - Complete Resolution

## Issue Summary
Browser console showed repeated error:
```
[API] GET /trash/stats error: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```
This occurred in both **trash-bin.tsx** and **dashboard.tsx** components.

## Root Cause Analysis

### The Problem
The Vite dev server was returning HTML (index.html) instead of proxying to the API backend. When JavaScript tried to parse HTML as JSON, it failed with: "Unexpected token '<'"

### Why It Happened
All API calls in frontend components were **missing the `/api` prefix**, causing requests to:
- Request path: `/trash/items` (WRONG)
- Expected path: `/api/trash/items` (CORRECT)

Without the `/api` prefix, Vite's dev server couldn't match the proxy rule and returned the default fallback: HTML index page.

## Files Fixed

### 1. `artifacts/feeder-scanner/src/pages/trash-bin.tsx`
**4 API calls fixed:**
```typescript
// BEFORE (Lines 72, 93, 106, 126)
api.get("/trash/items")                                    ❌
api.get("/trash/stats")                                    ❌
api.post(`/trash/${item.type}/${item.id}/recover`)         ❌
api.delete(`/trash/${item.type}/${item.id}`)               ❌

// AFTER
api.get("/api/trash/items")                               ✓
api.get("/api/trash/stats")                               ✓
api.post(`/api/trash/${item.type}/${item.id}/recover`)    ✓
api.delete(`/api/trash/${item.type}/${item.id}`)          ✓
```

### 2. `artifacts/feeder-scanner/src/pages/dashboard.tsx`
**2 API calls fixed:**
```typescript
// BEFORE (Lines 70, 83)
api.get("/trash/items", {...})                            ❌
api.get("/trash/stats")                                    ❌

// AFTER
api.get("/api/trash/items", {...})                       ✓
api.get("/api/trash/stats")                               ✓
```

## How Vite Proxy Works

**vite.config.ts proxy configuration:**
```typescript
proxy: {
  "/api": {
    target: "http://localhost:3000",
    changeOrigin: true,
  },
}
```

**Request Flow:**
1. Browser requests: `http://localhost:5173/api/trash/stats`
2. Vite matches `/api` prefix in proxy rule ✓
3. Vite forwards to: `http://localhost:3000/api/trash/stats`
4. Backend returns JSON with `Content-Type: application/json`
5. Frontend successfully parses JSON ✓

**What Was Happening Before:**
1. Browser requests: `http://localhost:5173/trash/stats` (missing `/api`)
2. Vite cannot match any proxy rule ✗
3. Vite returns default: `index.html` with `Content-Type: text/html`
4. Frontend tries to parse HTML as JSON ✗ → **Error!**

## Verification Results

✓ **Dashboard Component:** 2 API calls fixed  
✓ **TrashBin Component:** 4 API calls fixed  
✓ **Total Fixed:** 6 API calls  
✓ **Frontend Hot Reload:** Confirmed at 3:15:39 AM  
✓ **API Endpoints:** All responding with 200 OK + JSON  
✓ **Trash Data:** Successfully returning 5 items  
✓ **Browser Console:** No more "Unexpected token" errors  

## Technical Details

### API Response Structure
```json
{
  "totalCount": 5,
  "bomCount": 0,
  "itemCount": 0,
  "sessionCount": 5,
  "items": [
    { "id": 1, "name": "...", "type": "session", "deletedAt": "...", ... }
  ]
}
```

### Content-Type Headers
- **Correct:** `Content-Type: application/json; charset=utf-8`
- **Was Returning:** `Content-Type: text/html` (wrong!)

## Prevention Measures

1. **Use TypeScript Enums for API Paths:** Define API endpoints as constants
```typescript
const API_ENDPOINTS = {
  TRASH_ITEMS: "/api/trash/items",
  TRASH_STATS: "/api/trash/stats",
  TRASH_RECOVER: (type: string, id: number) => `/api/trash/${type}/${id}/recover`,
  TRASH_DELETE: (type: string, id: number) => `/api/trash/${type}/${id}`,
} as const;
```

2. **Linting Rule:** Add ESLint rule to catch API calls without `/api/` prefix

3. **Code Review Checklist:**
   - Verify all API calls include `/api` prefix
   - Test both direct backend (port 3000) and proxy (port 5173)
   - Monitor browser network tab for correct proxy routing

## Testing Checklist

- ✓ Trash statistics load in dashboard
- ✓ Trash items display in dashboard preview
- ✓ Dedicated trash bin page loads without errors
- ✓ All deleted items visible in trash table
- ✓ Recover functionality available
- ✓ Delete functionality available
- ✓ Search/filter operations working
- ✓ Real-time updates every 5 seconds
- ✓ No console errors or warnings

## Lessons Learned

1. **Always verify proxy configuration matches your API paths**
2. **When seeing HTML in JSON parser error, check URL paths first**
3. **Development proxy rules are hidden from developers - document them clearly**
4. **Test with both direct backend URL and proxy URL during development**
5. **Use consistent API path patterns across all components**

## Resolution Status: ✅ COMPLETE

All API routing issues resolved. System fully operational.
No errors in browser console. All trash bin functionality working.
