#!/bin/bash

# Redis Setup Script for Local Development

echo "🚀 Setting up Redis for the USGS Water Levels app..."

# Check if Redis is already installed
if command -v redis-server >/dev/null 2>&1; then
    echo "✅ Redis is already installed"
else
    echo "📦 Installing Redis..."
    
    # Detect OS and install Redis
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Ubuntu/Debian
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update
            sudo apt-get install -y redis-server
        # CentOS/RHEL/Fedora
        elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y redis
        elif command -v dnf >/dev/null 2>&1; then
            sudo dnf install -y redis
        else
            echo "❌ Unsupported Linux distribution. Please install Redis manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew >/dev/null 2>&1; then
            brew install redis
        else
            echo "❌ Homebrew not found. Please install Homebrew first or install Redis manually."
            exit 1
        fi
    else
        echo "❌ Unsupported OS. Please install Redis manually."
        exit 1
    fi
fi

# Start Redis
echo "🔄 Starting Redis server..."
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
elif [[ "$OSTYPE" == "darwin"* ]]; then
    brew services start redis
fi

# Test Redis connection
echo "🧪 Testing Redis connection..."
sleep 2
if redis-cli ping | grep -q "PONG"; then
    echo "✅ Redis is running and accessible!"
    echo ""
    echo "🎉 Setup complete! Your USGS Water Levels app now has Redis caching enabled."
    echo ""
    echo "📝 Cache Configuration:"
    echo "   • Waterways: Cached for 24 hours"
    echo "   • USGS Data: Cached for 15 minutes"
    echo "   • Cache Key: Based on geographic bounding box"
    echo ""
    echo "🔧 To manage Redis:"
    echo "   • Start: redis-server"
    echo "   • Stop: redis-cli shutdown"
    echo "   • Monitor: redis-cli monitor"
    echo "   • Clear cache: redis-cli flushall"
else
    echo "❌ Redis connection failed. Please check the installation."
    exit 1
fi
