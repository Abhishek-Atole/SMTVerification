#!/bin/bash

# Stop SMT Verification servers
# Usage: ./stop-servers.sh

echo "Stopping SMT Verification servers..."

pkill -9 -f "node.*index.mjs" 2>/dev/null && echo "✓ API Server stopped" || echo "API Server not running"
pkill -9 -f "npm run dev.*feeder-scanner" 2>/dev/null && echo "✓ Frontend Server stopped" || echo "Frontend Server not running"

sleep 1
echo "Done!"
