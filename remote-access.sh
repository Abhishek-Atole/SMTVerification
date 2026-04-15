#!/bin/bash

# 🌐 Remote Access Script - Access your app from any device anywhere
# This creates public internet URLs using ngrok

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       🌐 SMT Verification - Remote Access Setup            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Get local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "Your Local IP: $LOCAL_IP"
echo ""

# Create a temporary auth file for ngrok if needed
if [ ! -f ~/.ngrok2/ngrok.yml ]; then
    echo "⚠️  Note: To use ngrok, sign up free at https://ngrok.com/sign-up"
    echo "   Then: ngrok authtoken YOUR_TOKEN"
    echo ""
fi

# Check if servers are running
echo "Checking if servers are running..."
if curl -s http://localhost:3000/api/bom > /dev/null 2>&1; then
    echo "✓ API Server (port 3000) is running"
else
    echo "✗ API Server not running. Start with: ./start-servers.sh"
    exit 1
fi

if nc -z localhost 5173 2>/dev/null; then
    echo "✓ Frontend (port 5173) is running"
else
    echo "✗ Frontend not running"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              📱 ACCESS OPTIONS                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "🏠 OPTION 1: Same WiFi Network (Free, No Internet Required)"
echo "   From another device on the same WiFi:"
echo "   📲 Frontend: http://$LOCAL_IP:5173"
echo "   🔌 API:      http://$LOCAL_IP:3000"
echo ""

echo "🌍 OPTION 2: Internet Access from Anywhere (Using ngrok)"
echo "   Starting ngrok tunnels..."
echo ""

# Kill any existing ngrok processes
pkill -f "ngrok http" 2>/dev/null || true
sleep 1

# Start ngrok tunnels for API and Frontend with pooling enabled
# This allows multiple endpoints to share the same ngrok domain
ngrok http --region us --pooling-enabled 3000 --log=stdout > /tmp/ngrok-api.log 2>&1 &
API_NGROK_PID=$!

ngrok http --region us --pooling-enabled 5173 --log=stdout > /tmp/ngrok-frontend.log 2>&1 &
FRONTEND_NGROK_PID=$!

# Wait for ngrok to initialize
echo "   Initializing tunnels (waiting 5 seconds)..."
sleep 5

# Extract ngrok URLs
API_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok\.io' /tmp/ngrok-api.log 2>/dev/null | head -1)
FRONTEND_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok\.io' /tmp/ngrok-frontend.log 2>/dev/null | head -1)

# If URLs not found, try a different approach
if [ -z "$FRONTEND_URL" ]; then
    sleep 3
    API_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok\.io' /tmp/ngrok-api.log 2>/dev/null | head -1)
    FRONTEND_URL=$(grep -oP 'https://[a-z0-9-]+\.ngrok\.io' /tmp/ngrok-frontend.log 2>/dev/null | head -1)
fi

echo ""
if [ -n "$FRONTEND_URL" ] && [ -n "$API_URL" ]; then
    echo "✓ Public Internet URLs created!"
    echo ""
    echo "   📱 Frontend: $FRONTEND_URL"
    echo "   🔌 API:      $API_URL"
    echo ""
    echo "   ✅ You can now access from ANY device, anywhere in the world!"
    echo "   💾 Share this URL with others: $FRONTEND_URL"
else
    echo "⚠️  Could not retrieve ngrok URLs"
    echo "   Make sure ngrok is installed: brew install ngrok"
    echo "   Or visit: https://ngrok.com/download"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              🛑 STOP ACCESS                               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop tunnels and close internet access"
echo ""

# Keep script running and monitor tunnels
trap "echo ''; echo 'Stopping ngrok tunnels...'; kill $API_NGROK_PID $FRONTEND_NGROK_PID 2>/dev/null; exit 0" SIGINT

while true; do
    sleep 10
    # Check if processes are still running
    if ! kill -0 $API_NGROK_PID 2>/dev/null || ! kill -0 $FRONTEND_NGROK_PID 2>/dev/null; then
        echo "ngrok tunnels stopped"
        break
    fi
done
