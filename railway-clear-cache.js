#!/usr/bin/env node

// Railway Cache Clear Script
// Clears Redis cache during Railway deployments

const fetch = require('node-fetch').default || require('node-fetch');

async function clearRailwayCache() {
  console.log('[RAILWAY-CLEAR] Starting Redis cache clear for Railway deployment...');
  
  // Check if we're in Railway environment
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
  if (!isRailway) {
    console.log('[RAILWAY-CLEAR] Not in Railway environment, skipping cache clear');
    return;
  }
  
  // Check if Redis is available
  if (!process.env.REDIS_URL) {
    console.log('[RAILWAY-CLEAR] ⚠️  REDIS_URL not set, skipping cache clear');
    return;
  }
  
  console.log('[RAILWAY-CLEAR] Railway deployment detected, Redis URL found');
  
  // Wait for app to be ready
  const host = process.env.APP_HOST || 'localhost';
  const port = process.env.PORT || '3000';
  const maxWait = 60000; // 60 seconds
  const startTime = Date.now();
  
  console.log(`[RAILWAY-CLEAR] Waiting for app to be ready at ${host}:${port}...`);
  
  while (Date.now() - startTime < maxWait) {
    try {
      const healthResponse = await fetch(`http://${host}:${port}/api/health`);
      if (healthResponse.ok) {
        console.log('[RAILWAY-CLEAR] ✓ App is ready!');
        break;
      }
    } catch (error) {
      // App not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (Date.now() - startTime >= maxWait) {
    console.log('[RAILWAY-CLEAR] ⚠️  App not ready in time, proceeding anyway...');
  }
  
  // Clear Redis cache using admin API
  console.log('[RAILWAY-CLEAR] Clearing Redis cache...');
  
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'CHANGE_ME_SECURE_PASSWORD_123';
  
  const auth = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
  
  try {
    const clearResponse = await fetch(`http://${host}:${port}/api/admin/cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({ action: 'clear_all' })
    });
    
    if (clearResponse.ok) {
      console.log('[RAILWAY-CLEAR] ✓ Redis cache cleared successfully!');
      const result = await clearResponse.text();
      console.log('[RAILWAY-CLEAR] Response:', result);
    } else {
      console.log(`[RAILWAY-CLEAR] ✗ Failed to clear Redis cache (HTTP: ${clearResponse.status})`);
      const errorText = await clearResponse.text();
      console.log('[RAILWAY-CLEAR] Error response:', errorText);
    }
  } catch (error) {
    console.log('[RAILWAY-CLEAR] ✗ Error clearing Redis cache:', error.message);
  }
  
  console.log('[RAILWAY-CLEAR] Cache clear process completed');
}

// Run if this is the main module
if (require.main === module) {
  clearRailwayCache().catch(error => {
    console.error('[RAILWAY-CLEAR] Cache clear failed:', error);
    process.exit(1);
  });
}

module.exports = { clearRailwayCache };
