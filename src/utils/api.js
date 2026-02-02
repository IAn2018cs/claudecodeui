// Utility function for authenticated API calls
export const authenticatedFetch = (url, options = {}) => {
  const isPlatform = import.meta.env.VITE_IS_PLATFORM === 'true';
  const token = localStorage.getItem('auth-token');

  const defaultHeaders = {};

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  if (!isPlatform && token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
};

// API endpoints
export const api = {
  // Auth endpoints (no token required)
  auth: {
    status: () => fetch('/api/auth/status'),
    login: (username, password) => fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    sendCode: (email) => fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
    verifyCode: (email, code) => fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    }),
    user: () => authenticatedFetch('/api/auth/user'),
    logout: () => authenticatedFetch('/api/auth/logout', { method: 'POST' }),
    // Spending limit status
    limitStatus: () => authenticatedFetch('/api/auth/limit-status'),
    // Change password (for password-login users)
    changePassword: (currentPassword, newPassword) => authenticatedFetch('/api/auth/change-password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  },

  // Admin endpoints
  admin: {
    getUsers: () => authenticatedFetch('/api/admin/users'),
    createUser: (username, password) => authenticatedFetch('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    updateUserStatus: (userId, status) => authenticatedFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    deleteUser: (userId) => authenticatedFetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),
    // Email domain whitelist
    getEmailDomains: () => authenticatedFetch('/api/admin/email-domains'),
    addEmailDomain: (domain) => authenticatedFetch('/api/admin/email-domains', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),
    removeEmailDomain: (id) => authenticatedFetch(`/api/admin/email-domains/${id}`, {
      method: 'DELETE',
    }),
    // User spending limits
    getUserLimits: (userId) => authenticatedFetch(`/api/admin/users/${userId}/limits`),
    updateUserLimits: (userId, limits) => authenticatedFetch(`/api/admin/users/${userId}/limits`, {
      method: 'PATCH',
      body: JSON.stringify(limits),
    }),
    // Reset user password (admin only)
    resetUserPassword: (userId, newPassword) => authenticatedFetch(`/api/admin/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ new_password: newPassword }),
    }),
  },

  // Protected endpoints
  // config endpoint removed - no longer needed (frontend uses window.location)
  projects: () => authenticatedFetch('/api/projects'),
  sessions: (projectName, limit = 5, offset = 0) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions?limit=${limit}&offset=${offset}`),
  sessionMessages: (projectName, sessionId, limit = null, offset = 0) => {
    const params = new URLSearchParams();
    if (limit !== null) {
      params.append('limit', limit);
      params.append('offset', offset);
    }
    const queryString = params.toString();
    const url = `/api/projects/${projectName}/sessions/${sessionId}/messages${queryString ? `?${queryString}` : ''}`;
    return authenticatedFetch(url);
  },
  renameProject: (projectName, displayName) =>
    authenticatedFetch(`/api/projects/${projectName}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    }),
  deleteSession: (projectName, sessionId) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  deleteProject: (projectName) =>
    authenticatedFetch(`/api/projects/${projectName}`, {
      method: 'DELETE',
    }),
  createProject: (path) =>
    authenticatedFetch('/api/projects/create', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  // Create project with name (path auto-calculated in user's project directory)
  createWorkspace: (projectData) =>
    authenticatedFetch('/api/projects/create-workspace', {
      method: 'POST',
      body: JSON.stringify(projectData),
    }),
  readFile: (projectName, filePath) =>
    authenticatedFetch(`/api/projects/${projectName}/file?filePath=${encodeURIComponent(filePath)}`),
  saveFile: (projectName, filePath, content) =>
    authenticatedFetch(`/api/projects/${projectName}/file`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, content }),
    }),
  getFiles: (projectName) =>
    authenticatedFetch(`/api/projects/${projectName}/files`),
  uploadFiles: (projectName, formData) =>
    authenticatedFetch(`/api/projects/${projectName}/upload-files`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }),
  deleteFile: (projectName, filePath) =>
    authenticatedFetch(`/api/projects/${projectName}/files?filePath=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    }),
  transcribe: (formData) =>
    authenticatedFetch('/api/transcribe', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }),

  // Generic GET method for any endpoint
  get: (endpoint) => authenticatedFetch(`/api${endpoint}`),
};