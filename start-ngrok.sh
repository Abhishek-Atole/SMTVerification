#!/bin/bash

# Start ngrok tunnels for both frontend and API
# This exposes your local app to the internet

echo "Starting ngrok tunnels..."
echo ""

# Start API tunnel (port 3000) in background
ngrok http 3000 --log=stdout > /tmp/ngrok-api.log 2>&1 &
API_NGROK_PID=$!
sleep 2

# Start Frontend tunnel (port 5173) in background  
ngrok http 5173 --log=stdout > /tmp/ngrok-frontend.log 2>&1 &
FRONTEND_NGROK_PID=$!
sleep 2

echo "✓ ngrok tunnels started"
echo ""
echo "Getting public URLs..."
sleep 3

# Extract ngrok URLs from logs
API_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok\.io' /tmp/ngrok-api.log | head -1)
FRONTEND_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok\.io' /tmp/ngrok-frontend.log | head -1)

echo ""
echo "================================================"
echo "🌐 PUBLIC URLS - Access from anywhere:"
echo "================================================"
echo ""
echo "Frontend:  $FRONTEND_URL"
echo "API:       $API_URL"
echo ""
echo "================================================"
echo ""
echo "📝 To use from other devices:"
echo "1. Open browser on another device"
echo "2. Visit: $FRONTEND_URL"
echo ""
echo "⚠️  Note: ngrok free tier limits connections"
echo "    For production, deploy to cloud service"
echo ""
echo "Press Ctrl+C to stop tunnels"
echo ""

# Keep the script running
wait $API_NGROK_PID $FRONTEND_NGROK_PID
