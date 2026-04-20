#!/bin/bash

# Start ngrok tunnel for public access
# Note: ngrok free tier only supports ONE tunnel per account
# Frontend will be the entry point; API calls go through the same tunnel

echo "Starting ngrok tunnel for public access..."
echo ""

# Kill any existing ngrok processes
pkill -9 -f ngrok 2>/dev/null || true
sleep 2

# Start Frontend tunnel (port 5173) as PRIMARY entry point
# The Frontend app will auto-detect the ngrok URL and use it for API calls
ngrok http 5173 --log=stdout > /tmp/ngrok-frontend.log 2>&1 &
FRONTEND_NGROK_PID=$!
echo "✓ Frontend tunnel started (PID: $FRONTEND_NGROK_PID)"
sleep 4

echo ""
echo "Getting public URL..."
sleep 2

# Extract ngrok URL from logs
FRONTEND_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok(-free)?\.io' /tmp/ngrok-frontend.log | head -1)

echo ""
echo "================================================"
echo "🌐 PUBLIC URL - Access from anywhere:"
echo "================================================"
echo ""
echo "Frontend: $FRONTEND_URL"
echo ""
echo "================================================"
echo ""
echo "ℹ️  How it works:"
echo "1. Open the Frontend URL in any browser"
echo "2. Frontend auto-detects ngrok URL"
echo "3. Frontend connects to API through same URL"
echo ""
echo "📝 To use from other devices:"
echo "1. Open browser on another device"
echo "2. Visit: $FRONTEND_URL"
echo "3. Application will work with API routing"
echo ""
echo "⚠️  Note: ngrok free tier limits:"
echo "    - 1 tunnel per account"
echo "    - Connection rate limited"
echo "    - URLs regenerate every 2-8 hours"
echo ""
echo "Press Ctrl+C to stop tunnels"
echo ""

# Keep the script running
wait $FRONTEND_NGROK_PID $API_NGROK_PID
