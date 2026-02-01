import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Trash2, UserCheck, UserX, Shield, User, BarChart3, UserPlus, X, DollarSign } from 'lucide-react';
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

  // Limit editing state
  const [editingLimits, setEditingLimits] = useState(null);
  const [limitForm, setLimitForm] = useState({ total_limit_usd: '', daily_limit_usd: '' });
  const [limitError, setLimitError] = useState('');
  const [limitLoading, setLimitLoading] = useState(false);

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

  // Open limit editing modal
  const openLimitModal = (user) => {
    setEditingLimits(user);
    setLimitForm({
      total_limit_usd: user.total_limit_usd !== null && user.total_limit_usd !== undefined ? String(user.total_limit_usd) : '',
      daily_limit_usd: user.daily_limit_usd !== null && user.daily_limit_usd !== undefined ? String(user.daily_limit_usd) : ''
    });
    setLimitError('');
  };

  const closeLimitModal = () => {
    setEditingLimits(null);
    setLimitForm({ total_limit_usd: '', daily_limit_usd: '' });
    setLimitError('');
  };

  const handleSaveLimits = async (e) => {
    e.preventDefault();
    setLimitError('');

    // Parse values - empty string means null (no limit)
    const totalLimit = limitForm.total_limit_usd.trim() === '' ? null : parseFloat(limitForm.total_limit_usd);
    const dailyLimit = limitForm.daily_limit_usd.trim() === '' ? null : parseFloat(limitForm.daily_limit_usd);

    // Validate
    if (totalLimit !== null && (isNaN(totalLimit) || totalLimit < 0)) {
      setLimitError('总额度限制必须是正数或留空');
      return;
    }
    if (dailyLimit !== null && (isNaN(dailyLimit) || dailyLimit < 0)) {
      setLimitError('每日额度限制必须是正数或留空');
      return;
    }

    setLimitLoading(true);

    try {
      const response = await api.admin.updateUserLimits(editingLimits.id, {
        total_limit_usd: totalLimit,
        daily_limit_usd: dailyLimit
      });
      const data = await response.json();

      if (response.ok) {
        // Update local state
        setUsers(users.map(u =>
          u.id === editingLimits.id
            ? { ...u, total_limit_usd: totalLimit, daily_limit_usd: dailyLimit }
            : u
        ));
        closeLimitModal();
      } else {
        setLimitError(data.error || '更新限制失败');
      }
    } catch (error) {
      console.error('Error updating limits:', error);
      setLimitError('网络错误，请稍后再试');
    } finally {
      setLimitLoading(false);
    }
  };

  // Format limit display
  const formatLimit = (value) => {
    if (value === null || value === undefined) return '无限制';
    return `$${value.toFixed(2)}`;
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

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">用户</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-16">角色</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-16">状态</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-20">费用</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">额度限制</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-24">创建时间</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-20">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {user.role === 'admin' ? (
                      <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-foreground text-sm truncate">
                        {user.username || user.email}
                      </div>
                      {user.email && user.username && (
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${
                    user.role === 'admin'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {user.role === 'admin' ? '管理员' : '用户'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    user.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                  }`} title={user.status === 'active' ? '活跃' : '已禁用'} />
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="font-mono text-xs text-foreground whitespace-nowrap">
                    {formatCost(usageData[user.uuid]?.total_cost)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {user.role !== 'admin' ? (
                    <button
                      onClick={() => openLimitModal(user)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono whitespace-nowrap"
                      title="点击编辑额度限制"
                    >
                      {user.total_limit_usd !== null || user.daily_limit_usd !== null ? (
                        <span className="flex flex-col items-end text-[11px] leading-tight">
                          <span>总:{formatLimit(user.total_limit_usd)}</span>
                          <span>日:{formatLimit(user.daily_limit_usd)}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 justify-end">
                          <DollarSign className="w-3 h-3" />
                          限额
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {user.role !== 'admin' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
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
                          className="h-7 w-7 p-0"
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

      {/* Edit Limits Modal */}
      {editingLimits && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-foreground">
                设置额度限制 - {editingLimits.username || editingLimits.email}
              </h4>
              <button
                onClick={closeLimitModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLimits} className="space-y-4">
              <div>
                <label htmlFor="totalLimit" className="block text-sm font-medium text-foreground mb-1">
                  总额度上限 (USD)
                </label>
                <input
                  type="number"
                  id="totalLimit"
                  step="0.01"
                  min="0"
                  value={limitForm.total_limit_usd}
                  onChange={(e) => setLimitForm(prev => ({ ...prev, total_limit_usd: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="留空表示不限制"
                  disabled={limitLoading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  用户累计使用金额达到此限制后，将无法继续使用
                </p>
              </div>

              <div>
                <label htmlFor="dailyLimit" className="block text-sm font-medium text-foreground mb-1">
                  每日额度上限 (USD)
                </label>
                <input
                  type="number"
                  id="dailyLimit"
                  step="0.01"
                  min="0"
                  value={limitForm.daily_limit_usd}
                  onChange={(e) => setLimitForm(prev => ({ ...prev, daily_limit_usd: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="留空表示不限制"
                  disabled={limitLoading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  用户每日使用金额达到此限制后，需等待次日重置
                </p>
              </div>

              {/* Current usage info */}
              {usageData[editingLimits.uuid] && (
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                  <p className="text-sm text-muted-foreground">
                    当前已使用：<span className="font-mono text-foreground">{formatCost(usageData[editingLimits.uuid]?.total_cost)}</span>
                  </p>
                </div>
              )}

              {limitError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{limitError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeLimitModal}
                  disabled={limitLoading}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={limitLoading}
                >
                  {limitLoading ? '保存中...' : '保存'}
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
