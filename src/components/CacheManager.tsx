'use client';

import React, { useState, useEffect } from 'react';

interface CacheStatsProps {
  onClearCache?: () => void;
}

interface CacheStats {
  totalKeys: number;
  usgsData: number;
  historicalData: number;
  waterways: number;
  siteMetadata: number;
  floodStages: number;
}

const CacheManager: React.FC<CacheStatsProps> = ({ onClearCache }) => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLocalNetwork, setIsLocalNetwork] = useState(false);

  // Check if user is on local network
  useEffect(() => {
    const checkLocalNetwork = () => {
      // Check if accessing from localhost or 192.168.11.x network
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || 
                     hostname === '127.0.0.1' || 
                     hostname.startsWith('192.168.11.') ||
                     hostname.startsWith('10.') ||
                     hostname.startsWith('172.16.') ||
                     hostname.startsWith('172.17.') ||
                     hostname.startsWith('172.18.') ||
                     hostname.startsWith('172.19.') ||
                     hostname.startsWith('172.2') ||
                     hostname.startsWith('172.30.') ||
                     hostname.startsWith('172.31.');
      
      setIsLocalNetwork(isLocal);
    };

    checkLocalNetwork();
  }, []);

  // Don't render anything if not on local network
  if (!isLocalNetwork) {
    return null;
  }

  const fetchCacheStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cache');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error('Failed to fetch cache stats');
      }
    } catch (error) {
      console.error('Error fetching cache stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearSpecificCache = async (cacheType: string) => {
    try {
      console.log(`Clearing ${cacheType} cache...`);
      const response = await fetch(`/api/cache?type=${cacheType}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`Cleared ${result.deletedKeys} keys for ${cacheType}`);
        await fetchCacheStats(); // Refresh stats
      } else {
        console.error(`Failed to clear ${cacheType} cache`);
      }
    } catch (error) {
      console.error(`Error clearing ${cacheType} cache:`, error);
    }
  };

  const clearAllCache = async () => {
    try {
      console.log('Clearing all cache...');
      const response = await fetch('/api/cache?type=all', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`Cleared ${result.deletedKeys} total keys`);
        await fetchCacheStats(); // Refresh stats
      } else {
        console.error('Failed to clear all cache');
      }
    } catch (error) {
      console.error('Error clearing all cache:', error);
    }
  };

  if (!isExpanded) {
    return (
      <div className="absolute top-20 right-4 z-[1000]">
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm shadow-lg"
          title="Cache Management"
        >
          📊 Cache
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-20 right-4 z-[1000] bg-white rounded-lg shadow-lg border p-4 min-w-72">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg text-gray-800">Cache Management</h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-gray-500 hover:text-gray-700 text-xl leading-none"
        >
          ×
        </button>
      </div>

      {!stats ? (
        <div className="text-center">
          <button
            onClick={fetchCacheStats}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Cache Stats'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm font-medium text-gray-700">Cache Statistics</div>
            <div className="text-lg font-bold text-blue-600">{stats.totalKeys} total keys</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Cache Breakdown:</div>
            
            <div className="space-y-1 text-sm">
              <div className="flex justify-between items-center">
                <span>USGS Current Data:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.usgsData}</span>
                  <button
                    onClick={() => clearSpecificCache('usgs')}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-300 rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span>Historical Data:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.historicalData}</span>
                  <button
                    onClick={() => clearSpecificCache('historical')}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-300 rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span>Waterways:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.waterways}</span>
                  <button
                    onClick={() => clearSpecificCache('waterways')}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-300 rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span>Site Metadata:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.siteMetadata}</span>
                  <button
                    onClick={() => clearSpecificCache('metadata')}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-300 rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <span>Flood Stages:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{stats.floodStages}</span>
                  <button
                    onClick={() => clearSpecificCache('flood')}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 border border-red-300 rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <button
              onClick={() => fetchCacheStats()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
            >
              Refresh Stats
            </button>
            
            <button
              onClick={clearAllCache}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
            >
              Clear All Cache
            </button>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <div><strong>Cache TTLs:</strong></div>
            <div>• USGS Current: 15 minutes</div>
            <div>• Historical Data: 1 hour</div>
            <div>• Waterways: 24 hours</div>
            <div>• Site Metadata: 24 hours</div>
            <div>• Flood Stages: 7 days</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CacheManager;
