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
