# Frontend 500 Error - Root Cause & Fix

## Problem
```
[vite] connecting...
:5173/src/App.tsx:1 Failed to load resource: the server responded with a status of 500 (Internal Server Error)
[vite] connected.
```

**Root Cause:** Missing `src/hooks/useAuth.ts` file that was imported but never created.

## Error Details
```
[vite] Internal server error: Failed to resolve import "./hooks/useAuth" from "src/App.tsx". 
Does the file exist?

File: .../mockup-sandbox/src/App.tsx:4:24
6  |  import { useAuth } from "./hooks/useAuth";
```

## Solution

### Created: `src/hooks/useAuth.ts`
A new authentication hook that provides:
- `isLoggedIn` - boolean flag for login state
- `user` - User object with id, email, name, role
- `loading` - boolean for login operation state
- `login(email, password)` - async login function
- `logout()` - logout function

**Features:**
- Mock authentication for development/prototyping
- localStorage persistence for user session
- TypeScript types for type safety
- Ready for integration with real auth service

### Code:
```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export function useAuth(): UseAuthReturn {
  // Returns { isLoggedIn, user, loading, login, logout }
}
```

## Verification

✅ **After Fix:**
- Frontend server: Running on port 5174 (5173 was occupied)
- Vite dev server: Ready in 6.5 seconds
- No import errors
- HMR (Hot Module Reload) working
- App.tsx loading successfully

## Access Points

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:5174/ | ✅ Running |
| API Server | http://localhost:3001/api/... | ✅ Running |

## Files Modified

1. **Created:** `/artifacts/mockup-sandbox/src/hooks/useAuth.ts` (65 lines)
2. **Fixed in:** `restart-servers.sh` - proper environment variable passing

## Testing

Access http://localhost:5174/ in your browser - app should load without errors.

---

**Status:** ✅ FIXED  
**Date:** April 20, 2026  
**Commit:** Added useAuth hook implementation
