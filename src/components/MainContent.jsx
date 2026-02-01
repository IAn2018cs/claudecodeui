/*
 * MainContent.jsx - Main Content Area with Session Protection Props Passthrough
 * 
 * SESSION PROTECTION PASSTHROUGH:
 * ===============================
 * 
 * This component serves as a passthrough layer for Session Protection functions:
 * - Receives session management functions from App.jsx
 * - Passes them down to ChatInterface.jsx
 * 
 * No session protection logic is implemented here - it's purely a props bridge.
 */

import React, { useState, useEffect, useRef } from 'react';
import ChatInterface from './ChatInterface';
import FileTree from './FileTree';
import CodeEditor from './CodeEditor';
import StandaloneShell from './StandaloneShell';
import ErrorBoundary from './ErrorBoundary';
import ClaudeLogo from './ClaudeLogo';
import Tooltip from './Tooltip';
import { api } from '../utils/api';

function MainContent({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  messages,
  isMobile,
  isPWA,
  onMenuClick,
  isLoading,
  onInputFocusChange,
  // Session Protection Props: Functions passed down from App.jsx to manage active session state
  // These functions control when project updates are paused during active conversations
  onSessionActive,        // Mark session as active when user sends message
  onSessionInactive,      // Mark session as inactive when conversation completes/aborts
  onSessionProcessing,    // Mark session as processing (thinking/working)
  onSessionNotProcessing, // Mark session as not processing (finished thinking)
  processingSessions,     // Set of session IDs currently processing
  onReplaceTemporarySession, // Replace temporary session ID with real session ID from WebSocket
  onNavigateToSession,    // Navigate to a specific session (for Claude CLI session duplication workaround)
  onShowSettings,         // Show tools settings panel
  autoExpandTools,        // Auto-expand tool accordions
  showRawParameters,      // Show raw parameters in tool accordions
  showThinking,           // Show thinking/reasoning sections
  autoScrollToBottom,     // Auto-scroll to bottom when new messages arrive
  sendByCtrlEnter,        // Send by Ctrl+Enter mode for East Asian language input
  externalMessageUpdate,  // Trigger for external CLI updates to current session
  // Usage limit props
  limitStatus,            // Current user's spending limit status
  onLimitBlocked,         // Callback when user is blocked by limit
  checkLimitStatus        // Function to refresh limit status
}) {
  const [editingFile, setEditingFile] = useState(null);
  const [editorWidth, setEditorWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const resizeRef = useRef(null);

  // Check limit status when switching to Shell tab
  useEffect(() => {
    if (activeTab === 'shell' && checkLimitStatus) {
      checkLimitStatus();
    }
  }, [activeTab, checkLimitStatus]);

  const handleFileOpen = (filePath, diffInfo = null) => {
    // Create a file object that CodeEditor expects
    const file = {
      name: filePath.split('/').pop(),
      path: filePath,
      projectName: selectedProject?.name,
      diffInfo: diffInfo // Pass along diff information if available
    };
    setEditingFile(file);
  };

  const handleCloseEditor = () => {
    setEditingFile(null);
    setEditorExpanded(false);
  };

  const handleToggleEditorExpand = () => {
    setEditorExpanded(!editorExpanded);
  };

  // Handle resize functionality
  const handleMouseDown = (e) => {
    if (isMobile) return; // Disable resize on mobile
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const container = resizeRef.current?.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;

      // Min width: 300px, Max width: 80% of container
      const minWidth = 300;
      const maxWidth = containerRect.width * 0.8;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setEditorWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {/* Header with menu button for mobile */}
        {isMobile && (
          <div
            className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0"
          >
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 pwa-menu-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="w-12 h-12 mx-auto mb-4">
              <div
                className="w-full h-full rounded-full border-4 border-gray-200 border-t-blue-500"
                style={{
                  animation: 'spin 1s linear infinite',
                  WebkitAnimation: 'spin 1s linear infinite',
                  MozAnimation: 'spin 1s linear infinite'
                }}
              />
            </div>
            <h2 className="text-xl font-semibold mb-2">正在加载 AgentHub</h2>
            <p>正在设置您的工作区...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div className="h-full flex flex-col">
        {/* Header with menu button for mobile */}
        {isMobile && (
          <div
            className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0"
          >
            <button
              onClick={onMenuClick}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 pwa-menu-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500 dark:text-gray-400 max-w-md mx-auto px-6">
            <div className="w-16 h-16 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">选择您的项目</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              从侧边栏选择一个项目，开始与 Claude 进行编码。每个项目包含您的聊天会话和文件历史。
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 <strong>提示：</strong> {isMobile ? '点击上方菜单按钮访问项目' : '点击侧边栏中的文件夹图标创建新项目'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs */}
      <div
        className="bg-background border-b border-border p-2 sm:p-3 pwa-header-safe flex-shrink-0"
      >
        <div className="flex items-center justify-between relative">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            {isMobile && (
              <button
                onClick={onMenuClick}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onMenuClick();
                }}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 touch-manipulation active:scale-95 pwa-menu-button flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <div className="min-w-0 flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide">
              {activeTab === 'chat' && selectedSession && (
                <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                  <ClaudeLogo className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {activeTab === 'chat' && selectedSession ? (
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap overflow-x-auto scrollbar-hide">
                      {selectedSession.summary || '新会话'}
                    </h2>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {selectedProject.displayName}
                    </div>
                  </div>
                ) : activeTab === 'chat' && !selectedSession ? (
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
                      新会话
                    </h2>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {selectedProject.displayName}
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
                      {activeTab === 'files' ? '项目文件' : '项目'}
                    </h2>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {selectedProject.displayName}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Modern Tab Navigation - Right Side */}
          <div className="flex-shrink-0 hidden sm:block">
            <div className="relative flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <Tooltip content="Chat" position="bottom">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${activeTab === 'chat'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="hidden md:hidden lg:inline">Chat</span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content={limitStatus && !limitStatus.allowed ? "使用已达上限" : "Shell"} position="bottom">
                <button
                  onClick={() => {
                    if (limitStatus && !limitStatus.allowed) {
                      onLimitBlocked?.(limitStatus.reason);
                      return;
                    }
                    setActiveTab('shell');
                  }}
                  className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                    limitStatus && !limitStatus.allowed
                      ? 'opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-500'
                      : activeTab === 'shell'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden md:hidden lg:inline">Shell</span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="Files" position="bottom">
                <button
                  onClick={() => setActiveTab('files')}
                  className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${activeTab === 'files'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="hidden md:hidden lg:inline">Files</span>
                  </span>
                </button>
              </Tooltip>
              {/* <button
                onClick={() => setActiveTab('preview')}
                className={`relative px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all duration-200 ${
                  activeTab === 'preview'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              > 
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <svg className="w-3 sm:w-3.5 h-3 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span className="hidden sm:inline">Preview</span>
                </span>
              </button> */}
            </div>
          </div>
        </div>
      </div>

      {/* Content Area with Right Sidebar */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Main Content */}
        <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${editingFile ? 'mr-0' : ''} ${editorExpanded ? 'hidden' : ''}`}>
          <div className={`h-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
            <ErrorBoundary showDetails={true}>
              <ChatInterface
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                ws={ws}
                sendMessage={sendMessage}
                messages={messages}
                onFileOpen={handleFileOpen}
                onInputFocusChange={onInputFocusChange}
                onSessionActive={onSessionActive}
                onSessionInactive={onSessionInactive}
                onSessionProcessing={onSessionProcessing}
                onSessionNotProcessing={onSessionNotProcessing}
                processingSessions={processingSessions}
                onReplaceTemporarySession={onReplaceTemporarySession}
                onNavigateToSession={onNavigateToSession}
                onShowSettings={onShowSettings}
                autoExpandTools={autoExpandTools}
                showRawParameters={showRawParameters}
                showThinking={showThinking}
                autoScrollToBottom={autoScrollToBottom}
                sendByCtrlEnter={sendByCtrlEnter}
                externalMessageUpdate={externalMessageUpdate}
                limitStatus={limitStatus}
                onLimitExceeded={onLimitBlocked}
                checkLimitStatus={checkLimitStatus}
              />
            </ErrorBoundary>
          </div>
          {activeTab === 'files' && (
            <div className="h-full overflow-hidden">
              <FileTree selectedProject={selectedProject} />
            </div>
          )}
          {activeTab === 'shell' && (
            <div className="h-full w-full overflow-hidden relative">
              <StandaloneShell
                project={selectedProject}
                session={selectedSession}
                showHeader={false}
              />
              {/* Limit exceeded overlay for Shell */}
              {limitStatus && !limitStatus.allowed && (
                <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center">
                  <div className="bg-card border border-border rounded-lg shadow-xl p-6 mx-4 max-w-md text-center">
                    <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {limitStatus.reason === 'total_limit_exceeded' ? '使用上限已达到' : '今日使用上限已达到'}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {limitStatus.reason === 'total_limit_exceeded'
                        ? '您已达到使用上限，请联系管理员提升额度。'
                        : '您已达到今日使用上限，请明日再来或联系管理员提升额度。'}
                    </p>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      返回 Chat
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className={`h-full overflow-hidden ${activeTab === 'preview' ? 'block' : 'hidden'}`}>
            {/* <LivePreviewPanel
            selectedProject={selectedProject}
            serverStatus={serverStatus}
            serverUrl={serverUrl}
            availableScripts={availableScripts}
            onStartServer={(script) => {
              sendMessage({
                type: 'server:start',
                projectPath: selectedProject?.fullPath,
                script: script
              });
            }}
            onStopServer={() => {
              sendMessage({
                type: 'server:stop',
                projectPath: selectedProject?.fullPath
              });
            }}
            onScriptSelect={setCurrentScript}
            currentScript={currentScript}
            isMobile={isMobile}
            serverLogs={serverLogs}
            onClearLogs={() => setServerLogs([])}
          /> */}
          </div>
        </div>

        {/* Code Editor Right Sidebar - Desktop only, Mobile uses modal */}
        {editingFile && !isMobile && (
          <>
            {/* Resize Handle - Hidden when expanded */}
            {!editorExpanded && (
              <div
                ref={resizeRef}
                onMouseDown={handleMouseDown}
                className="flex-shrink-0 w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-600 cursor-col-resize transition-colors relative group"
                title="Drag to resize"
              >
                {/* Visual indicator on hover */}
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-blue-500 dark:bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}

            {/* Editor Sidebar */}
            <div
              className={`flex-shrink-0 border-l border-gray-200 dark:border-gray-700 h-full overflow-hidden ${editorExpanded ? 'flex-1' : ''}`}
              style={editorExpanded ? {} : { width: `${editorWidth}px` }}
            >
              <CodeEditor
                file={editingFile}
                onClose={handleCloseEditor}
                projectPath={selectedProject?.path}
                isSidebar={true}
                isExpanded={editorExpanded}
                onToggleExpand={handleToggleEditorExpand}
              />
            </div>
          </>
        )}
      </div>

      {/* Code Editor Modal for Mobile */}
      {editingFile && isMobile && (
        <CodeEditor
          file={editingFile}
          onClose={handleCloseEditor}
          projectPath={selectedProject?.path}
          isSidebar={false}
        />
      )}
    </div>
  );
}

export default React.memo(MainContent);