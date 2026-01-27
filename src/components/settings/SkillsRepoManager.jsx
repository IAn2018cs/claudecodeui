import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ArrowLeft, Plus, Trash2, ExternalLink, GitBranch, FolderGit2 } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

function SkillsRepoManager({ onClose, onChanged }) {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newRepoBranch, setNewRepoBranch] = useState('main');
  const [cloning, setCloning] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetchRepos();
  }, []);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authenticatedFetch('/api/skills/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to fetch repos');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRepo = async (e) => {
    e.preventDefault();

    if (!newRepoUrl.trim()) {
      setError('请输入仓库 URL');
      return;
    }

    try {
      setCloning(true);
      setError(null);

      const response = await authenticatedFetch('/api/skills/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newRepoUrl.trim(),
          branch: newRepoBranch.trim() || 'main'
        })
      });

      if (response.ok) {
        setNewRepoUrl('');
        setNewRepoBranch('main');
        fetchRepos();
        onChanged?.();
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to add repo');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCloning(false);
    }
  };

  const handleDeleteRepo = async (owner, repo) => {
    if (!confirm(`确定要移除仓库 "${owner}/${repo}" 吗？`)) {
      return;
    }

    try {
      setDeleting(`${owner}/${repo}`);
      const response = await authenticatedFetch(`/api/skills/repos/${owner}/${repo}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchRepos();
        onChanged?.();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to remove repo');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">管理技能仓库</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* Add Repo Form */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 space-y-4">
            <h3 className="font-medium text-foreground">添加技能仓库</h3>

            <form onSubmit={handleAddRepo} className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">仓库 URL</label>
                <Input
                  type="text"
                  placeholder="owner/name 或 https://github.com/owner/name"
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                  disabled={cloning}
                />
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">分支</label>
                <Input
                  type="text"
                  placeholder="main"
                  value={newRepoBranch}
                  onChange={(e) => setNewRepoBranch(e.target.value)}
                  disabled={cloning}
                />
              </div>

              <Button
                type="submit"
                disabled={cloning || !newRepoUrl.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {cloning ? '添加中...' : '添加仓库'}
              </Button>
            </form>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Repos List */}
          <div className="space-y-2">
            <h3 className="font-medium text-foreground">已添加的仓库</h3>

            {loading ? (
              <div className="text-center py-4 text-muted-foreground">
                加载中...
              </div>
            ) : repos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderGit2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>还没有添加任何仓库</p>
              </div>
            ) : (
              repos.map(repo => (
                <div
                  key={`${repo.owner}/${repo.repo}`}
                  className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {repo.owner}/{repo.repo}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          分支: main
                        </span>
                        <Badge variant="outline" className="text-xs">
                          识别到 {repo.skillCount} 个技能
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(repo.url, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRepo(repo.owner, repo.repo)}
                        disabled={deleting === `${repo.owner}/${repo.repo}`}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SkillsRepoManager;
