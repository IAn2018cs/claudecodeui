import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Sparkles, Search, Download, Trash2 } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';
import SkillsDiscoverModal from './SkillsDiscoverModal';
import SkillsRepoManager from './SkillsRepoManager';

function SkillsContent() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showRepoManager, setShowRepoManager] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authenticatedFetch('/api/skills');
      if (response.ok) {
        const data = await response.json();
        setSkills(data.skills || []);
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to fetch skills');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (skillName) => {
    if (!confirm(`确定要删除技能 "${skillName}" 吗？`)) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/skills/${skillName}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchSkills();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to delete skill');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportLoading(true);
      const formData = new FormData();
      formData.append('skillZip', file);

      const response = await authenticatedFetch('/api/skills/import', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        fetchSkills();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to import skill');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getSourceBadge = (source, repository) => {
    switch (source) {
      case 'repo':
        return (
          <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
            {repository || '仓库'}
          </Badge>
        );
      case 'imported':
        return (
          <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">
            导入
          </Badge>
        );
      case 'public':
        return (
          <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
            公共
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            本地
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-medium text-foreground">
          Skills 管理
        </h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Skills 是 Claude Code 的扩展能力，可以通过 SKILLS.md 文件定义自定义指令和工作流程
      </p>

      {/* Stats & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          已安装：Claude: <span className="font-medium text-foreground">{skills.length}</span> 个技能
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={handleImportClick}
            variant="outline"
            size="sm"
            disabled={importLoading}
          >
            <Download className="w-4 h-4 mr-2" />
            {importLoading ? '导入中...' : '导入已有'}
          </Button>
          <Button
            onClick={() => setShowDiscoverModal(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            size="sm"
          >
            <Search className="w-4 h-4 mr-2" />
            发现技能
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Skills List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            加载中...
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>还没有安装任何技能</p>
            <p className="text-xs mt-2">点击"发现技能"从仓库安装，或"导入已有"上传本地技能</p>
          </div>
        ) : (
          skills.map(skill => (
            <div
              key={skill.name}
              className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-foreground">{skill.title || skill.name}</span>
                    {getSourceBadge(skill.source, skill.repository)}
                  </div>

                  {skill.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(skill.name)}
                    className="text-red-500 hover:text-red-600"
                    title="删除技能"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Discover Modal */}
      {showDiscoverModal && (
        <SkillsDiscoverModal
          onClose={() => setShowDiscoverModal(false)}
          onInstalled={fetchSkills}
          onOpenRepoManager={() => {
            setShowDiscoverModal(false);
            setShowRepoManager(true);
          }}
        />
      )}

      {/* Repo Manager Modal */}
      {showRepoManager && (
        <SkillsRepoManager
          onClose={() => setShowRepoManager(false)}
          onChanged={() => {}}
        />
      )}
    </div>
  );
}

export default SkillsContent;
