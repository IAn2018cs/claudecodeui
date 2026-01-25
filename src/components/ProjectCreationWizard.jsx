import React, { useState } from 'react';
import { X, FolderPlus, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { api } from '../utils/api';

// Project name validation: only letters, numbers, hyphens, and underscores
const PROJECT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

const ProjectCreationWizard = ({ onClose, onProjectCreated }) => {
  // Form state
  const [projectName, setProjectName] = useState('');
  const [githubUrl, setGithubUrl] = useState('');

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const validateProjectName = (name) => {
    if (!name.trim()) {
      return '项目名称为必填项';
    }
    if (!PROJECT_NAME_REGEX.test(name.trim())) {
      return '项目名称只能包含字母、数字、连字符和下划线';
    }
    return null;
  };

  const handleCreate = async () => {
    setError(null);

    // Validate project name
    const nameError = validateProjectName(projectName);
    if (nameError) {
      setError(nameError);
      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        name: projectName.trim(),
      };

      // Add GitHub URL if provided
      if (githubUrl.trim()) {
        payload.githubUrl = githubUrl.trim();
      }

      const response = await api.createWorkspace(payload);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create project');
      }

      // Success!
      if (onProjectCreated) {
        onProjectCreated(data.project);
      }

      onClose();
    } catch (error) {
      console.error('Error creating project:', error);
      setError(error.message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isCreating) {
      handleCreate();
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-none sm:rounded-lg shadow-xl w-full h-full sm:h-auto sm:max-w-md border-0 sm:border border-gray-200 dark:border-gray-700 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
              <FolderPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              创建新项目
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            disabled={isCreating}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          )}

          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              项目名称 <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="my-awesome-project"
              className="w-full"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              仅允许字母、数字、连字符和下划线
            </p>
          </div>

          {/* GitHub URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              GitHub 链接（可选）
            </label>
            <Input
              type="text"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/user/repo"
              className="w-full"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              留空以创建空项目，或输入公共仓库链接以克隆
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isCreating}
          >
            取消
          </Button>

          <Button
            onClick={handleCreate}
            disabled={isCreating || !projectName.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              '创建项目'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProjectCreationWizard;
