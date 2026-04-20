#!/bin/bash

# SMT Verification - Restart all servers
# Usage: ./restart-servers.sh
# Or with custom API target: API_TARGET="http://your-ip:3000" ./restart-servers.sh

set -e

PROJECT_DIR="/media/abhishek-atole/Courses/Final SMT MES SYSTEM/SMTVerification"
API_DIR="$PROJECT_DIR/artifacts/api-server"
FRONTEND_DIR="$PROJECT_DIR/artifacts/mockup-sandbox"
LOG_DIR="$PROJECT_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default API_TARGET to localhost if not set
API_TARGET="${API_TARGET:-http://localhost:3001}"

echo -e "${BLUE}=== SMT Verification Server Restart ===${NC}"
echo "Project Directory: $PROJECT_DIR"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================================================
# STEP 1: STOP EXISTING SERVERS
# ============================================================================
echo -e "${YELLOW}[STEP 1] Stopping existing servers...${NC}"

pkill -9 -f "node.*index.mjs" 2>/dev/null && echo -e "${GREEN}✓ API Server stopped${NC}" || echo "  API Server was not running"
pkill -9 -f "npm run dev" 2>/dev/null && echo -e "${GREEN}✓ Frontend Server stopped${NC}" || echo "  Frontend Server was not running"
pkill -9 -f "ngrok" 2>/dev/null && echo -e "${GREEN}✓ Ngrok tunnel stopped${NC}" || echo "  Ngrok tunnel was not running"

echo "Waiting for processes to terminate..."
sleep 3

# ============================================================================
# STEP 2: VERIFY PORTS ARE FREE
# ============================================================================
echo -e "${YELLOW}[STEP 2] Verifying ports are available...${NC}"

PORT_3000=$(lsof -i :3000 2>/dev/null | wc -l)
PORT_5173=$(lsof -i :5173 2>/dev/null | wc -l)

if [ $PORT_3000 -gt 0 ]; then
    echo -e "${RED}Warning: Port 3000 still in use${NC}"
    pkill -9 -f ":3000" 2>/dev/null || true
    sleep 1
fi

if [ $PORT_5173 -gt 0 ]; then
    echo -e "${RED}Warning: Port 5173 still in use${NC}"
    pkill -9 -f ":5173" 2>/dev/null || true
    sleep 1
fi

echo -e "${GREEN}✓ Ports verified${NC}"
echo ""

# ============================================================================
# STEP 3: START API SERVER
# ============================================================================
echo -e "${YELLOW}[STEP 3] Starting API Server on port 3000...${NC}"

cd "$API_DIR" || { echo -e "${RED}Error: API directory not found at $API_DIR${NC}"; exit 1; }

# Build if needed
if [ ! -d "dist" ] || [ ! -f "dist/index.mjs" ]; then
    echo "Building API Server..."
    npm run build > "$LOG_DIR/build.log" 2>&1 || { echo -e "${RED}Build failed${NC}"; exit 1; }
fi

# Start API Server
DATABASE_URL="postgresql://smtverify:smtverify@localhost:5432/smtverify" \
PORT=3001 \
NODE_ENV=production \
nohup node --enable-source-maps dist/index.mjs > "$LOG_DIR/api.log" 2>&1 &

API_PID=$!
echo -e "${GREEN}✓ API Server started${NC}"
echo "  Process ID: $API_PID"
echo "  Port: 3001"
echo "  Logs: $LOG_DIR/api.log"

# Wait for API server to be ready
echo "Waiting for API Server to be ready..."
sleep 3

# Check if API is responding
for i in {1..10}; do
    if curl -s http://localhost:3001/api/sessions > /dev/null 2>&1; then
        echo -e "${GREEN}✓ API Server is responding${NC}"
        break
    fi
    if [ $i -lt 10 ]; then
        echo "  Attempt $i/10 - waiting..."
        sleep 1
    else
        echo -e "${YELLOW}⚠ API Server may not be ready yet${NC}"
    fi
done

echo ""

# ============================================================================
# STEP 4: START FRONTEND SERVER
# ============================================================================
echo -e "${YELLOW}[STEP 4] Starting Frontend Server on port 5173...${NC}"

cd "$FRONTEND_DIR" || { echo -e "${RED}Error: Frontend directory not found at $FRONTEND_DIR${NC}"; exit 1; }

# Start Frontend Server with required environment variables
PORT=5173 \
BASE_PATH="/" \
VITE_API_URL="$API_TARGET" \
NODE_ENV=development \
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &

FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend Server started${NC}"
echo "  Process ID: $FRONTEND_PID"
echo "  Port: 5173"
echo "  Logs: $LOG_DIR/frontend.log"
echo "  API Target: $API_TARGET"

# Wait for Frontend server to be ready
echo "Waiting for Frontend Server to be ready..."
sleep 5

echo -e "${GREEN}✓ Frontend Server initialized${NC}"
echo ""

# ============================================================================
# STEP 5: FINAL STATUS
# ============================================================================
echo -e "${BLUE}=== Restart Complete ===${NC}"
echo ""
echo -e "${GREEN}Active Services:${NC}"
echo "  • API Server:      http://localhost:3001"
echo "  • Frontend:        http://localhost:5173"
echo ""
echo -e "${GREEN}Log Files:${NC}"
echo "  • API Logs:        $LOG_DIR/api.log"
echo "  • Frontend Logs:   $LOG_DIR/frontend.log"
echo "  • Build Logs:      $LOG_DIR/build.log"
echo ""
echo -e "${BLUE}To stop servers, run: ./stop-servers.sh${NC}"
echo -e "${BLUE}To view logs: tail -f $LOG_DIR/api.log${NC}"
echo ""

# Keep tail running to show real-time logs (optional)
if [ "$1" == "--logs" ]; then
    echo "Following logs (Ctrl+C to exit)..."
    tail -f "$LOG_DIR/api.log" "$LOG_DIR/frontend.log"
fi
