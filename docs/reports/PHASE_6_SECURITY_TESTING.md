# Phase 6: Security & Access Control Testing Guide

## Role-Based Access Control (RBAC) Overview

### Allowed Roles

- ✅ **Engineer:** Full access to dashboard (create sessions, view analytics, manage BOMs)
- ✅ **QA:** Full access to dashboard (view analytics, verification records, alarms)
- ❌ **Operator:** NO access to dashboard (can only operate actual scanning)

### Security Objectives

1. Backend API rejects unauthorized requests with 403 Forbidden
2. Frontend hides dashboard navigation link from operators
3. Frontend blocks direct URL access to dashboard for operators
4. Session data only shows sessions accessible to user's role

---

## Backend Security Implementation

### Current State

Dashboard endpoints in `artifacts/api-server/src/routes/dashboard.ts` lack role-based middleware.

### Required Implementation

**Add to dashboard.ts before endpoint definitions (after line 10):**

```typescript
// Security middleware - only allow QA and Engineer roles
const requireQAOrEngineer = (req: any, res: any, next: any) => {
  const user = (req as any).user; // Assumes auth middleware sets this
  
  if (!user) {
    return res.status(401).json({ error: "Unauthorized - please login" });
  }
  
  if (!['qa', 'engineer'].includes(user.role)) {
    req.log.warn({ userId: user.id, role: user.role }, "Unauthorized dashboard access attempt");
    return res.status(403).json({ error: "Forbidden - access denied for your role" });
  }
  
  next();
};

// Apply middleware to all dashboard routes
router.use(requireQAOrEngineer);
```

### Testing Backend Security

#### Test 1: Engineer User Access

```bash
# Simulate engineer user request
curl -H "Cookie: auth_token=<engineer_token>" \
  http://localhost:3000/api/dashboard/kpi?sessionId=1

# Expected: 200 OK with data
```

#### Test 2: QA User Access

```bash
# Simulate QA user request
curl -H "Cookie: auth_token=<qa_token>" \
  http://localhost:3000/api/dashboard/alarms?sessionId=1

# Expected: 200 OK with data
```

#### Test 3: Operator User Denied

```bash
# Simulate operator user request
curl -H "Cookie: auth_token=<operator_token>" \
  http://localhost:3000/api/dashboard/kpi?sessionId=1

# Expected: 403 Forbidden
# Response: { error: "Forbidden - access denied for your role" }
```

#### Test 4: Unauthenticated Access

```bash
# No token
curl http://localhost:3000/api/dashboard/kpi?sessionId=1

# Expected: 401 Unauthorized
# Response: { error: "Unauthorized - please login" }
```

---

## Frontend Security Implementation

### Navigation Link Security ✅ Already Implemented

**File:** `artifacts/feeder-scanner/src/components/layout.tsx`

Navigation item has role filter:

```typescript
{ 
  href: "/real-time-dashboard", 
  label: "Real-Time Dashboard", 
  icon: TrendingUp, 
  roles: ["engineer", "qa"]  // ← Operators excluded
}
```

**Result:** Operators don't see dashboard link in sidebar.

### URL Direct Access Protection

**Add to real-time-dashboard.tsx (after line 11, before useQuery calls):**

```typescript
// Protect page from direct URL access by non-authorized users
const { user } = useAuth();

if (!user) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">Please log in to access this dashboard.</p>
      </div>
    </div>
  );
}

if (!['qa', 'engineer'].includes(user.role)) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
      <AlertTriangle className="w-12 h-12 text-destructive" />
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">
          You don't have permission to access the Real-Time Dashboard.
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    </div>
  );
}
```

**Required imports:** `AlertTriangle` from lucide-react (already available)

### Testing Frontend Security

#### Test 1: Navigate as Engineer

1. Log in as engineer user
2. Check sidebar → "Real-Time Dashboard" link visible ✓
3. Click link → Dashboard loads, displays data ✓
4. Refresh page → Still displays data ✓

#### Test 2: Navigate as QA

1. Log in as QA user
2. Check sidebar → "Real-Time Dashboard" link visible ✓
3. Click link → Dashboard loads, displays data ✓
4. Refresh page → Still displays data ✓

#### Test 3: Navigate as Operator

1. Log in as operator user
2. Check sidebar → "Real-Time Dashboard" link should NOT be visible ✗ OR visible but disabled
3. Try direct URL: `http://localhost:5173/real-time-dashboard`
   - With route guard: Shows "Access Denied" message ✓
   - Without route guard: Loads empty dashboard + API returns 403 errors ⚠️

#### Test 4: Session Selector Permission

Verify operators CAN see other dashboards (main dashboard shows all sessions for planning):

- Main dashboard `/` is accessible to operators
- Real-time analytics dashboard `/real-time-dashboard` is NOT accessible
- Session history `/sessions` is accessible to operators (historical view)

---

## Security Testing Checklist

### Backend Tests

- [ ] **401 Unauthenticated:** No token → returns 401 Unauthorized
- [ ] **403 Operator:** Operator token → returns 403 Forbidden
- [ ] **200 Engineer:** Engineer token → returns 200 with data
- [ ] **200 QA:** QA token → returns 200 with data
- [ ] **All 9 endpoints:** Test each endpoint with operator token → all return 403
- [ ] **Session filtering:** Engineer only sees their assigned sessions (if implemented)

### Frontend Tests

- [ ] **Link visibility:** Engineer sees link ✓, Operator doesn't see link ✓
- [ ] **Direct URL (Engineer):** Navigate to `/real-time-dashboard` → dashboard loads ✓
- [ ] **Direct URL (QA):** Navigate to `/real-time-dashboard` → dashboard loads ✓
- [ ] **Direct URL (Operator):** Navigate to `/real-time-dashboard` → shows "Access Denied" ✓
- [ ] **API Error handling:** Operator gets 403 from API → frontend shows error gracefully ✓
- [ ] **Session selector:** Only shows sessions user has access to ✓

### Integration Tests

- [ ] **Logout/relogin:** Engineer logout → login as operator → no dashboard access ✓
- [ ] **Session persistence:** Refresh page as engineer → remains authenticated ✓
- [ ] **Error recovery:** API returns 500 → dashboard shows error message, not crash ✓
- [ ] **Role change:** Admin changes user role → requires re-login to take effect ✓

---

## Audit Logging

### Events to Log

Add logging for all security-sensitive events:

```typescript
// In backend middleware (dashboard.ts)
req.log.info({
  userId: user.id,
  userRole: user.role,
  endpoint: req.path,
  method: req.method,
  timestamp: new Date().toISOString(),
}, "Dashboard accessed");

// For denied access
req.log.warn({
  userId: user.id,
  userRole: user.role,
  endpoint: req.path,
  timestamp: new Date().toISOString(),
}, "Unauthorized dashboard access attempt");
```

### Log Analysis

Monitor logs for:

- Repeated 403 errors from same user → possible account compromise
- Multiple failed authorization attempts → possible attack
- Unusual access patterns → suspicious behavior

---

## Compliance Checklist

- [ ] **Authentication:** All endpoints require valid auth token
- [ ] **Authorization:** Only QA/Engineer can access dashboard endpoints
- [ ] **Audit trail:** All access attempts logged with timestamp, user ID, role
- [ ] **Error handling:** No sensitive data leaked in error messages
- [ ] **HTTPS:** API uses HTTPS in production (configure in deployment)
- [ ] **CORS:** Only allow requests from frontend domain (configure in production)
- [ ] **Rate limiting:** Consider adding rate limiting to prevent brute force attacks
- [ ] **Data validation:** All query parameters validated before use

---

## Security Best Practices

### Already Implemented ✓

- Role-based access control
- Session-based authentication
- Error messages don't reveal system internals

### Recommended Improvements

1. **API Key rotation:** Regularly rotate session tokens
2. **Two-factor authentication:** For sensitive accounts (optional)
3. **IP whitelist:** Restrict dashboard access to specific IP ranges (optional)
4. **Rate limiting:** Prevent abuse of dashboard endpoints
5. **HTTPS/TLS:** Ensure all traffic is encrypted
6. **CORS hardening:** Restrict to known frontend domains
7. **Security headers:** Add to all responses
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - X-XSS-Protection: 1; mode=block

---

## Test Environment Setup

### Option 1: Manual Testing

1. Start backend: `npm run dev` (in api-server)
2. Start frontend: `npm run dev` (in feeder-scanner)
3. Create test users: engineer, qa, operator
4. Follow test cases above

### Option 2: Automated Testing (Future)

```typescript
// Example Jest test
describe("Dashboard Security", () => {
  it("should return 403 for operator users", async () => {
    const response = await fetch(
      "http://localhost:3000/api/dashboard/kpi",
      {
        headers: { "Authorization": `Bearer ${operatorToken}` }
      }
    );
    expect(response.status).toBe(403);
  });

  it("should return 200 for engineer users", async () => {
    const response = await fetch(
      "http://localhost:3000/api/dashboard/kpi",
      {
        headers: { "Authorization": `Bearer ${engineerToken}` }
      }
    );
    expect(response.status).toBe(200);
  });
});
```

---

## Post-Implementation Sign-Off

- [ ] Security middleware added to dashboard routes
- [ ] Route guard added to real-time-dashboard.tsx
- [ ] All 9 endpoints tested with unauthorized users (403)
- [ ] All 9 endpoints tested with authorized users (200)
- [ ] Navigation link hidden from operators
- [ ] Direct URL access blocked for operators
- [ ] Audit logs configured
- [ ] No sensitive data in error messages
- [ ] All tests passing
- [ ] Security review approved

---

## Questions & Support

Contact: [Security Team / Project Lead]
Documentation: See DASHBOARD_IMPLEMENTATION_COMPLETE.md
Support Channel: [Slack #security or email]
