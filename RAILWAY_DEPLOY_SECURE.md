# Secure Railway Deployment Guide

## ⚠️ SECURITY CHECKLIST - MUST DO BEFORE DEPLOYING

### 1. **Environment Variables Setup in Railway Dashboard**

After creating your Railway project, set these environment variables:

```bash
# Required - Admin Access
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_SUPER_SECURE_PASSWORD_HERE_123!

# Required - Application Config  
ALLOW_LIVE_USGS_FETCH=true
NODE_ENV=production

# Required - Redis (Railway will provide this automatically if you add Redis service)
REDIS_URL=redis://default:password@host:port
```

### 2. **Create Strong Admin Password**

**⚠️ CRITICAL:** Change `YOUR_SUPER_SECURE_PASSWORD_HERE_123!` to a strong password:
- At least 16 characters
- Mix of letters, numbers, symbols
- Example: `TxFlood2025!SecureAdmin#789`

### 3. **Railway Deployment Steps**

1. **Connect Repository to Railway:**
   ```bash
   # Fork this repo or use your own
   # Connect to Railway via GitHub integration
   ```

2. **Add Redis Service:**
   - In Railway dashboard, click "New" → "Database" → "Redis"
   - Railway will automatically set `REDIS_URL` environment variable

3. **Set Environment Variables:**
   - Go to your app service → "Variables" tab
   - Add all variables from section 1 above
   - **NEVER** use the default passwords shown in code

4. **Deploy:**
   - Railway will auto-deploy from your main branch
   - Monitor logs for any startup issues

### 4. **Post-Deployment Security**

1. **Test Admin Access:**
   ```bash
   curl -u "admin:YOUR_PASSWORD" "https://your-app.railway.app/api/admin/cache"
   ```

2. **Verify No Secrets in Logs:**
   - Check Railway logs for any exposed passwords
   - Passwords should never appear in logs

3. **Admin Panel Access:**
   - Visit: `https://your-app.railway.app/admin/cache.html`
   - Use your secure credentials

### 5. **Security Features Included**

✅ **Environment files are gitignored**  
✅ **No hardcoded secrets in source code**  
✅ **Basic HTTP authentication for admin endpoints**  
✅ **Redis connection encryption ready**  
✅ **API rate limiting implemented**  

### 6. **Monitoring & Maintenance**

- **Health Check:** `https://your-app.railway.app/api/health`
- **Cache Stats:** `https://your-app.railway.app/api/cache-stats`
- **Admin Panel:** `https://your-app.railway.app/admin/cache.html`

### 7. **Production Recommendations**

- **Enable HTTPS only** (Railway provides this automatically)
- **Monitor Railway resource usage**
- **Set up alerts for health check failures**
- **Regularly rotate admin password**
- **Monitor Redis memory usage**

## 🚨 NEVER DO THIS:

❌ Don't commit `.env` files  
❌ Don't use default passwords  
❌ Don't hardcode secrets in code  
❌ Don't expose admin endpoints without authentication  
❌ Don't skip environment variable setup  

## 🎯 DEPLOYMENT READY WHEN:

✅ All environment variables set in Railway  
✅ Strong admin password configured  
✅ Redis service added to Railway project  
✅ Health check endpoint responds  
✅ Admin authentication works  
✅ No secrets in source code or logs  

---

**Ready to deploy?** Follow the steps above and your Texas Lakes & Rivers app will be securely deployed to Railway! 🌊
