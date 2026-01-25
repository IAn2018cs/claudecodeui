import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Trash2, UserCheck, UserX, Shield, User, BarChart3 } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

function UserManagement({ onNavigateToUsage }) {
  const [users, setUsers] = useState([]);
  const [usageData, setUsageData] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsageData = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/usage/summary');
      if (response.ok) {
        const data = await response.json();
        // Create a map of uuid to usage data
        const usageMap = {};
        for (const user of data.users) {
          usageMap[user.user_uuid] = {
            total_cost: user.total_cost || 0,
            total_requests: user.total_requests || 0,
            last_active: user.last_active
          };
        }
        setUsageData(usageMap);
      }
    } catch (error) {
      console.error('Error fetching usage data:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchUsageData();
  }, []);

  const formatCost = (cost) => {
    if (!cost || cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const toggleStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    setActionLoading(userId);
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        setUsers(users.map(u =>
          u.id === userId ? { ...u, status: newStatus } : u
        ));
      }
    } catch (error) {
      console.error('Error updating user status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId, username) => {
    if (!confirm(`确定要删除用户 "${username}"？这将删除其所有数据。`)) {
      return;
    }
    setActionLoading(userId);
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setUsers(users.filter(u => u.id !== userId));
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">正在加载用户...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">用户管理</h3>
        {onNavigateToUsage && (
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateToUsage}
            className="flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            使用量统计
          </Button>
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">用户</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">角色</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">费用</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">创建时间</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {user.role === 'admin' ? (
                      <Shield className="w-4 h-4 text-blue-500" />
                    ) : (
                      <User className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-medium text-foreground">{user.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role === 'admin' ? '管理员' : '用户'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>
                    {user.status === 'active' ? '活跃' : '已禁用'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono text-sm text-foreground">
                    {formatCost(usageData[user.uuid]?.total_cost)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {user.role !== 'admin' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStatus(user.id, user.status)}
                          disabled={actionLoading === user.id}
                          title={user.status === 'active' ? '禁用用户' : '启用用户'}
                        >
                          {user.status === 'active' ? (
                            <UserX className="w-4 h-4 text-orange-500" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-green-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteUser(user.id, user.username)}
                          disabled={actionLoading === user.id}
                          title="删除用户"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserManagement;
