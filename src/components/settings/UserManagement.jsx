import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Trash2, UserCheck, UserX, Shield, User, BarChart3, UserPlus, X } from 'lucide-react';
import { authenticatedFetch, api } from '../../utils/api';

function UserManagement({ onNavigateToUsage }) {
  const [users, setUsers] = useState([]);
  const [usageData, setUsageData] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

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

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!newUsername || !newPassword) {
      setCreateError('用户名和密码不能为空');
      return;
    }

    if (newUsername.length < 3) {
      setCreateError('用户名至少3个字符');
      return;
    }

    if (newPassword.length < 6) {
      setCreateError('密码至少6个字符');
      return;
    }

    setCreateLoading(true);

    try {
      const response = await api.admin.createUser(newUsername, newPassword);
      const data = await response.json();

      if (response.ok) {
        // Refresh user list
        await fetchUsers();
        // Close modal and reset form
        setShowCreateModal(false);
        setNewUsername('');
        setNewPassword('');
      } else {
        setCreateError(data.error || '创建用户失败');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      setCreateError('网络错误，请稍后再试');
    } finally {
      setCreateLoading(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewUsername('');
    setNewPassword('');
    setCreateError('');
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">正在加载用户...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">用户管理</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            创建用户
          </Button>
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
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      {user.role === 'admin' ? (
                        <Shield className="w-4 h-4 text-blue-500" />
                      ) : (
                        <User className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="font-medium text-foreground">
                        {user.username || user.email}
                      </span>
                    </div>
                    {user.email && user.username && (
                      <span className="text-xs text-muted-foreground ml-6">{user.email}</span>
                    )}
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
                          onClick={() => deleteUser(user.id, user.username || user.email)}
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

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-foreground">创建用户</h4>
              <button
                onClick={closeCreateModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="newUsername" className="block text-sm font-medium text-foreground mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  id="newUsername"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入用户名"
                  disabled={createLoading}
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-1">
                  密码
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入密码"
                  disabled={createLoading}
                />
              </div>

              {createError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{createError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateModal}
                  disabled={createLoading}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={createLoading}
                >
                  {createLoading ? '创建中...' : '创建'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
