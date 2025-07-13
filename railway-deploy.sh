#!/bin/bash

# Railway Deployment Script with Cache Clear
# This script runs during Railway deployment to ensure fresh cache

echo "[RAILWAY-DEPLOY] Starting Railway deployment process..."

# Set Railway-specific environment defaults
export APP_HOST=${APP_HOST:-localhost}
export PORT=${PORT:-3000}

# Run cache clear if this is a deployment (Railway sets this automatically)
if [ "$RAILWAY_ENVIRONMENT" = "production" ] || [ -n "$RAILWAY_PROJECT_ID" ]; then
    echo "[RAILWAY-DEPLOY] Production deployment detected, clearing cache..."
    
    # Start the app in background first
    echo "[RAILWAY-DEPLOY] Starting application..."
    node --max-old-space-size=4096 server.js &
    APP_PID=$!
    
    # Wait a moment for the app to start
    sleep 10
    
    # Clear the cache
    ./railway-clear-cache.sh
    
    # Wait for cache clear to complete
    sleep 5
    
    # Now run the preload script to populate fresh data
    echo "[RAILWAY-DEPLOY] Running data preload..."
    node --max-old-space-size=4096 preload-data.js
    
    # The app is already running, so we're done
    echo "[RAILWAY-DEPLOY] ✓ Deployment process completed successfully!"
    wait $APP_PID
else
    echo "[RAILWAY-DEPLOY] Development environment, skipping cache clear"
    echo "[RAILWAY-DEPLOY] Starting application normally..."
    exec node --max-old-space-size=4096 server.js
fi
