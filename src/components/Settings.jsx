import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { X, Plus, Settings as SettingsIcon, Shield, AlertTriangle, Moon, Sun, Server, Edit3, Trash2, Globe, Terminal, Zap, FolderOpen, Check, LogOut, Key } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import ClaudeLogo from './ClaudeLogo';
import { authenticatedFetch, api } from '../utils/api';

// New settings components
import PermissionsContent from './settings/PermissionsContent';
import McpServersContent from './settings/McpServersContent';
import ModelsContent from './settings/ModelsContent';
import UserManagement from './settings/UserManagement';
import EmailDomainWhitelist from './settings/EmailDomainWhitelist';
import UsageDashboard from './UsageDashboard';
import SkillsContent from './settings/SkillsContent';

function Settings({ isOpen, onClose, projects = [], initialTab = 'agents' }) {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [allowedTools, setAllowedTools] = useState([]);
  const [disallowedTools, setDisallowedTools] = useState([]);
  const [newAllowedTool, setNewAllowedTool] = useState('');
  const [newDisallowedTool, setNewDisallowedTool] = useState('');
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [projectSortOrder, setProjectSortOrder] = useState('name');

  const [mcpServers, setMcpServers] = useState([]);
  const [showMcpForm, setShowMcpForm] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState(null);
  const [mcpFormData, setMcpFormData] = useState({
    name: '',
    type: 'stdio',
    scope: 'user',
    projectPath: '', // For local scope
    config: {
      command: '',
      args: [],
      env: {},
      url: '',
      headers: {},
      timeout: 30000
    },
    jsonInput: '', // For JSON import
    importMode: 'form' // 'form' or 'json'
  });
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpTestResults, setMcpTestResults] = useState({});
  const [mcpServerTools, setMcpServerTools] = useState({});
  const [mcpToolsLoading, setMcpToolsLoading] = useState({});
  const [activeTab, setActiveTab] = useState(initialTab);
  const [jsonValidationError, setJsonValidationError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('permissions'); // 'permissions' or 'mcp'
  const [showUsageDashboard, setShowUsageDashboard] = useState(false);

  // Change password state (for password-login users)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Code Editor settings
  const [codeEditorTheme, setCodeEditorTheme] = useState(() =>
    localStorage.getItem('codeEditorTheme') || 'dark'
  );
  const [codeEditorWordWrap, setCodeEditorWordWrap] = useState(() =>
    localStorage.getItem('codeEditorWordWrap') === 'true'
  );
  const [codeEditorShowMinimap, setCodeEditorShowMinimap] = useState(() =>
    localStorage.getItem('codeEditorShowMinimap') !== 'false' // Default true
  );
  const [codeEditorLineNumbers, setCodeEditorLineNumbers] = useState(() =>
    localStorage.getItem('codeEditorLineNumbers') !== 'false' // Default true
  );
  const [codeEditorFontSize, setCodeEditorFontSize] = useState(() =>
    localStorage.getItem('codeEditorFontSize') || '14'
  );

  // Common tool patterns for Claude
  const commonTools = [
    'Bash(git log:*)',
    'Bash(git diff:*)',
    'Bash(git status:*)',
    'Write',
    'Read',
    'Edit',
    'Glob',
    'Grep',
    'MultiEdit',
    'Task',
    'TodoWrite',
    'TodoRead',
    'WebFetch',
    'WebSearch'
  ];

  // MCP API functions
  const fetchMcpServers = async () => {
    try {
      // Try to read directly from config files for complete details
      const configResponse = await authenticatedFetch('/api/mcp/config/read');

      if (configResponse.ok) {
        const configData = await configResponse.json();
        if (configData.success && configData.servers) {
          setMcpServers(configData.servers);
          return;
        }
      }

      // Fallback to Claude CLI
      const cliResponse = await authenticatedFetch('/api/mcp/cli/list');

      if (cliResponse.ok) {
        const cliData = await cliResponse.json();
        if (cliData.success && cliData.servers) {
          // Convert CLI format to our format
          const servers = cliData.servers.map(server => ({
            id: server.name,
            name: server.name,
            type: server.type,
            scope: 'user',
            config: {
              command: server.command || '',
              args: server.args || [],
              env: server.env || {},
              url: server.url || '',
              headers: server.headers || {},
              timeout: 30000
            },
            created: new Date().toISOString(),
            updated: new Date().toISOString()
          }));
          setMcpServers(servers);
          return;
        }
      }

      // Final fallback to direct config reading
      const response = await authenticatedFetch('/api/mcp/servers?scope=user');

      if (response.ok) {
        const data = await response.json();
        setMcpServers(data.servers || []);
      } else {
        console.error('Failed to fetch MCP servers');
      }
    } catch (error) {
      console.error('Error fetching MCP servers:', error);
    }
  };

  const saveMcpServer = async (serverData) => {
    try {
      if (editingMcpServer) {
        // For editing, remove old server and add new one
        await deleteMcpServer(editingMcpServer.id, 'user');
      }

      // Use Claude CLI to add the server
      const response = await authenticatedFetch('/api/mcp/cli/add', {
        method: 'POST',
        body: JSON.stringify({
          name: serverData.name,
          type: serverData.type,
          scope: serverData.scope,
          projectPath: serverData.projectPath,
          command: serverData.config?.command,
          args: serverData.config?.args || [],
          url: serverData.config?.url,
          headers: serverData.config?.headers || {},
          env: serverData.config?.env || {}
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchMcpServers(); // Refresh the list
          return true;
        } else {
          throw new Error(result.error || 'Failed to save server via Claude CLI');
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save server');
      }
    } catch (error) {
      console.error('Error saving MCP server:', error);
      throw error;
    }
  };

  const deleteMcpServer = async (serverId, scope = 'user') => {
    try {
      // Use Claude CLI to remove the server with proper scope
      const response = await authenticatedFetch(`/api/mcp/cli/remove/${serverId}?scope=${scope}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchMcpServers(); // Refresh the list
          return true;
        } else {
          throw new Error(result.error || 'Failed to delete server via Claude CLI');
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete server');
      }
    } catch (error) {
      console.error('Error deleting MCP server:', error);
      throw error;
    }
  };

  const testMcpServer = async (serverId, scope = 'user') => {
    try {
      const response = await authenticatedFetch(`/api/mcp/servers/${serverId}/test?scope=${scope}`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        return data.testResult;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to test server');
      }
    } catch (error) {
      console.error('Error testing MCP server:', error);
      throw error;
    }
  };


  const discoverMcpTools = async (serverId, scope = 'user') => {
    try {
      const response = await authenticatedFetch(`/api/mcp/servers/${serverId}/tools?scope=${scope}`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        return data.toolsResult;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to discover tools');
      }
    } catch (error) {
      console.error('Error discovering MCP tools:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setActiveTab(initialTab);
      setShowUsageDashboard(false);
    }
  }, [isOpen, initialTab]);

  // Persist code editor settings to localStorage
  useEffect(() => {
    localStorage.setItem('codeEditorTheme', codeEditorTheme);
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorTheme]);

  useEffect(() => {
    localStorage.setItem('codeEditorWordWrap', codeEditorWordWrap.toString());
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorWordWrap]);

  useEffect(() => {
    localStorage.setItem('codeEditorShowMinimap', codeEditorShowMinimap.toString());
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorShowMinimap]);

  useEffect(() => {
    localStorage.setItem('codeEditorLineNumbers', codeEditorLineNumbers.toString());
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorLineNumbers]);

  useEffect(() => {
    localStorage.setItem('codeEditorFontSize', codeEditorFontSize);
    window.dispatchEvent(new Event('codeEditorSettingsChanged'));
  }, [codeEditorFontSize]);

  const loadSettings = async () => {
    try {

      // Load Claude settings from localStorage
      const savedSettings = localStorage.getItem('claude-settings');

      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setAllowedTools(settings.allowedTools || []);
        setDisallowedTools(settings.disallowedTools || []);
        setSkipPermissions(settings.skipPermissions || false);
        setProjectSortOrder(settings.projectSortOrder || 'name');
      } else {
        // Set defaults
        setAllowedTools([]);
        setDisallowedTools([]);
        setSkipPermissions(false);
        setProjectSortOrder('name');
      }

      // Load MCP servers from API
      await fetchMcpServers();
    } catch (error) {
      console.error('Error loading tool settings:', error);
      setAllowedTools([]);
      setDisallowedTools([]);
      setSkipPermissions(false);
      setProjectSortOrder('name');
    }
  };

  const saveSettings = () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      // Save Claude settings
      const claudeSettings = {
        allowedTools,
        disallowedTools,
        skipPermissions,
        projectSortOrder,
        lastUpdated: new Date().toISOString()
      };

      // Save to localStorage
      localStorage.setItem('claude-settings', JSON.stringify(claudeSettings));

      setSaveStatus('success');

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error saving tool settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle password change
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return;
    }

    if (!newPassword) {
      setPasswordError('请输入新密码');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('新密码至少需要6个字符');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await api.auth.changePassword(currentPassword, newPassword);
      const data = await response.json();

      if (response.ok) {
        setPasswordSuccess('密码修改成功');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setPasswordError(data.error || '修改密码失败');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordError('网络错误，请稍后再试');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Check if user is a password-login user (has username that doesn't look like an email)
  const isPasswordLoginUser = user?.username && !user.username.includes('@');

  const addAllowedTool = (tool) => {
    if (tool && !allowedTools.includes(tool)) {
      setAllowedTools([...allowedTools, tool]);
      setNewAllowedTool('');
    }
  };

  const removeAllowedTool = (tool) => {
    setAllowedTools(allowedTools.filter(t => t !== tool));
  };

  const addDisallowedTool = (tool) => {
    if (tool && !disallowedTools.includes(tool)) {
      setDisallowedTools([...disallowedTools, tool]);
      setNewDisallowedTool('');
    }
  };

  const removeDisallowedTool = (tool) => {
    setDisallowedTools(disallowedTools.filter(t => t !== tool));
  };

  // MCP form handling functions
  const resetMcpForm = () => {
    setMcpFormData({
      name: '',
      type: 'stdio',
      scope: 'user', // Default to user scope
      projectPath: '',
      config: {
        command: '',
        args: [],
        env: {},
        url: '',
        headers: {},
        timeout: 30000
      },
      jsonInput: '',
      importMode: 'form'
    });
    setEditingMcpServer(null);
    setShowMcpForm(false);
    setJsonValidationError('');
  };

  const openMcpForm = (server = null) => {
    if (server) {
      setEditingMcpServer(server);
      setMcpFormData({
        name: server.name,
        type: server.type,
        scope: server.scope,
        projectPath: server.projectPath || '',
        config: { ...server.config },
        raw: server.raw, // Store raw config for display
        importMode: 'form', // Always use form mode when editing
        jsonInput: ''
      });
    } else {
      resetMcpForm();
    }
    setShowMcpForm(true);
  };

  const handleMcpSubmit = async (e) => {
    e.preventDefault();

    setMcpLoading(true);

    try {
      if (mcpFormData.importMode === 'json') {
        // Use JSON import endpoint
        const response = await authenticatedFetch('/api/mcp/cli/add-json', {
          method: 'POST',
          body: JSON.stringify({
            name: mcpFormData.name,
            jsonConfig: mcpFormData.jsonInput,
            scope: mcpFormData.scope,
            projectPath: mcpFormData.projectPath
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            await fetchMcpServers(); // Refresh the list
            resetMcpForm();
            setSaveStatus('success');
          } else {
            throw new Error(result.error || 'Failed to add server via JSON');
          }
        } else {
          const error = await response.json();
          throw new Error(error.error || 'Failed to add server');
        }
      } else {
        // Use regular form-based save
        await saveMcpServer(mcpFormData);
        resetMcpForm();
        setSaveStatus('success');
      }
    } catch (error) {
      alert(`Error: ${error.message}`);
      setSaveStatus('error');
    } finally {
      setMcpLoading(false);
    }
  };

  const handleMcpDelete = async (serverId, scope) => {
    if (confirm('确定要删除此 MCP 服务器吗？')) {
      try {
        await deleteMcpServer(serverId, scope);
        setSaveStatus('success');
      } catch (error) {
        alert(`Error: ${error.message}`);
        setSaveStatus('error');
      }
    }
  };

  const handleMcpTest = async (serverId, scope) => {
    try {
      setMcpTestResults({ ...mcpTestResults, [serverId]: { loading: true } });
      const result = await testMcpServer(serverId, scope);
      setMcpTestResults({ ...mcpTestResults, [serverId]: result });
    } catch (error) {
      setMcpTestResults({
        ...mcpTestResults,
        [serverId]: {
          success: false,
          message: error.message,
          details: []
        }
      });
    }
  };

  const handleMcpToolsDiscovery = async (serverId, scope) => {
    try {
      setMcpToolsLoading({ ...mcpToolsLoading, [serverId]: true });
      const result = await discoverMcpTools(serverId, scope);
      setMcpServerTools({ ...mcpServerTools, [serverId]: result });
    } catch (error) {
      setMcpServerTools({
        ...mcpServerTools,
        [serverId]: {
          success: false,
          tools: [],
          resources: [],
          prompts: []
        }
      });
    } finally {
      setMcpToolsLoading({ ...mcpToolsLoading, [serverId]: false });
    }
  };

  const updateMcpConfig = (key, value) => {
    setMcpFormData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value
      }
    }));
  };


  const getTransportIcon = (type) => {
    switch (type) {
      case 'stdio': return <Terminal className="w-4 h-4" />;
      case 'sse': return <Zap className="w-4 h-4" />;
      case 'http': return <Globe className="w-4 h-4" />;
      default: return <Server className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-[9999] md:p-4 bg-background/95">
      <div className="bg-background border border-border md:rounded-lg shadow-xl w-full md:max-w-4xl h-full md:h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              设置
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground touch-manipulation"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Tab Navigation */}
          <div className="border-b border-border">
            <div className="flex px-4 md:px-6">
              <button
                onClick={() => setActiveTab('agents')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'agents'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                Agent
              </button>
              <button
                onClick={() => setActiveTab('appearance')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'appearance'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                外观
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'users'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  用户
                </button>
              )}
              <button
                onClick={() => setActiveTab('account')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'account'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                账户
              </button>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-6 md:space-y-8 pb-safe-area-inset-bottom">

            {/* Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 md:space-y-8">
                {activeTab === 'appearance' && (
                  <div className="space-y-6 md:space-y-8">
                    {/* Theme Settings */}
                    <div className="space-y-4">
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              深色模式
                            </div>
                            <div className="text-sm text-muted-foreground">
                              切换浅色和深色主题
                            </div>
                          </div>
                          <button
                            onClick={toggleDarkMode}
                            className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                            role="switch"
                            aria-checked={isDarkMode}
                            aria-label="Toggle dark mode"
                          >
                            <span className="sr-only">Toggle dark mode</span>
                            <span
                              className={`${isDarkMode ? 'translate-x-7' : 'translate-x-1'
                                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200 flex items-center justify-center`}
                            >
                              {isDarkMode ? (
                                <Moon className="w-3.5 h-3.5 text-gray-700" />
                              ) : (
                                <Sun className="w-3.5 h-3.5 text-yellow-500" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Project Sorting */}
                    <div className="space-y-4">
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              项目排序
                            </div>
                            <div className="text-sm text-muted-foreground">
                              侧边栏中项目的排序方式
                            </div>
                          </div>
                          <select
                            value={projectSortOrder}
                            onChange={(e) => setProjectSortOrder(e.target.value)}
                            className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 w-32"
                          >
                            <option value="name">按字母顺序</option>
                            <option value="date">按最近活动</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Code Editor Settings */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">代码编辑器</h3>

                      {/* Editor Theme */}
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              编辑器主题
                            </div>
                            <div className="text-sm text-muted-foreground">
                              代码编辑器的默认主题
                            </div>
                          </div>
                          <button
                            onClick={() => setCodeEditorTheme(codeEditorTheme === 'dark' ? 'light' : 'dark')}
                            className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                            role="switch"
                            aria-checked={codeEditorTheme === 'dark'}
                            aria-label="Toggle editor theme"
                          >
                            <span className="sr-only">Toggle editor theme</span>
                            <span
                              className={`${codeEditorTheme === 'dark' ? 'translate-x-7' : 'translate-x-1'
                                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200 flex items-center justify-center`}
                            >
                              {codeEditorTheme === 'dark' ? (
                                <Moon className="w-3.5 h-3.5 text-gray-700" />
                              ) : (
                                <Sun className="w-3.5 h-3.5 text-yellow-500" />
                              )}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Word Wrap */}
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              自动换行
                            </div>
                            <div className="text-sm text-muted-foreground">
                              在编辑器中默认启用自动换行
                            </div>
                          </div>
                          <button
                            onClick={() => setCodeEditorWordWrap(!codeEditorWordWrap)}
                            className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                            role="switch"
                            aria-checked={codeEditorWordWrap}
                            aria-label="Toggle word wrap"
                          >
                            <span className="sr-only">Toggle word wrap</span>
                            <span
                              className={`${codeEditorWordWrap ? 'translate-x-7' : 'translate-x-1'
                                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Show Minimap */}
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              显示小地图
                            </div>
                            <div className="text-sm text-muted-foreground">
                              在差异视图中显示小地图以便于导航
                            </div>
                          </div>
                          <button
                            onClick={() => setCodeEditorShowMinimap(!codeEditorShowMinimap)}
                            className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                            role="switch"
                            aria-checked={codeEditorShowMinimap}
                            aria-label="Toggle minimap"
                          >
                            <span className="sr-only">Toggle minimap</span>
                            <span
                              className={`${codeEditorShowMinimap ? 'translate-x-7' : 'translate-x-1'
                                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Show Line Numbers */}
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              显示行号
                            </div>
                            <div className="text-sm text-muted-foreground">
                              在编辑器中显示行号
                            </div>
                          </div>
                          <button
                            onClick={() => setCodeEditorLineNumbers(!codeEditorLineNumbers)}
                            className="relative inline-flex h-8 w-14 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                            role="switch"
                            aria-checked={codeEditorLineNumbers}
                            aria-label="Toggle line numbers"
                          >
                            <span className="sr-only">Toggle line numbers</span>
                            <span
                              className={`${codeEditorLineNumbers ? 'translate-x-7' : 'translate-x-1'
                                } inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Font Size */}
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              字体大小
                            </div>
                            <div className="text-sm text-muted-foreground">
                              编辑器字体大小（像素）
                            </div>
                          </div>
                          <select
                            value={codeEditorFontSize}
                            onChange={(e) => setCodeEditorFontSize(e.target.value)}
                            className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 w-24"
                          >
                            <option value="10">10px</option>
                            <option value="11">11px</option>
                            <option value="12">12px</option>
                            <option value="13">13px</option>
                            <option value="14">14px</option>
                            <option value="15">15px</option>
                            <option value="16">16px</option>
                            <option value="18">18px</option>
                            <option value="20">20px</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}



            {/* Agents Tab */}
            {activeTab === 'agents' && (
              <div className="flex flex-col h-full min-h-[400px] md:min-h-[500px]">
                {/* Main Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Category Tabs */}
                  <div className="border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex px-2 md:px-4 overflow-x-auto">
                      <button
                        onClick={() => setSelectedCategory('permissions')}
                        className={`px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${selectedCategory === 'permissions'
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        权限
                      </button>
                      <button
                        onClick={() => setSelectedCategory('mcp')}
                        className={`px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${selectedCategory === 'mcp'
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        MCP 服务器
                      </button>
                      <button
                        onClick={() => setSelectedCategory('skills')}
                        className={`px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${selectedCategory === 'skills'
                          ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        技能
                      </button>
                      <button
                        onClick={() => setSelectedCategory('models')}
                        className={`px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${selectedCategory === 'models'
                          ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        模型
                      </button>
                    </div>
                  </div>

                  {/* Category Content */}
                  <div className="flex-1 overflow-y-auto p-3 md:p-4">
                    {/* Permissions Category */}
                    {selectedCategory === 'permissions' && (
                      <PermissionsContent
                        agent="claude"
                        skipPermissions={skipPermissions}
                        setSkipPermissions={setSkipPermissions}
                        allowedTools={allowedTools}
                        setAllowedTools={setAllowedTools}
                        disallowedTools={disallowedTools}
                        setDisallowedTools={setDisallowedTools}
                        newAllowedTool={newAllowedTool}
                        setNewAllowedTool={setNewAllowedTool}
                        newDisallowedTool={newDisallowedTool}
                        setNewDisallowedTool={setNewDisallowedTool}
                      />
                    )}

                    {/* MCP Servers Category */}
                    {selectedCategory === 'mcp' && (
                      <McpServersContent
                        agent="claude"
                        servers={mcpServers}
                        onAdd={() => openMcpForm()}
                        onEdit={(server) => openMcpForm(server)}
                        onDelete={(serverId, scope) => handleMcpDelete(serverId, scope)}
                        onTest={(serverId, scope) => handleMcpTest(serverId, scope)}
                        onDiscoverTools={(serverId, scope) => handleMcpToolsDiscovery(serverId, scope)}
                        testResults={mcpTestResults}
                        serverTools={mcpServerTools}
                        toolsLoading={mcpToolsLoading}
                      />
                    )}

                    {/* Skills Category */}
                    {selectedCategory === 'skills' && (
                      <SkillsContent />
                    )}

                    {/* Models Category */}
                    {selectedCategory === 'models' && (
                      <ModelsContent />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && isAdmin && (
              <div className="space-y-6 md:space-y-8">
                {showUsageDashboard ? (
                  <UsageDashboard onBack={() => setShowUsageDashboard(false)} />
                ) : (
                  <>
                    <UserManagement onNavigateToUsage={() => setShowUsageDashboard(true)} />
                    <EmailDomainWhitelist />
                  </>
                )}
              </div>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <div className="space-y-6 md:space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">账户</h3>

                  {/* Current User Info */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-lg font-semibold text-primary">
                          {user?.username?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {user?.username}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {user?.role === 'admin' ? '管理员' : '用户'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Change Password - Only for password-login users */}
                  {isPasswordLoginUser && (
                    <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Key className="w-5 h-5 text-blue-600" />
                        <div className="font-medium text-foreground">修改密码</div>
                      </div>
                      <form onSubmit={handleChangePassword} className="space-y-3">
                        <div>
                          <label htmlFor="currentPassword" className="block text-sm font-medium text-foreground mb-1">
                            当前密码
                          </label>
                          <input
                            type="password"
                            id="currentPassword"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="请输入当前密码"
                            disabled={passwordLoading}
                          />
                        </div>
                        <div>
                          <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-1">
                            新密码
                          </label>
                          <input
                            type="password"
                            id="newPassword"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="请输入新密码（至少6个字符）"
                            disabled={passwordLoading}
                          />
                        </div>
                        <div>
                          <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-foreground mb-1">
                            确认新密码
                          </label>
                          <input
                            type="password"
                            id="confirmNewPassword"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="请再次输入新密码"
                            disabled={passwordLoading}
                          />
                        </div>

                        {passwordError && (
                          <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
                            <p className="text-sm text-red-700 dark:text-red-400">{passwordError}</p>
                          </div>
                        )}

                        {passwordSuccess && (
                          <div className="p-3 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800 rounded-md">
                            <p className="text-sm text-green-700 dark:text-green-400">{passwordSuccess}</p>
                          </div>
                        )}

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={passwordLoading}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {passwordLoading ? '修改中...' : '修改密码'}
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Logout Button */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">
                          退出登录
                        </div>
                        <div className="text-sm text-muted-foreground">
                          结束当前会话
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="gap-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => {
                          if (confirm('确定要退出登录吗？')) {
                            onClose();
                            navigate('/');
                            logout();
                          }
                        }}
                      >
                        <LogOut className="w-4 h-4" />
                        退出
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MCP Server Form Modal */}
            {showMcpForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
                <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-medium text-foreground">
                      {editingMcpServer ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={resetMcpForm}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <form onSubmit={handleMcpSubmit} className="p-4 space-y-4">

                    {!editingMcpServer && (
                      <div className="flex gap-2 mb-4">
                        <button
                          type="button"
                          onClick={() => setMcpFormData(prev => ({ ...prev, importMode: 'form' }))}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${mcpFormData.importMode === 'form'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                          表单输入
                        </button>
                        <button
                          type="button"
                          onClick={() => setMcpFormData(prev => ({ ...prev, importMode: 'json' }))}
                          className={`px-4 py-2 rounded-lg font-medium transition-colors ${mcpFormData.importMode === 'json'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                          JSON 导入
                        </button>
                      </div>
                    )}

                    {/* Show current scope when editing */}
                    {mcpFormData.importMode === 'form' && editingMcpServer && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <label className="block text-sm font-medium text-foreground mb-2">
                          作用域
                        </label>
                        <div className="flex items-center gap-2">
                          {mcpFormData.scope === 'user' ? <Globe className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                          <span className="text-sm">
                            {mcpFormData.scope === 'user' ? '用户（全局）' : '项目（本地）'}
                          </span>
                          {mcpFormData.scope === 'local' && mcpFormData.projectPath && (
                            <span className="text-xs text-muted-foreground">
                              - {mcpFormData.projectPath}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          编辑现有服务器时无法更改作用域
                        </p>
                      </div>
                    )}

                    {/* Scope Selection - Moved to top, disabled when editing */}
                    {mcpFormData.importMode === 'form' && !editingMcpServer && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            作用域 *
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setMcpFormData(prev => ({ ...prev, scope: 'user', projectPath: '' }))}
                              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${mcpFormData.scope === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <Globe className="w-4 h-4" />
                                <span>用户（全局）</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setMcpFormData(prev => ({ ...prev, scope: 'local' }))}
                              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${mcpFormData.scope === 'local'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <FolderOpen className="w-4 h-4" />
                                <span>项目（本地）</span>
                              </div>
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {mcpFormData.scope === 'user'
                              ? '用户作用域：在您机器上的所有项目中可用'
                              : '本地作用域：仅在选定的项目中可用'
                            }
                          </p>
                        </div>

                        {/* Project Selection for Local Scope */}
                        {mcpFormData.scope === 'local' && !editingMcpServer && (
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                              项目 *
                            </label>
                            <select
                              value={mcpFormData.projectPath}
                              onChange={(e) => setMcpFormData(prev => ({ ...prev, projectPath: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                              required={mcpFormData.scope === 'local'}
                            >
                              <option value="">选择项目...</option>
                              {projects.map(project => (
                                <option key={project.name} value={project.path || project.fullPath}>
                                  {project.displayName || project.name}
                                </option>
                              ))}
                            </select>
                            {mcpFormData.projectPath && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Path: {mcpFormData.projectPath}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={mcpFormData.importMode === 'json' ? 'md:col-span-2' : ''}>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          服务器名称 *
                        </label>
                        <Input
                          value={mcpFormData.name}
                          onChange={(e) => {
                            setMcpFormData(prev => ({ ...prev, name: e.target.value }));
                          }}
                          placeholder="my-server"
                          required
                        />
                      </div>

                      {mcpFormData.importMode === 'form' && (
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            传输类型 *
                          </label>
                          <select
                            value={mcpFormData.type}
                            onChange={(e) => {
                              setMcpFormData(prev => ({ ...prev, type: e.target.value }));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="stdio">stdio</option>
                            <option value="sse">SSE</option>
                            <option value="http">HTTP</option>
                          </select>
                        </div>
                      )}
                    </div>


                    {/* Show raw configuration details when editing */}
                    {editingMcpServer && mcpFormData.raw && mcpFormData.importMode === 'form' && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-foreground mb-2">
                          配置详情 (from {editingMcpServer.scope === 'global' ? '~/.claude.json' : 'project config'})
                        </h4>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                          {JSON.stringify(mcpFormData.raw, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* JSON Import Mode */}
                    {mcpFormData.importMode === 'json' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            JSON 配置 *
                          </label>
                          <textarea
                            value={mcpFormData.jsonInput}
                            onChange={(e) => {
                              setMcpFormData(prev => ({ ...prev, jsonInput: e.target.value }));
                              // Validate JSON as user types
                              try {
                                if (e.target.value.trim()) {
                                  const parsed = JSON.parse(e.target.value);
                                  // Basic validation
                                  if (!parsed.type) {
                                    setJsonValidationError('缺少必填字段：type');
                                  } else if (parsed.type === 'stdio' && !parsed.command) {
                                    setJsonValidationError('stdio 类型需要 command 字段');
                                  } else if ((parsed.type === 'http' || parsed.type === 'sse') && !parsed.url) {
                                    setJsonValidationError(`${parsed.type} 类型需要 url 字段`);
                                  } else {
                                    setJsonValidationError('');
                                  }
                                }
                              } catch (err) {
                                if (e.target.value.trim()) {
                                  setJsonValidationError('无效的 JSON 格式');
                                } else {
                                  setJsonValidationError('');
                                }
                              }
                            }}
                            className={`w-full px-3 py-2 border ${jsonValidationError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm`}
                            rows="8"
                            placeholder={'{\n  "type": "stdio",\n  "command": "/path/to/server",\n  "args": ["--api-key", "abc123"],\n  "env": {\n    "CACHE_DIR": "/tmp"\n  }\n}'}
                            required
                          />
                          {jsonValidationError && (
                            <p className="text-xs text-red-500 mt-1">{jsonValidationError}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            以 JSON 格式粘贴您的 MCP 服务器配置。示例格式：
                            <br />• stdio: {`{"type":"stdio","command":"npx","args":["@upstash/context7-mcp"]}`}
                            <br />• http/sse: {`{"type":"http","url":"https://api.example.com/mcp"}`}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Transport-specific Config - Only show in form mode */}
                    {mcpFormData.importMode === 'form' && mcpFormData.type === 'stdio' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            命令 *
                          </label>
                          <Input
                            value={mcpFormData.config.command}
                            onChange={(e) => updateMcpConfig('command', e.target.value)}
                            placeholder="/path/to/mcp-server"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">
                            参数（每行一个）
                          </label>
                          <textarea
                            value={Array.isArray(mcpFormData.config.args) ? mcpFormData.config.args.join('\n') : ''}
                            onChange={(e) => updateMcpConfig('args', e.target.value.split('\n').filter(arg => arg.trim()))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows="3"
                            placeholder="--api-key&#10;abc123"
                          />
                        </div>
                      </div>
                    )}

                    {mcpFormData.importMode === 'form' && (mcpFormData.type === 'sse' || mcpFormData.type === 'http') && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          URL *
                        </label>
                        <Input
                          value={mcpFormData.config.url}
                          onChange={(e) => updateMcpConfig('url', e.target.value)}
                          placeholder="https://api.example.com/mcp"
                          type="url"
                          required
                        />
                      </div>
                    )}

                    {/* Environment Variables - Only show in form mode */}
                    {mcpFormData.importMode === 'form' && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          环境变量（KEY=value，每行一个）
                        </label>
                        <textarea
                          value={Object.entries(mcpFormData.config.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                          onChange={(e) => {
                            const env = {};
                            e.target.value.split('\n').forEach(line => {
                              const [key, ...valueParts] = line.split('=');
                              if (key && key.trim()) {
                                env[key.trim()] = valueParts.join('=').trim();
                              }
                            });
                            updateMcpConfig('env', env);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          rows="3"
                          placeholder="API_KEY=your-key&#10;DEBUG=true"
                        />
                      </div>
                    )}

                    {mcpFormData.importMode === 'form' && (mcpFormData.type === 'sse' || mcpFormData.type === 'http') && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          请求头（KEY=value，每行一个）
                        </label>
                        <textarea
                          value={Object.entries(mcpFormData.config.headers || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                          onChange={(e) => {
                            const headers = {};
                            e.target.value.split('\n').forEach(line => {
                              const [key, ...valueParts] = line.split('=');
                              if (key && key.trim()) {
                                headers[key.trim()] = valueParts.join('=').trim();
                              }
                            });
                            updateMcpConfig('headers', headers);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          rows="3"
                          placeholder="Authorization=Bearer token&#10;X-API-Key=your-key"
                        />
                      </div>
                    )}


                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={resetMcpForm}>
                        取消
                      </Button>
                      <Button
                        type="submit"
                        disabled={mcpLoading}
                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                      >
                        {mcpLoading ? '保存中...' : (editingMcpServer ? '更新服务器' : '添加服务器')}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 md:p-6 border-t border-border flex-shrink-0 gap-3 pb-safe-area-inset-bottom">
          <div className="flex items-center justify-center sm:justify-start gap-2 order-2 sm:order-1">
            {saveStatus === 'success' && (
              <div className="text-green-600 dark:text-green-400 text-sm flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                设置保存成功！
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="text-red-600 dark:text-red-400 text-sm flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                保存设置失败
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 order-1 sm:order-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-none h-10 touch-manipulation"
            >
              取消
            </Button>
            <Button
              onClick={saveSettings}
              disabled={isSaving}
              className="flex-1 sm:flex-none h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 touch-manipulation"
            >
              {isSaving ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  保存中...
                </div>
              ) : (
                '保存设置'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
