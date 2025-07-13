#!/usr/bin/env node

// Startup script for Railway deployments
// Handles cache clearing and data preloading for fresh deployments

const { spawn } = require('child_process');
const { clearRailwayCache } = require('./railway-clear-cache.js');
const { preloadData } = require('./preload-data.js');

async function startupSequence() {
  console.log('[STARTUP] Railway startup sequence beginning...');
  
  // Check if this is a Railway environment
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isRailway && isProduction) {
    console.log('[STARTUP] Production Railway deployment detected');
    
    try {
      // Start the Next.js server in the background
      console.log('[STARTUP] Starting Next.js server...');
      const serverProcess = spawn('node', ['--max-old-space-size=4096', 'server.js'], {
        stdio: 'inherit',
        detached: false
      });
      
      // Wait a moment for server to start
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Clear the cache
      console.log('[STARTUP] Clearing Redis cache for fresh deployment...');
      await clearRailwayCache();
      
      // Wait a moment before preloading
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Preload fresh data
      console.log('[STARTUP] Preloading fresh data...');
      await preloadData();
      
      console.log('[STARTUP] ✓ Railway startup sequence completed successfully!');
      
      // Keep the server running
      process.on('SIGINT', () => {
        console.log('[STARTUP] Shutting down...');
        serverProcess.kill('SIGINT');
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.log('[STARTUP] Shutting down...');
        serverProcess.kill('SIGTERM');
        process.exit(0);
      });
      
      // Wait for server process
      serverProcess.on('exit', (code) => {
        console.log(`[STARTUP] Server process exited with code ${code}`);
        process.exit(code);
      });
      
    } catch (error) {
      console.error('[STARTUP] Startup sequence failed:', error);
      process.exit(1);
    }
  } else {
    // Development or non-Railway environment - just start normally
    console.log('[STARTUP] Starting in standard mode...');
    const serverProcess = spawn('node', ['--max-old-space-size=4096', 'server.js'], {
      stdio: 'inherit'
    });
    
    serverProcess.on('exit', (code) => {
      process.exit(code);
    });
  }
}

// Run startup sequence
startupSequence().catch(error => {
  console.error('[STARTUP] Failed to start:', error);
  process.exit(1);
});