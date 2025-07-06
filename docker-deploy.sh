#!/bin/bash

# Docker Deployment Script for Lakes and Rivers Flood Monitoring
# Usage: ./docker-deploy.sh [start|stop|restart|status|logs|build]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not available"
        exit 1
    fi
}

start_containers() {
    log "Starting containers..."
    
    # Stop any existing dev servers
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    
    # Check if port 3000 is in use
    if lsof -i :3000 >/dev/null 2>&1; then
        warning "Port 3000 is in use. Stopping processes..."
        lsof -ti :3000 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Start containers
    docker compose up -d --build
    
    # Wait for containers to be ready
    log "Waiting for containers to be healthy..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker compose ps | grep -q "healthy"; then
            success "Containers are running and healthy!"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        error "Containers failed to become healthy within 60 seconds"
        docker compose logs
        exit 1
    fi
    
    # Test the application
    log "Testing application..."
    if curl -f http://localhost:3000/api/health >/dev/null 2>&1; then
        success "Application is responding successfully!"
        echo ""
        echo "🌊 Lakes and Rivers Flood Monitoring is now running:"
        echo "   Web Interface: http://localhost:3000"
        echo "   Health Check:  http://localhost:3000/api/health"
        echo "   Redis:         localhost:6379"
        echo ""
    else
        error "Application health check failed"
        exit 1
    fi
}

stop_containers() {
    log "Stopping containers..."
    docker compose down
    success "Containers stopped"
}

restart_containers() {
    log "Restarting containers..."
    stop_containers
    sleep 2
    start_containers
}

show_status() {
    log "Container status:"
    docker compose ps
    echo ""
    
    log "Application health:"
    if curl -f http://localhost:3000/api/health 2>/dev/null; then
        echo ""
    else
        warning "Application not responding"
    fi
}

show_logs() {
    service=${2:-""}
    if [ -n "$service" ]; then
        log "Showing logs for $service..."
        docker compose logs -f "$service"
    else
        log "Showing logs for all services..."
        docker compose logs -f
    fi
}

build_containers() {
    log "Building containers..."
    docker compose build --no-cache
    success "Build complete"
}

# Main script logic
case "${1:-start}" in
    "start")
        check_docker
        start_containers
        ;;
    "stop")
        check_docker
        stop_containers
        ;;
    "restart")
        check_docker
        restart_containers
        ;;
    "status")
        check_docker
        show_status
        ;;
    "logs")
        check_docker
        show_logs "$@"
        ;;
    "build")
        check_docker
        build_containers
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  start      Start all containers (default)"
        echo "  stop       Stop all containers"
        echo "  restart    Restart all containers"
        echo "  status     Show container status and health"
        echo "  logs       Show container logs (add service name for specific service)"
        echo "  build      Build containers from scratch"
        echo "  help       Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 logs app"
        echo "  $0 logs redis"
        ;;
    *)
        error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac
