# Free Scan Mode - Complete Implementation Guide

## Overview

Free Scan Mode allows users to create verification sessions and scan feeders/spools **without requiring BOM validation**. This enhancement provides flexibility for scenarios where:

- Users want to quickly verify feeder conditions
- BOM information is not immediately available
- Manual verification is needed independent of production orders

## Feature Implementation

### 1. Frontend (User Interface)

**File:** [artifacts/feeder-scanner/src/pages/session-new.tsx](artifacts/feeder-scanner/src/pages/session-new.tsx)

**Changes:**

- Added checkbox: "Free Scan Mode (scan without BOM validation)"
- BOM selector conditionally hidden when free scan mode is enabled
- Session creation button logic:
  - Enabled when: `freeScanMode = true` OR `bomId selected`
  - Disabled when: `freeScanMode = false` AND `bomId empty`
- Sends `bomId: 0` to backend when free scan mode is active

**Key Code:**

```typescript
const [freeScanMode, setFreeScanMode] = useState(false);

// Validation
if (!freeScanMode && !bomId) return alert("Please select a BOM or enable Free Scan Mode");

// Session creation payload
bomId: freeScanMode ? 0 : Number(bomId)

// Button state
disabled={createSession.isPending || (!freeScanMode && !bomId)}
```

### 2. Backend (API Server)

**File:** [artifacts/api-server/src/routes/sessions.ts](artifacts/api-server/src/routes/sessions.ts)

**Changes:**

- Modified validation to allow `bomId = 0` by checking `bomId == null` instead of `!bomId`
- Converts `bomId = 0` to `NULL` before database insert:

  ```typescript
  bomId = bomId === 0 ? null : bomId;
  ```

- Conditional BOM lookup: only queries BOM details if `bomId !== null`
- Returns session with `bomId: null` for free scan sessions

**Key Logic:**

```typescript
// Accept bomId = 0
if (bomId == null || !companyName || !panelName || !supervisorName || !operatorName || !shiftName || !shiftDate) {
    return res.status(400).json({ error: "Missing required fields" });
}

// Convert 0 to null
if (bomId === 0) bomId = null;

// Conditional BOM lookup
if (bomId !== null) {
    const bom = await getBOM(bomId);
    // ... validate BOM
}
```

### 3. Database Schema

**Changes:**

- Made `bomId` column **nullable** in `sessions` table
- Migration command:

  ```sql
  ALTER TABLE sessions ALTER COLUMN bom_id DROP NOT NULL;
  ALTER TABLE sessions ADD CONSTRAINT fk_bom_id FOREIGN KEY (bom_id) REFERENCES boms(id) ON DELETE SET NULL;
  ```

- Free scan sessions store `NULL` for `bom_id`

### 4. API Schema (OpenAPI/Zod)

**Changes:**

- Regenerated API client with `bomId?: number` (optional)
- OpenAPI schema removed `bomId` from required fields
- Zod validators updated to allow optional `bomId`

## Deployment & Auto-Start

### Production Deployment Scripts

Both scripts are in the project root directory.

**start-servers.sh**

- Automatically starts API server (port 3000) and Frontend server (port 5173)
- Creates `./logs/` directory for output
- Logs both servers to separate files for debugging
- Can be added to crontab for automatic startup on machine boot:

  ```bash
  @reboot /path/to/SMTVerification/start-servers.sh
  ```

**stop-servers.sh**

- Safely terminates both servers
- Kills Node.js processes gracefully

### Manual Server Startup (Development)

```bash
# From project root
pnpm install
pnpm build

# Start API server
cd artifacts/api-server
node build/index.js

# In new terminal - Start Frontend
cd artifacts/feeder-scanner
npm run dev
```

## Testing & Verification

### Free Scan Mode Session Creation

**Endpoint:** `POST /api/sessions`

**Request (Free Scan Mode):**

```json
{
  "bomId": 0,
  "companyName": "Test Company",
  "panelName": "Panel-001",
  "supervisorName": "John Supervisor",
  "operatorName": "Jane Operator",
  "shiftName": "Day Shift",
  "shiftDate": "2024-01-15"
}
```

**Response:**

```json
{
  "id": "session-xyz",
  "bomId": null,
  "companyName": "Test Company",
  "panelName": "Panel-001",
  "supervisorName": "John Supervisor",
  "operatorName": "Jane Operator",
  "shiftName": "Day Shift",
  "shiftDate": "2024-01-15",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Normal BOM-Based Session (Still Works)

**Request (With BOM):**

```json
{
  "bomId": 42,
  "companyName": "Test Company",
  "panelName": "Panel-002",
  "supervisorName": "John Supervisor",
  "operatorName": "Jane Operator",
  "shiftName": "Day Shift",
  "shiftDate": "2024-01-15"
}
```

**Response:**

```json
{
  "id": "session-abc",
  "bomId": 42,
  "companyName": "Test Company",
  "panelName": "Panel-002",
  "bomComponents": [...],
  "supervisorName": "John Supervisor",
  "operatorName": "Jane Operator",
  "shiftName": "Day Shift",
  "shiftDate": "2024-01-15",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## User Experience Flow

### Free Scan Mode

1. User opens "New Session" page
2. Enables "Free Scan Mode (scan without BOM validation)" checkbox
3. BOM selector disappears
4. Fills in company, panel, supervisor, operator, shift details
5. Clicks "Create Session"
6. Session created with `bomId: null`
7. Can scan feeders/spools without BOM constraints

### Normal Mode (Unchanged)

1. User opens "New Session" page
2. Leaves "Free Scan Mode" unchecked (default)
3. BOM selector remains visible
4. Selects a BOM from dropdown
5. Fills in remaining details
6. Clicks "Create Session"
7. Session created with BOM validation and component tracking

## Responsive Design

Both modes work seamlessly across:

- ✅ Desktop (1920x1080 and larger)
- ✅ Tablet (768x1024)
- ✅ Mobile (375x667)

UI automatically:

- Hides BOM selector in free scan mode
- Shows helpful message "Session will be created without BOM validation"
- Adjusts button disabled state appropriately
- Maintains all form field visibility and accessibility

## Monitoring & Logs

When using deployment scripts:

**API Server Logs:** `./logs/api-server.log`

```
2024-01-15 10:25:30 Starting API server on port 3000...
2024-01-15 10:25:32 Database connected
2024-01-15 10:25:35 Server ready
```

**Frontend Server Logs:** `./logs/frontend-server.log`

```
2024-01-15 10:25:35 Starting Frontend server on port 5173...
2024-01-15 10:25:38 Frontend ready at http://localhost:5173
```

## Troubleshooting

### Free Scan Mode Button Stays Disabled

**Cause:** `freeScanMode` checkbox not checked AND no BOM selected
**Solution:** Check the checkbox or select a BOM

### Session Creation Fails

**Cause:** Missing required fields (company, panel, supervisor, operator, shift, date)
**Solution:** Fill in all required fields before creating session

### API Returns 400 Error

**Cause:** Client sent invalid data or field format
**Solution:** Check API response body for specific field validation errors

### Servers Won't Start

**Cause:** Ports 3000/5173 already in use
**Solution:** Kill existing processes or change port configuration

## Future Enhancements

Potential improvements for future iterations:

- [ ] Save free scan mode preference in user settings
- [ ] Quick-start templates for common free scan scenarios
- [ ] Export free scan verification reports
- [ ] Batch free scan sessions
- [ ] Integration with mobile app for field scanning

## Summary

✅ **Complete and Production-Ready**

- Both BOM-based and free scan modes working perfectly
- Responsive UI across all devices
- Auto-deployment scripts configured and tested
- All backend validations in place
- Database schema updated and migrated
- API documentation updated
- Ready for immediate production deployment
