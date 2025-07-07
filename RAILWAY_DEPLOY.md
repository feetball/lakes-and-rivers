# Railway.com Deployment Guide

## Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID)

## Manual Deployment Steps

### 1. Prerequisites
- Railway account at [railway.app](https://railway.app)
- GitHub repository with your code

### 2. Create New Project
1. Go to Railway dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `dk-texas-flood-overview` repository

### 3. Add Redis Database (CRITICAL STEP)
⚠️ **This step is required** - your app will fail without it!

1. In your Railway project dashboard
2. Click **"+ New"** → **"Database"** → **"Add Redis"**
3. Railway will automatically set the `REDIS_URL` environment variable
4. Wait for Redis service to show as "Active"
5. Your app will automatically redeploy and connect to Redis

### 4. Verify Setup
Check that your project dashboard shows:
```
├── dk-texas-flood-overview (App Service)
└── Redis (Database Service)
```
Railway will automatically detect and set most variables. **Make sure to set these:**

```bash
NODE_ENV=production
PORT=3000
REDIS_URL=redis://... (automatically set by Railway Redis addon)

**⚠️ Security Note:** Set a strong `ADMIN_PASSWORD` to protect the cache admin interface at `/admin/cache.html`

### 5. Custom Domain (Optional)
1. Go to your service settings
2. Click "Domains"
3. Add your custom domain or use the Railway-provided URL

## Railway Configuration Files

This project includes:
- `railway.json` - Railway-specific configuration
- `nixpacks.toml` - Build configuration
- `.env.railway` - Environment variable template

## Deployment Features

✅ **Automatic Builds** - Deploys on every push to main branch  
✅ **Redis Integration** - One-click Redis database  
✅ **SSL Certificates** - Automatic HTTPS  
✅ **Custom Domains** - Easy domain configuration  
✅ **Environment Variables** - Secure configuration management  
✅ **Logs & Monitoring** - Built-in observability  

## Cost Estimation

**Hobby Plan (Free Tier):**
- $0/month for 512MB RAM, 1vCPU
- $5/month for Redis database
- 100GB bandwidth included

**Pro Plan:**
- Usage-based pricing starting at $5/month
- Better performance and more resources

## Troubleshooting

### Build Issues
1. Check the build logs in Railway dashboard
2. Ensure all dependencies are in `package.json`
3. Verify Node.js version compatibility

### Redis Connection Issues
1. Verify `REDIS_URL` environment variable is set
2. Check Redis addon status in Railway dashboard
3. Review application logs for connection errors

### Performance
1. Monitor usage in Railway dashboard
2. Consider upgrading plan if needed
3. Optimize React components and API calls

## Environment Variables Reference

| Variable | Description | Source |
|----------|-------------|---------|
| `NODE_ENV` | Application environment | Set to "production" |
| `PORT` | Application port | Railway sets automatically |
| `REDIS_URL` | Redis connection string | Railway Redis addon |

## Post-Deployment Checklist

- [ ] Application loads successfully
- [ ] Map displays correctly
- [ ] USGS data loads (check network tab)
- [ ] Redis caching works (check response times)
- [ ] Charts display properly
- [ ] Mobile responsiveness works
- [ ] Custom domain configured (if applicable)

## Railway CLI (Optional)

Install Railway CLI for advanced management:

```bash
npm install -g @railway/cli
railway login
railway link
railway status
```

## Support

- Railway Documentation: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Project Issues: GitHub Issues tab

## Railway vs Other Platforms

**Railway Advantages:**
- Simple deployment process
- Built-in Redis addon
- Automatic SSL certificates
- Usage-based pricing
- Excellent Next.js support

**Considerations:**
- Newer platform (less ecosystem)
- Pricing can scale with usage
- Limited to supported databases
