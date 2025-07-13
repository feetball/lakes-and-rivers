# Railway Redis Cache Clear Implementation

## Overview

This implementation ensures that Redis cache is automatically cleared during Railway deployments, providing fresh data for each deployment.

## Components

### 1. Core Scripts

#### `railway-clear-cache.js`
- Node.js script that clears Redis cache via the admin API
- Only runs in Railway production environments
- Uses environment variables for authentication
- Includes proper error handling and logging

#### `railway-clear-cache.sh` 
- Bash script alternative for cache clearing
- Includes curl-based API calls with authentication
- Provides backup option if Node.js script fails

#### `startup.js`
- Main startup orchestrator for Railway deployments
- Detects Railway production environment
- Coordinates: Server startup → Cache clear → Data preload
- Handles process management and graceful shutdown

### 2. Configuration Files

#### `railway.json`
```json
{
  "deploy": {
    "startCommand": "node startup.js"
  }
}
```

#### `nixpacks.toml`
```toml
[phases.start]
cmd = "node startup.js"
```

#### `package.json`
```json
{
  "scripts": {
    "railway-clear-cache": "node railway-clear-cache.js",
    "railway-deploy": "./railway-deploy.sh"
  }
}
```

## Deployment Flow

### Railway Production Deployment
1. **Build Phase**: Standard Next.js build process
2. **Start Phase**: `startup.js` is executed
3. **Detection**: Checks for Railway environment variables
4. **Server Start**: Launches Next.js server in background
5. **Cache Clear**: Calls admin API to clear all Redis data
6. **Data Preload**: Loads fresh Texas data from static files
7. **Ready**: Application serves requests with fresh cache

### Local/Development
- Standard startup process without cache clearing
- Preserves local development workflow

## Environment Variables

### Required for Cache Clearing
- `RAILWAY_ENVIRONMENT=production` or `RAILWAY_PROJECT_ID` (set by Railway)
- `REDIS_URL` (set by Railway Redis addon)

### Optional Authentication
- `ADMIN_USERNAME` (defaults to "admin")
- `ADMIN_PASSWORD` (defaults to "CHANGE_ME_SECURE_PASSWORD_123")

## API Endpoint Used

**POST** `/api/admin/cache`
```json
{
  "action": "clear_all"
}
```

This endpoint:
- Uses HTTP Basic Authentication
- Calls `redis.flushAll()` to clear all cache data
- Returns success/error status
- Is already implemented in the existing admin API

## Benefits

1. **Fresh Data**: Each deployment starts with clean cache
2. **Consistency**: Eliminates stale cache issues
3. **Automatic**: No manual intervention required
4. **Safe**: Only runs in production Railway environment
5. **Logged**: Full logging for debugging and monitoring

## Monitoring

Check Railway deployment logs for:
- `[STARTUP]` messages for startup sequence
- `[RAILWAY-CLEAR]` messages for cache clearing
- `[PRELOAD]` messages for data preloading

## Manual Usage

If needed, you can manually clear cache:

```bash
# Via npm script
npm run railway-clear-cache

# Direct execution
node railway-clear-cache.js

# Or bash script
./railway-clear-cache.sh
```

## Error Handling

- Graceful fallback if app isn't ready in time
- Continues deployment even if cache clear fails
- Comprehensive logging for debugging
- Process management for clean shutdown

## Security

- Uses existing admin authentication system
- Credentials from environment variables
- Only activates in production environment
- No sensitive data in logs
