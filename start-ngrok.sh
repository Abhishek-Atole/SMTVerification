#!/bin/bash

# Start ngrok tunnels for both frontend and API
# This exposes your local app to the internet

echo "Starting ngrok tunnels..."
echo ""

# Kill any existing ngrok processes
pkill -9 -f ngrok 2>/dev/null || true
sleep 2

# Start Frontend tunnel (port 5173) as PRIMARY entry point - FIRST PRIORITY
ngrok http 5173 --log=stdout > /tmp/ngrok-frontend.log 2>&1 &
FRONTEND_NGROK_PID=$!
echo "✓ Frontend tunnel started (PID: $FRONTEND_NGROK_PID)"
sleep 3

# Start API tunnel (port 3000) in background
ngrok http 3000 --log=stdout > /tmp/ngrok-api.log 2>&1 &
API_NGROK_PID=$!
echo "✓ API tunnel started (PID: $API_NGROK_PID)"
sleep 3

echo ""
echo "Getting public URLs..."
sleep 3

# Extract ngrok URLs from logs
FRONTEND_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok(-free)?\.io' /tmp/ngrok-frontend.log | head -1)
API_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok(-free)?\.io' /tmp/ngrok-api.log | head -1)

echo ""
echo "================================================"
echo "🌐 PUBLIC URLS - Access from anywhere:"
echo "================================================"
echo ""
echo "PRIMARY ENTRY POINT (Frontend): $FRONTEND_URL"
echo "API Backend:                    $API_URL"
echo ""
echo "================================================"
echo ""
echo "📝 To use from other devices:"
echo "1. Open browser on another device"
echo "2. Visit FRONTEND URL: $FRONTEND_URL"
echo "3. Frontend will connect to API backend"
echo ""
echo "⚠️  Note: ngrok free tier limits connections"
echo "    For production, deploy to cloud service"
echo ""
echo "Press Ctrl+C to stop tunnels"
echo ""

# Keep the script running
wait $FRONTEND_NGROK_PID $API_NGROK_PID
