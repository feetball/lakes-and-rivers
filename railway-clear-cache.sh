#!/bin/bash

# Railway Redis Cache Clear Script
# This script clears the Redis cache during Railway deployments

echo "[RAILWAY-CLEAR] Starting Redis cache clear for Railway deployment..."

# Check if REDIS_URL is set
if [ -z "$REDIS_URL" ]; then
    echo "[RAILWAY-CLEAR] ⚠️  REDIS_URL not set, skipping cache clear"
    exit 0
fi

echo "[RAILWAY-CLEAR] Redis URL found: ${REDIS_URL}"

# Wait for app to be ready (Railway style)
APP_HOST=${APP_HOST:-localhost}
APP_PORT=${PORT:-3000}
MAX_WAIT=60
WAIT_COUNT=0

echo "[RAILWAY-CLEAR] Waiting for app to be ready at ${APP_HOST}:${APP_PORT}..."

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s -f "http://${APP_HOST}:${APP_PORT}/api/health" > /dev/null 2>&1; then
        echo "[RAILWAY-CLEAR] ✓ App is ready!"
        break
    fi
    echo "[RAILWAY-CLEAR] Waiting for app... (${WAIT_COUNT}/${MAX_WAIT})"
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo "[RAILWAY-CLEAR] ⚠️  App not ready in time, proceeding anyway..."
fi

# Clear Redis cache using the admin API
echo "[RAILWAY-CLEAR] Clearing Redis cache..."

# Use admin credentials from environment variables
ADMIN_USER=${ADMIN_USERNAME:-admin}
ADMIN_PASS=${ADMIN_PASSWORD:-CHANGE_ME_SECURE_PASSWORD_123}

# Make the cache clear request
CLEAR_RESPONSE=$(curl -s -w "%{http_code}" \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"action":"clear_all"}' \
    "http://${APP_HOST}:${APP_PORT}/api/admin/cache")

HTTP_CODE=$(echo "$CLEAR_RESPONSE" | tail -c 4)

if [ "$HTTP_CODE" = "200" ]; then
    echo "[RAILWAY-CLEAR] ✓ Redis cache cleared successfully!"
else
    echo "[RAILWAY-CLEAR] ✗ Failed to clear Redis cache (HTTP: $HTTP_CODE)"
    echo "[RAILWAY-CLEAR] Response: $CLEAR_RESPONSE"
fi

echo "[RAILWAY-CLEAR] Cache clear process completed"
