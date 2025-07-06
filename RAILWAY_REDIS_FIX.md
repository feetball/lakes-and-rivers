# Railway Redis Setup - Step by Step Fix

## The Problem
You're getting `ENOTFOUND redis` because Railway doesn't automatically deploy Redis. You need to add it as a separate service.

## 🔧 Solution: Add Redis Service to Railway

### Step 1: Access Your Railway Project
1. Go to [railway.app](https://railway.app)
2. Open your `lakes-and-rivers` project

### Step 2: Add Redis Database
1. In your project dashboard, click the **"+"** button or **"New"**
2. Select **"Database"**
3. Choose **"Add Redis"**
4. Railway will create a Redis service and generate a `REDIS_URL` environment variable

### Step 3: Verify Environment Variables
1. Go to your app service (not the Redis service)
2. Click on **"Variables"** tab
3. You should see `REDIS_URL` automatically added
4. It should look like: `redis://default:password@host:port`

### Step 4: Redeploy Your Application
1. Your app should automatically redeploy when Redis is added
2. If not, go to **"Deployments"** and click **"Deploy Latest"**

## 🎯 Expected Result
- Redis service will be running alongside your app
- `REDIS_URL` environment variable will be automatically set
- Your app will connect to Redis successfully
- Cache will start working

## 🔍 Troubleshooting

### If Redis Still Doesn't Connect:
1. **Check Variables**: Ensure `REDIS_URL` exists in your app's environment variables
2. **Check Logs**: Look at your app logs for connection success/failure messages
3. **Restart Services**: Sometimes a restart helps after adding Redis

### Railway Dashboard Check:
```
Your Project Should Show:
├── lakes-and-rivers (your app)
└── Redis (database service)
```

### Environment Variables Should Include:
```
REDIS_URL=redis://default:xxx@xxx.railway.internal:6379
NODE_ENV=production
PORT=3000
```

## 📋 Railway Services Setup Checklist

- [ ] App service deployed from GitHub
- [ ] Redis database service added
- [ ] `REDIS_URL` environment variable present
- [ ] App service redeployed after adding Redis
- [ ] Both services showing as "Active"

## 💡 Alternative: Disable Redis Temporarily

If you want to test without Redis first:

1. Add environment variable: `DISABLE_REDIS=true`
2. Your app will run without caching (slower but functional)
3. Add Redis later when ready

## 🚀 Quick Commands to Check Redis

Once deployed, test the health endpoint:
```bash
curl https://your-app.railway.app/api/health
```

Should return:
```json
{
  "status": "healthy",
  "services": {
    "redis": "connected",
    "app": "running"
  }
}
```

## 📞 Need Help?
- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app/databases/redis
