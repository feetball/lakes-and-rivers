# Docker Deployment Guide

## Quick Start

To deploy the Lakes and Rivers Flood Monitoring application with Docker:

```bash
# Start the application
./docker-deploy.sh start

# Check status
./docker-deploy.sh status

# View logs
./docker-deploy.sh logs

# Stop the application
./docker-deploy.sh stop
```

The application will be available at:
- **Web Interface**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health
- **Redis**: localhost:6379

## Services

### Application Container (`lakes-app`)
- **Image**: Built from local Dockerfile
- **Port**: 3000
- **Environment**: Production mode with Redis connectivity
- **Health Check**: Automated via `/api/health` endpoint

### Redis Container (`lakes-redis`)
- **Image**: redis:7.0-alpine
- **Port**: 6379
- **Persistence**: Data stored in Docker volume `redis_data`
- **Configuration**: AOF enabled for data durability

## Management Commands

```bash
# Start containers
./docker-deploy.sh start

# Stop containers
./docker-deploy.sh stop

# Restart containers
./docker-deploy.sh restart

# Show container status
./docker-deploy.sh status

# View all logs
./docker-deploy.sh logs

# View specific service logs
./docker-deploy.sh logs app
./docker-deploy.sh logs redis

# Rebuild containers
./docker-deploy.sh build

# Show help
./docker-deploy.sh help
```

## Manual Docker Commands

If you prefer using Docker Compose directly:

```bash
# Start containers
docker compose up -d

# Stop containers
docker compose down

# View logs
docker compose logs -f

# Rebuild and start
docker compose up --build -d

# Check status
docker compose ps
```

## Persistence

- **Redis Data**: Stored in Docker volume `redis_data`
- **Application State**: Stateless (all data cached in Redis)
- **Logs**: Available via `docker compose logs`

## Troubleshooting

### Port Already in Use
If you get a "port already in use" error:
```bash
# Kill any processes using port 3000
sudo lsof -ti :3000 | xargs kill -9

# Or use the deployment script which handles this automatically
./docker-deploy.sh start
```

### Redis Connection Issues
Check Redis container health:
```bash
docker compose ps
docker compose logs redis
```

### Application Not Responding
Check application logs:
```bash
./docker-deploy.sh logs app
```

### Complete Reset
To completely reset the deployment:
```bash
docker compose down --volumes --remove-orphans
docker system prune -f
./docker-deploy.sh start
```

## Production Notes

- Application runs in production mode (`NODE_ENV=production`)
- Redis data is persisted across container restarts
- Health checks ensure containers are ready before traffic
- All caching and flood stage management is fully functional
- No git commits - this is a local deployment setup

## Monitoring

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Redis Stats
```bash
# Connect to Redis
docker exec -it lakes-redis redis-cli

# In Redis CLI:
INFO memory
KEYS *
```

### Container Stats
```bash
docker stats lakes-app lakes-redis
```
