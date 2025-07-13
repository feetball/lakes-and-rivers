#!/bin/bash

# Production deployment script for Texas Lakes & Rivers app
set -e

echo "Starting production deployment..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "ERROR: Docker Compose is not available. Please ensure Docker Compose is installed."
    exit 1
fi

# Create .env.production if it doesn't exist
if [ ! -f .env.production ]; then
    echo "Creating production environment file..."
    cat > .env.production << EOF
# Production Environment Variables
NODE_ENV=production
REDIS_URL=redis://redis:6379

# Admin credentials for cache management
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME_SECURE_PASSWORD_123

# Allow live USGS API fetching (set to 'true' to enable live data, 'false' for cache-only)
ALLOW_LIVE_USGS_FETCH=true

# Memory configuration for Node.js
NODE_OPTIONS=--max-old-space-size=4096

# Timezone
TZ=America/Chicago

# Health check timeout
HEALTH_CHECK_TIMEOUT=10s
EOF
    echo "Created .env.production - please review and update as needed"
fi

# Export environment variables for docker-compose
export ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
export ADMIN_PASSWORD=${ADMIN_PASSWORD:-CHANGE_ME_SECURE_PASSWORD_123}
export ALLOW_LIVE_USGS_FETCH=${ALLOW_LIVE_USGS_FETCH:-true}

echo "Building Docker images..."
docker compose build --no-cache

echo "Stopping existing containers..."
docker compose down

echo "Cleaning up old images and volumes..."
docker system prune -f
docker volume prune -f

echo "Starting services..."
docker compose up -d

echo "Waiting for services to be healthy..."
sleep 10

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo "Services are running!"
    
    # Test health endpoint
    echo "Testing health endpoint..."
    sleep 5
    if curl -f http://localhost:3000/api/health &> /dev/null; then
        echo "Health check passed!"
    else
        echo "WARNING: Health check failed, but app might still be starting..."
    fi
    
    echo ""
    echo "Deployment successful!"
    echo ""
    echo "Service Status:"
    docker compose ps
    echo ""
    echo "Application URLs:"
    echo "   - Main App: http://localhost:3000"
    echo "   - Health Check: http://localhost:3000/api/health"
    echo "   - Redis: localhost:6379"
    echo ""
    echo "Useful commands:"
    echo "   - View logs: docker compose logs -f"
    echo "   - Stop services: docker compose down"
    echo "   - Restart: docker compose restart"
    echo ""
else
    echo "ERROR: Some services failed to start. Check logs with: docker compose logs"
    exit 1
fi
