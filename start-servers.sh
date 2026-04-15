#!/bin/bash

# SMT Verification - Auto-start servers script
# Usage: ./start-servers.sh
# Or with custom API target: API_TARGET="http://your-ip:3000" ./start-servers.sh

set -e

PROJECT_DIR="/media/abhishek-atole/Courses/Final SMT MES SYSTEM/SMTVerification"
API_DIR="$PROJECT_DIR/artifacts/api-server"
FRONTEND_DIR="$PROJECT_DIR/artifacts/feeder-scanner"
LOG_DIR="$PROJECT_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default API_TARGET to localhost if not set
API_TARGET="${API_TARGET:-http://localhost:3000}"

echo -e "${BLUE}=== SMT Verification Server Startup ===${NC}"
echo "API Target: $API_TARGET"
echo "Starting API Server..."

# Kill any existing processes on ports 3000 and 5173
pkill -9 -f "node.*index.mjs" 2>/dev/null || true
pkill -9 -f "npm run dev" 2>/dev/null || true
sleep 2

# Start API Server
cd "$API_DIR"
DATABASE_URL="postgresql://smtverify:smtverify@localhost:5432/smtverify" \
PORT=3000 \
NODE_ENV=production \
nohup node dist/index.mjs > "$LOG_DIR/api.log" 2>&1 &

API_PID=$!
echo -e "${GREEN}✓ API Server started (PID: $API_PID)${NC}"
echo "  Logs: $LOG_DIR/api.log"

sleep 3

echo "Starting Frontend Server..."

# Start Frontend Server with API_TARGET for mobile/network access
cd "$FRONTEND_DIR"
PORT=5173 \
BASE_PATH=/ \
API_TARGET="$API_TARGET" \
VITE_API_URL="$API_TARGET" \
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &

FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend Server started (PID: $FRONTEND_PID)${NC}"
echo "  Logs: $LOG_DIR/frontend.log"

sleep 3

# Verify servers are running
if curl -s http://localhost:3000/api/bom > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API Server is responding${NC}"
else
    echo "✗ API Server not responding - check logs"
fi

echo ""
echo -e "${BLUE}=== Access the application ===${NC}"
echo "Frontend (localhost): http://localhost:5173"
echo "Frontend (network):   http://10.83.113.10:5173"
echo "Internet (ngrok):     https://nonangling-unspruced-taren.ngrok-free.dev"
echo ""
