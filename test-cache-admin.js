#!/usr/bin/env node

/**
 * Test script for cache admin functionality
 * Usage: node test-cache-admin.js [base-url] [username] [password]
 */

const https = require('https');
const http = require('http');

const baseUrl = process.argv[2] || 'http://localhost:3000';
const username = process.argv[3] || 'feetball';
const password = process.argv[4] || '0deacon5';

const auth = Buffer.from(`${username}:${password}`).toString('base64');

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function testCacheAdmin() {
  console.log('🧪 Testing Cache Admin Functionality');
  console.log(`📍 Base URL: ${baseUrl}`);
  console.log(`👤 Username: ${username}`);
  console.log('');

  try {
    // Test authentication and get status
    console.log('1️⃣ Testing authentication...');
    const statusResponse = await makeRequest('/api/admin/cache');
    
    if (statusResponse.status === 401) {
      console.log('❌ Authentication failed - check credentials');
      return;
    } else if (statusResponse.status !== 200) {
      console.log(`❌ Unexpected status: ${statusResponse.status}`);
      console.log(statusResponse.data);
      return;
    }

    console.log('✅ Authentication successful');
    console.log(`📊 Cache Status:`, statusResponse.data.cache);
    console.log('');

    // Test clearing waterways cache
    console.log('2️⃣ Testing waterways cache clear...');
    const clearResponse = await makeRequest('/api/admin/cache', 'POST', {
      action: 'clear_waterways'
    });

    if (clearResponse.status === 200) {
      console.log('✅ Waterways cache cleared successfully');
      console.log(`📝 Result:`, clearResponse.data.result.message);
    } else {
      console.log(`❌ Clear failed: ${clearResponse.status}`);
      console.log(clearResponse.data);
    }
    console.log('');

    // Test invalid action
    console.log('3️⃣ Testing invalid action handling...');
    const invalidResponse = await makeRequest('/api/admin/cache', 'POST', {
      action: 'invalid_action'
    });

    if (invalidResponse.status === 400) {
      console.log('✅ Invalid action properly rejected');
    } else {
      console.log(`❌ Unexpected response to invalid action: ${invalidResponse.status}`);
    }
    console.log('');

    console.log('🎉 Cache admin tests completed!');
    console.log('');
    console.log('📱 Web Interface Available at:');
    console.log(`   ${baseUrl}/admin/cache.html`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Check if this is being run directly
if (require.main === module) {
  testCacheAdmin();
}

module.exports = { testCacheAdmin, makeRequest };
