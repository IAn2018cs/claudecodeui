import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { X, Search, Download, ExternalLink, RefreshCw, Settings } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

function SkillsDiscoverModal({ onClose, onInstalled, onOpenRepoManager }) {
  const [skills, setSkills] = useState([]);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('all');
  const [installing, setInstalling] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [skillsRes, reposRes] = await Promise.all([
        authenticatedFetch('/api/skills/available'),
        authenticatedFetch('/api/skills/repos')
      ]);

      if (skillsRes.ok) {
        const data = await skillsRes.json();
        setSkills(data.skills || []);
      }

      if (reposRes.ok) {
        const data = await reposRes.json();
        setRepos(data.repos || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (skill) => {
    try {
      setInstalling(skill.name);
      const response = await authenticatedFetch(`/api/skills/install/${skill.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillPath: skill.path })
      });

      if (response.ok) {
        // Refresh list
        fetchData();
        onInstalled?.();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to install skill');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setInstalling(null);
    }
  };

  const filteredSkills = skills.filter(skill => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!skill.name.toLowerCase().includes(query) &&
          !skill.title?.toLowerCase().includes(query) &&
          !skill.description?.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Repo filter
    if (selectedRepo !== 'all' && skill.repository !== selectedRepo) {
      return false;
    }

    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Skills 管理</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="ml-1 hidden sm:inline">刷新</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenRepoManager}
            >
              <Settings className="w-4 h-4" />
              <span className="ml-1 hidden sm:inline">仓库管理</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Sub-header: Discover Skills */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-amber-500 font-medium">发现技能</h3>
        </div>

        {/* Filters */}
        <div className="px-4 pb-4 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="搜索技能名称或描述..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm min-w-[120px]"
          >
            <option value="all">全部</option>
            {repos.map(repo => (
              <option key={`${repo.owner}/${repo.repo}`} value={`${repo.owner}/${repo.repo}`}>
                {repo.owner}/{repo.repo}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-4 pb-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              加载中...
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {skills.length === 0 ? (
                <>
                  <p>没有可用的技能</p>
                  <p className="text-xs mt-2">请先添加技能仓库</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={onOpenRepoManager}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    管理仓库
                  </Button>
                </>
              ) : (
                <p>没有找到匹配的技能</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSkills.map(skill => (
                <div
                  key={`${skill.repository}-${skill.name}`}
                  className="border border-border rounded-lg p-4 hover:border-amber-500/50 transition-colors"
                >
                  <div className="flex flex-col h-full">
                    <div className="mb-2">
                      <h4 className="font-medium text-foreground">{skill.title || skill.name}</h4>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-muted-foreground">skills/{skill.name}</span>
                        <Badge variant="outline" className="text-xs ml-2">
                          {skill.repository}
                        </Badge>
                      </div>
                    </div>

                    {skill.description && (
                      <p className="text-sm text-muted-foreground flex-1 line-clamp-3 mb-3">
                        {skill.description}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`https://github.com/${skill.repository}`, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        查看
                      </Button>

                      {skill.installed ? (
                        <Button
                          size="sm"
                          disabled
                          variant="outline"
                          className="ml-auto"
                        >
                          已安装
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white ml-auto"
                          onClick={() => handleInstall(skill)}
                          disabled={installing === skill.name}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          {installing === skill.name ? '安装中...' : '安装'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SkillsDiscoverModal;
