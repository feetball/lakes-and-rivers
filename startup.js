#!/usr/bin/env node

// Startup script to run preload and then start the server
async function startup() {
  console.log('[STARTUP] Starting Next.js server...');
  
  // Start the Next.js server first
  require('./server.js');
  
  // Wait a moment for the server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('[STARTUP] Running preload scripts via API...');
  
  try {
    // Trigger preload by calling the health endpoint (which runs the preload)
    console.log('[STARTUP] Triggering preload via /api/health...');
    const response = await fetch('http://localhost:3000/api/health');
    
    if (response.ok) {
      const data = await response.json();
      console.log('[STARTUP] Health check response:', data);
      console.log('[STARTUP] Preload triggered successfully');
    } else {
      console.warn('[STARTUP] Health check failed:', response.status);
    }
  } catch (error) {
    console.error('[STARTUP] Preload trigger failed:', error);
    // Continue anyway - server is already running
  }
}

startup().catch((error) => {
  console.error('[STARTUP] Startup failed:', error);
  process.exit(1);
});
