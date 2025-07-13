// Railway deployment cache clearing hook
// This runs when the Next.js app starts in production

let cacheCleared = false;

export async function railwayCacheClear() {
  // Only run once and only in Railway production
  if (cacheCleared) return;
  
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isRailway || !isProduction || !process.env.REDIS_URL) {
    return;
  }
  
  cacheCleared = true;
  
  console.log('[RAILWAY-CACHE] Railway production detected, scheduling cache clear...');
  
  // Wait for app to be fully ready, then clear cache
  setTimeout(async () => {
    try {
      console.log('[RAILWAY-CACHE] Clearing Redis cache...');
      
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      const adminPass = process.env.ADMIN_PASSWORD || 'CHANGE_ME_SECURE_PASSWORD_123';
      const auth = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
      
      const response = await fetch('http://localhost:3000/api/admin/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({ action: 'clear_all' })
      });
      
      if (response.ok) {
        console.log('[RAILWAY-CACHE] ✓ Redis cache cleared successfully!');
        
        // Trigger preload after cache clear
        setTimeout(async () => {
          try {
            console.log('[RAILWAY-CACHE] Starting data preload...');
            
            const preloadResponse = await fetch('http://localhost:3000/api/admin/cache', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
              },
              body: JSON.stringify({ 
                action: 'set-status',
                usgs: false,
                waterways: false,
                flood: false
              })
            });
            
            if (preloadResponse.ok) {
              // Run preload via the preload script
              const { spawn } = require('child_process');
              const preloadProcess = spawn('node', ['preload-data.js'], {
                stdio: 'inherit'
              });
              
              preloadProcess.on('exit', (code: number | null) => {
                if (code === 0) {
                  console.log('[RAILWAY-CACHE] ✓ Data preload completed!');
                } else {
                  console.log('[RAILWAY-CACHE] ⚠️ Preload process exited with code:', code);
                }
              });
            }
            
          } catch (error) {
            console.log('[RAILWAY-CACHE] ⚠️ Preload trigger failed:', (error as Error).message);
          }
        }, 5000);
        
      } else {
        console.log(`[RAILWAY-CACHE] ✗ Failed to clear cache (HTTP: ${response.status})`);
      }
    } catch (error) {
      console.log('[RAILWAY-CACHE] ✗ Error clearing cache:', (error as Error).message);
    }
  }, 30000); // Wait 30 seconds for Next.js to be fully ready
}
