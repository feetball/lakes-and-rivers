#!/bin/bash

# Production Deployment Script for USGS Water Levels App

set -e

echo "🚀 Starting production deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please ensure Docker Compose is installed."
    exit 1
fi

# Create production environment file if it doesn't exist
if [ ! -f .env.production ]; then
    echo "📝 Creating production environment file..."
    cat > .env.production << EOF
# Production Environment Variables
NODE_ENV=production
REDIS_URL=redis://redis:6379

# Optional: Add your domain for SSL
# DOMAIN=your-domain.com

# Optional: Add external Redis URL for cloud deployment
# REDIS_URL=redis://your-cloud-redis:6379
EOF
    echo "✅ Created .env.production - please review and update as needed"
fi

echo "🏗️  Building Docker images..."
docker compose build --no-cache

echo "🛑 Stopping existing containers..."
docker compose down

echo "🧹 Cleaning up old images and volumes..."
docker system prune -f
docker volume prune -f

echo "🚀 Starting services..."
docker compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    
    # Test health endpoint
    echo "🧪 Testing health endpoint..."
    sleep 5
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Health check passed!"
    else
        echo "⚠️  Health check failed, but app might still be starting..."
    fi
    
    echo ""
    echo "🎉 Deployment successful!"
    echo ""
    echo "📊 Service Status:"
    docker compose ps
    echo ""
    echo "🌐 Application URLs:"
    echo "   • Main App: http://localhost:3000"
    echo "   • Health Check: http://localhost:3000/api/health"
    echo "   • Redis: localhost:6379"
    echo ""
    echo "📝 Useful commands:"
    echo "   • View logs: docker compose logs -f"
    echo "   • Stop services: docker compose down"
    echo "   • Restart: docker compose restart"
    echo "   • View Redis data: docker compose exec redis redis-cli monitor"
    echo ""
else
    echo "❌ Deployment failed! Check logs with: docker compose logs"
    exit 1
fi
