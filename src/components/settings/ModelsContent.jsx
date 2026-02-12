import { useState, useEffect } from 'react';
import { Info, Save, RotateCcw } from 'lucide-react';
import { authenticatedFetch } from '../../utils/api';

const MODEL_FIELDS = [
  {
    key: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    label: 'Opus 模型',
    placeholder: '例如: claude-opus-4-6',
    description: '覆盖 opus 别名使用的模型，Plan Mode 激活时也用于 opusplan'
  },
  {
    key: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    label: 'Sonnet 模型',
    placeholder: '例如: claude-sonnet-4-5-20250929',
    description: '覆盖 sonnet 别名使用的模型，Plan Mode 未激活时也用于 opusplan'
  },
  {
    key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    label: 'Haiku 模型',
    placeholder: '例如: claude-haiku-4-5-20251001',
    description: '覆盖 haiku 别名使用的模型，也用于后台功能'
  },
  {
    key: 'CLAUDE_CODE_SUBAGENT_MODEL',
    label: 'Subagent 模型',
    placeholder: '例如: claude-haiku-4-5-20251001',
    description: '覆盖子代理（subagents）使用的模型'
  },
];

function ModelsContent() {
  const [models, setModels] = useState({});
  const [originalModels, setOriginalModels] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error'
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchModels();
  }, []);

  // Clear save status after 3 seconds
  useEffect(() => {
    if (saveStatus) {
      const timer = setTimeout(() => setSaveStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authenticatedFetch('/api/settings/models');
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || {});
        setOriginalModels(data.models || {});
      } else {
        const err = await response.json();
        setError(err.error || '加载模型配置失败');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveStatus(null);
      const response = await authenticatedFetch('/api/settings/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models })
      });
      if (response.ok) {
        setSaveStatus('success');
        setOriginalModels({ ...models });
      } else {
        const err = await response.json();
        setSaveStatus('error');
        setError(err.error || '保存失败');
      }
    } catch (err) {
      setSaveStatus('error');
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setModels({ ...originalModels });
    setSaveStatus(null);
  };

  const hasChanges = JSON.stringify(models) !== JSON.stringify(originalModels);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-sm text-muted-foreground">加载模型配置...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p>自定义模型 ID 来覆盖 Claude Code 使用的默认模型。留空表示使用默认模型。</p>
          <p className="mt-1 text-blue-600 dark:text-blue-400">非 Claude 模型将按 Sonnet 定价计费，但统计中会记录实际模型 ID。</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Model fields */}
      {MODEL_FIELDS.map((field) => (
        <div key={field.key} className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="space-y-2">
            <div>
              <label className="font-medium text-sm text-foreground">{field.label}</label>
              <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
            </div>
            <input
              type="text"
              value={models[field.key] || ''}
              onChange={(e) => setModels(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
            />
            <p className="text-xs text-muted-foreground font-mono">{field.key}</p>
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {saveStatus === 'success' && (
            <span className="text-sm text-green-600 dark:text-green-400">模型配置已保存</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-red-600 dark:text-red-400">保存失败</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModelsContent;
