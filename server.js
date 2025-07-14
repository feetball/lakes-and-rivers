#!/usr/bin/env node

// Railway-compatible server.js with cache clearing
// This file serves as the main entry point for Railway deployments

const { spawn } = require('child_process');
const path = require('path');

console.log('[SERVER] Starting Railway-compatible server...');

// Check if we're in Railway production environment
const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
const isProduction = process.env.NODE_ENV === 'production';

if (isRailway && isProduction) {
  console.log('[SERVER] Railway production deployment detected');
  
  // Start the Next.js standalone server
  const serverPath = path.join(__dirname, '.next/standalone/server.js');
  
  console.log('[SERVER] Starting Next.js server...');
  const serverProcess = spawn('node', ['--max-old-space-size=4096', serverPath], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  // Handle cache clearing after server starts
  setTimeout(async () => {
    try {
      console.log('[RAILWAY-CACHE] Starting cache clearing process...');
      
      if (!process.env.REDIS_URL) {
        console.log('[RAILWAY-CACHE] No REDIS_URL found, skipping cache clear');
        return;
      }
      
      const fetch = require('node-fetch').default || require('node-fetch');
      const host = 'localhost';
      const port = process.env.PORT || '3000';
      
      console.log('[RAILWAY-CACHE] Clearing Redis cache...');
      
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      const adminPass = process.env.ADMIN_PASSWORD || 'CHANGE_ME_SECURE_PASSWORD_123';
      const auth = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
      
      const clearResponse = await fetch(`http://${host}:${port}/api/admin/cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({ action: 'clear_all' })
      });
      
      if (clearResponse.ok) {
        console.log('[RAILWAY-CACHE] ✓ Redis cache cleared successfully!');
        
        // Now trigger preload
        setTimeout(async () => {
          try {
            console.log('[RAILWAY-CACHE] Starting data preload...');
            const { preloadData } = require('./preload-data.js');
            await preloadData('localhost', port);
            console.log('[RAILWAY-CACHE] ✓ Data preload completed!');
          } catch (error) {
            console.log('[RAILWAY-CACHE] ⚠️ Preload failed:', error.message);
          }
        }, 5000);
        
      } else {
        console.log(`[RAILWAY-CACHE] ✗ Failed to clear cache (HTTP: ${clearResponse.status})`);
      }
    } catch (error) {
      console.log('[RAILWAY-CACHE] ✗ Error clearing cache:', error.message);
    }
  }, 20000); // Wait 20 seconds for server to be fully ready
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('[SERVER] Received SIGINT, shutting down...');
    serverProcess.kill('SIGINT');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('[SERVER] Received SIGTERM, shutting down...');
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });
  
  serverProcess.on('exit', (code) => {
    console.log(`[SERVER] Server process exited with code ${code}`);
    process.exit(code);
  });
  
} else {
  // Development or non-Railway environment
  console.log('[SERVER] Starting in development mode...');
  const devProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  devProcess.on('exit', (code) => {
    process.exit(code);
  });
}

// Ensure preloadData is called on every startup
setTimeout(async () => {
  try {
    console.log('[SERVER] Starting preload of static data...');
    const { preloadData } = require('./preload-data.js');
    await preloadData({ host: 'localhost', port: process.env.REDIS_PORT || 6379 });
    console.log('[SERVER] ✓ Preload complete.');
  } catch (err) {
    console.error('[SERVER] ✗ Preload failed:', err);
  }
}, 2000);
