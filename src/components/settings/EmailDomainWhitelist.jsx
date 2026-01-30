import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Trash2, Plus, Mail, X } from 'lucide-react';
import { api } from '../../utils/api';

function EmailDomainWhitelist() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Add domain modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const fetchDomains = async () => {
    try {
      const response = await api.admin.getEmailDomains();
      if (response.ok) {
        const data = await response.json();
        setDomains(data.domains);
      }
    } catch (error) {
      console.error('Error fetching email domains:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  const handleAddDomain = async (e) => {
    e.preventDefault();
    setAddError('');

    if (!newDomain) {
      setAddError('域名不能为空');
      return;
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(newDomain)) {
      setAddError('域名格式无效，例如: example.com');
      return;
    }

    setAddLoading(true);

    try {
      const response = await api.admin.addEmailDomain(newDomain.toLowerCase());
      const data = await response.json();

      if (response.ok) {
        await fetchDomains();
        setShowAddModal(false);
        setNewDomain('');
      } else {
        setAddError(data.error || '添加域名失败');
      }
    } catch (error) {
      console.error('Error adding domain:', error);
      setAddError('网络错误，请稍后再试');
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveDomain = async (id, domain) => {
    if (!confirm(`确定要删除域名 "${domain}"？删除后该域名的邮箱将无法注册。`)) {
      return;
    }

    setActionLoading(id);

    try {
      const response = await api.admin.removeEmailDomain(id);
      if (response.ok) {
        setDomains(domains.filter(d => d.id !== id));
      }
    } catch (error) {
      console.error('Error removing domain:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewDomain('');
    setAddError('');
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">正在加载...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">邮箱域名白名单</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {domains.length === 0
              ? '未设置白名单，所有邮箱域名均可注册'
              : '只有白名单内的域名邮箱可以注册'}
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加域名
        </Button>
      </div>

      {domains.length > 0 ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">域名</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">添加时间</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {domains.map(domain => (
                <tr key={domain.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-foreground">{domain.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(domain.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDomain(domain.id, domain.domain)}
                        disabled={actionLoading === domain.id}
                        title="删除域名"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
          <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            暂无域名白名单，所有邮箱域名均可注册
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            添加域名后，只有白名单内的域名邮箱可以注册
          </p>
        </div>
      )}

      {/* Add Domain Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-foreground">添加域名</h4>
              <button
                onClick={closeAddModal}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label htmlFor="newDomain" className="block text-sm font-medium text-foreground mb-1">
                  邮箱域名
                </label>
                <input
                  type="text"
                  id="newDomain"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如: example.com"
                  disabled={addLoading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  输入域名后，该域名下的所有邮箱（如 user@example.com）都可以注册
                </p>
              </div>

              {addError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-700 dark:text-red-400">{addError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeAddModal}
                  disabled={addLoading}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={addLoading}
                >
                  {addLoading ? '添加中...' : '添加'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailDomainWhitelist;
