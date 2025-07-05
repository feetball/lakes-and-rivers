import React, { useState, useEffect } from 'react';

interface CacheStats {
  timestamp: string;
  redis: {
    memoryUsage: string;
    peakMemory: string;
    totalKeys: number;
    uptime: string;
  };
  summary: {
    totalKeys: number;
    usgsData: number;
    historicalData: number;
    waterways: number;
    siteMetadata: number;
    floodStages: number;
    other: number;
  };
  detailed: Record<string, any>;
  efficiency: {
    totalCachedItems: number;
    estimatedHitRate: string;
    mostCachedType: string;
    cacheUtilization: string;
  };
  recommendations: Array<{
    type: string;
    message: string;
    priority: string;
  }>;
}

export default function CacheStatsView() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cache-stats');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cache statistics');
      console.error('Error fetching cache stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getUtilizationColor = (utilization: string) => {
    switch (utilization.toLowerCase()) {
      case 'high': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (loading && !stats) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-center mt-2 text-gray-600">Loading cache statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="text-red-600 mb-4">
          <h3 className="text-lg font-semibold">Error Loading Cache Statistics</h3>
          <p className="text-sm">{error}</p>
        </div>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Cache Statistics</h2>
          <p className="text-sm text-gray-600">
            Last updated: {new Date(stats.timestamp).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Redis Health */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-800">Memory Usage</h3>
          <p className="text-2xl font-bold text-blue-600">{stats.redis.memoryUsage}</p>
          <p className="text-xs text-blue-600">Peak: {stats.redis.peakMemory}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-green-800">Total Keys</h3>
          <p className="text-2xl font-bold text-green-600">{stats.redis.totalKeys}</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-purple-800">Uptime</h3>
          <p className="text-2xl font-bold text-purple-600">{stats.redis.uptime}</p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-orange-800">Cache Utilization</h3>
          <p className={`text-2xl font-bold ${getUtilizationColor(stats.efficiency.cacheUtilization)}`}>
            {stats.efficiency.cacheUtilization}
          </p>
          <p className="text-xs text-orange-600">Hit Rate: {stats.efficiency.estimatedHitRate}</p>
        </div>
      </div>

      {/* Cache Breakdown */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Cache Distribution</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">USGS Data</p>
            <p className="text-lg font-bold">{stats.summary.usgsData}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Historical</p>
            <p className="text-lg font-bold">{stats.summary.historicalData}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Waterways</p>
            <p className="text-lg font-bold">{stats.summary.waterways}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Metadata</p>
            <p className="text-lg font-bold">{stats.summary.siteMetadata}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Flood Stages</p>
            <p className="text-lg font-bold">{stats.summary.floodStages}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-xs text-gray-600">Other</p>
            <p className="text-lg font-bold">{stats.summary.other}</p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {stats.recommendations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Recommendations</h3>
          <div className="space-y-2">
            {stats.recommendations.map((rec, index) => (
              <div key={index} className="flex items-start p-3 bg-gray-50 rounded">
                <span className={`inline-block w-2 h-2 rounded-full mt-2 mr-3 ${
                  rec.priority === 'high' ? 'bg-red-500' :
                  rec.priority === 'medium' ? 'bg-yellow-500' :
                  rec.priority === 'low' ? 'bg-blue-500' : 'bg-gray-500'
                }`}></span>
                <div>
                  <span className={`text-xs font-semibold uppercase ${getPriorityColor(rec.priority)}`}>
                    {rec.priority} - {rec.type}
                  </span>
                  <p className="text-sm text-gray-700">{rec.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Stats */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Detailed Cache Information</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Keys</th>
                <th className="text-left p-2">Avg Size</th>
                <th className="text-left p-2">With TTL</th>
                <th className="text-left p-2">Oldest Key</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(stats.detailed).map((detail: any, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2 font-medium">{detail.type}</td>
                  <td className="p-2">{detail.count}</td>
                  <td className="p-2">{detail.avgSize > 0 ? `${Math.round(detail.avgSize / 1024)}KB` : 'N/A'}</td>
                  <td className="p-2">{detail.expirationInfo.withTTL}</td>
                  <td className="p-2 text-xs text-gray-600 max-w-xs truncate">
                    {detail.oldestKey || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
