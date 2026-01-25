import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, DollarSign, Users, MessageSquare, TrendingUp, RefreshCw } from 'lucide-react';
import { authenticatedFetch } from '../utils/api';

function UsageDashboard({ onBack }) {
  const [period, setPeriod] = useState('week');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const response = await authenticatedFetch(`/api/admin/usage/dashboard?period=${period}`);
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchDashboardData();
  }, [period]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const triggerScan = async () => {
    try {
      setRefreshing(true);
      await authenticatedFetch('/api/admin/usage/scan', { method: 'POST' });
      await fetchDashboardData();
    } catch (error) {
      console.error('Error triggering scan:', error);
      setRefreshing(false);
    }
  };

  const formatCost = (cost) => {
    if (!cost || cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载仪表板中...</div>
      </div>
    );
  }

  const { totals, dailyTrend, modelDistribution, topUsers } = dashboardData || {};

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
          )}
          <h2 className="text-2xl font-bold text-foreground">使用情况仪表板</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {['week', 'month'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground hover:bg-muted'
                }`}
              >
                {p === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={triggerScan}
            disabled={refreshing}
            title="扫描新的使用数据"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">总成本</p>
              <p className="text-2xl font-bold text-foreground">{formatCost(totals?.totalCost)}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">活跃用户</p>
              <p className="text-2xl font-bold text-foreground">
                {totals?.activeUsers || 0} / {totals?.totalUsers || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">总请求数</p>
              <p className="text-2xl font-bold text-foreground">{formatNumber(totals?.totalRequests)}</p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">会话数</p>
              <p className="text-2xl font-bold text-foreground">{formatNumber(totals?.totalSessions)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-foreground mb-4">每日成本趋势</h3>
          {dailyTrend && dailyTrend.length > 0 ? (
            <div className="space-y-2">
              {dailyTrend.map((day) => {
                const maxCost = Math.max(...dailyTrend.map(d => d.cost || 0), 0.01);
                const percentage = ((day.cost || 0) / maxCost) * 100;
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-20 shrink-0">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-foreground w-16 text-right">
                      {formatCost(day.cost)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">无可用的使用数据</div>
          )}
        </div>

        {/* Model Distribution */}
        <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-foreground mb-4">模型成本</h3>
          {modelDistribution && modelDistribution.length > 0 ? (
            <div className="space-y-3">
              {modelDistribution.map((model) => {
                const totalCost = modelDistribution.reduce((sum, m) => sum + (m.cost || 0), 0) || 1;
                const percentage = ((model.cost || 0) / totalCost) * 100;
                const colors = {
                  opus: 'bg-purple-500',
                  sonnet: 'bg-blue-500',
                  haiku: 'bg-green-500'
                };
                const bgColor = colors[model.model] || 'bg-gray-500';
                return (
                  <div key={model.model} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">{model.model}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatNumber(model.requests)} 请求
                        </span>
                      </div>
                      <span className="text-sm font-mono text-foreground">{formatCost(model.cost)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                      <div
                        className={`h-full ${bgColor} rounded`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">无可用的使用数据</div>
          )}
        </div>
      </div>

      {/* Top Users */}
      <div className="bg-card border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">用户成本</h3>
        {topUsers && topUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">排名</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">用户名</th>
                  <th className="text-right py-2 text-sm font-medium text-muted-foreground">请求数</th>
                  <th className="text-right py-2 text-sm font-medium text-muted-foreground">成本</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((user, index) => (
                  <tr key={user.user_uuid} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <td className="py-2 text-sm text-muted-foreground">#{index + 1}</td>
                    <td className="py-2 text-sm font-medium text-foreground">{user.username}</td>
                    <td className="py-2 text-sm text-right text-muted-foreground">
                      {formatNumber(user.total_requests)}
                    </td>
                    <td className="py-2 text-sm text-right font-mono text-foreground">
                      {formatCost(user.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">无可用的使用数据</div>
        )}
      </div>
    </div>
  );
}

export default UsageDashboard;
