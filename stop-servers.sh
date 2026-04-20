#!/bin/bash

# Stop SMT Verification servers
# Usage: ./stop-servers.sh

echo "Stopping SMT Verification servers..."

pkill -9 -f "node.*index.mjs" 2>/dev/null && echo "✓ API Server stopped" || echo "API Server not running"
pkill -9 -f "npm run dev" 2>/dev/null && echo "✓ Frontend Server stopped" || echo "Frontend Server not running"
pkill -9 -f "ngrok" 2>/dev/null && echo "✓ Ngrok tunnel stopped" || echo "Ngrok tunnel not running"

sleep 1
echo "All servers stopped!"
