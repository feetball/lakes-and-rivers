#!/usr/bin/env node

/**
 * Smart startup script for Railway deployment
 * - Checks if Redis is needed and available
 * - Starts the Next.js server appropriately
 */

const { spawn } = require('child_process');
const { createConnection } = require('net');

async function checkRedis() {
  const redisHost = process.env.REDIS_HOST || 'redis';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  
  // If no REDIS_URL is set, skip Redis check
  if (!process.env.REDIS_URL) {
    console.log('No REDIS_URL configured, starting without Redis...');
    return true;
  }
  
  console.log(`Checking Redis at ${redisHost}:${redisPort}...`);
  
  return new Promise((resolve) => {
    const socket = createConnection({ port: redisPort, host: redisHost });
    
    const timeout = setTimeout(() => {
      socket.destroy();
      console.log('Redis not available, starting without cache...');
      resolve(true); // Continue anyway
    }, 5000); // 5 second timeout
    
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      console.log('Redis is available!');
      resolve(true);
    });
    
    socket.on('error', () => {
      clearTimeout(timeout);
      console.log('Redis connection failed, starting without cache...');
      resolve(true); // Continue anyway
    });
  });
}

async function startServer() {
  await checkRedis();
  
  console.log('Starting Next.js server...');
  
  // In production Docker, we should be in the standalone directory
  // In development, use npm start
  const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  
  let command, args;
  if (isDevelopment) {
    command = 'npm';
    args = ['start'];
  } else {
    // In production Docker, the working directory is set up by the Dockerfile
    // and server.js from standalone build is available at the root
    command = 'node';
    args = ['--max-old-space-size=4096', 'server.js'];
  }
  
  const server = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  // In production with Redis available, preload static data after server starts
  if (!isDevelopment && process.env.REDIS_URL) {
    console.log('Production mode with Redis - will clear and preload static data after server startup...');
    
    // Wait a few seconds for server to be fully ready, then clear and preload
    setTimeout(async () => {
      try {
        console.log('Starting Redis database cleanup and static data preload...');
        
        // First, clear the Redis database
        console.log('Clearing Redis database...');
        const clearResponse = await fetch(`http://localhost:${process.env.PORT || '3000'}/api/admin/cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'clear' })
        });
        
        if (clearResponse.ok) {
          console.log('✓ Redis database cleared successfully');
        } else {
          console.warn('⚠ Redis clear failed, continuing with preload anyway');
        }
        
        // Then preload static data
        console.log('Loading static data into clean Redis database...');
        const { preloadData } = require('./preload-data.js');
        await preloadData('localhost', parseInt(process.env.PORT || '3000'));
        console.log('✓ Static data preload completed successfully!');
      } catch (error) {
        console.warn('Static data preload failed, app will use live APIs:', error.message);
      }
    }, 10000); // Wait 10 seconds for server to be ready
  }
  
  server.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
  });
  
  // Handle process signals
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.kill('SIGTERM');
  });
  
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.kill('SIGINT');
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
