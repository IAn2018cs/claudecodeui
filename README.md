<div align="center">
  <img src="public/logo.svg" alt="AgentHub" width="64" height="64">
  <h1>AgentHub</h1>
</div>

A desktop and mobile Web UI for AI Agents. You can use it locally or remotely to manage your AI agent sessions and interact with them from everywhere (mobile or desktop). This gives you a proper interface that works everywhere. 

## Screenshots

<div align="center">
  
<table>
<tr>
<td align="center">
<h3>Desktop View</h3>
<img src="public/screenshots/desktop-main.png" alt="Desktop Interface" width="400">
<br>
<em>Main interface showing project overview and chat</em>
</td>
<td align="center">
<h3>Mobile Experience</h3>
<img src="public/screenshots/mobile-chat.png" alt="Mobile Interface" width="250">
<br>
<em>Responsive mobile design with touch navigation</em>
</td>
</tr>
</table>



</div>

## Features

- **Responsive Design** - Works seamlessly across desktop, tablet, and mobile
- **Interactive Chat Interface** - Built-in chat interface for seamless communication with AI agents
- **Integrated Shell Terminal** - Direct access to AI agents through built-in shell functionality
- **File Explorer** - Interactive file tree with syntax highlighting and live editing
- **Session Management** - Resume conversations, manage multiple sessions, and track history
- **MCP Server Support** - Add your own MCP servers through the UI
- **Model Compatibility** - Works with various AI models 


## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured

### One-click Operation (Recommended)

No installation required, direct operation:

```bash
npx agenthub
```

The server will start and be accessible at `http://localhost:3001` (or your configured PORT).

**To restart**: Simply run the same `npx` command again after stopping the server
### Global Installation (For Regular Use)

For frequent use, install globally once:

```bash
npm install -g agenthub
```

Then start with a simple command:

```bash
agenthub
```


**To restart**: Stop with Ctrl+C and run `claude-code-ui` again.

**To update**:
```bash
agenthub update
```

### CLI Usage

After global installation, you have access to `agenthub` command:

| Command / Option | Short | Description |
|------------------|-------|-------------|
| `agenthub` | | Start the server (default) |
| `agenthub start` | | Start the server explicitly |
| `agenthub status` | | Show configuration and data locations |
| `agenthub update` | | Update to the latest version |
| `agenthub help` | | Show help information |
| `agenthub version` | | Show version information |
| `--port <port>` | `-p` | Set server port (default: 3001) |
| `--database-path <path>` | | Set custom database location |

**Examples:**
```bash
agenthub                          # Start with defaults
agenthub -p 8080              # Start on custom port
agenthub status                   # Show current configuration
```

### Run as Background Service (Recommended for Production)

For production use, run AgentHub as a background service using PM2 (Process Manager 2):

#### Install PM2

```bash
npm install -g pm2
```

#### Start as Background Service

```bash
# Start the server in background
pm2 start agenthub --name "agenthub"

# Or using the shorter alias
pm2 start agenthub --name "agenthub"

# Start on a custom port
pm2 start agenthub --name "agenthub" -- --port 8080
```


#### Auto-Start on System Boot

To make AgentHub start automatically when your system boots:

```bash
# Generate startup script for your platform
pm2 startup

# Save current process list
pm2 save
```


### Local Development Installation

1. **Clone the repository:**
```bash
git clone https://github.com/IAn2018cs/claudecodeui.git
cd claudecodeui
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your preferred settings
```

4. **Start the application:**
```bash
# Development mode (with hot reload)
npm run dev

```
The application will start at the port you specified in your .env

5. **Open your browser:**
   - Development: `http://localhost:3001`

## Security & Tools Configuration

**🔒 Important Notice**: All agent tools are **disabled by default**. This prevents potentially harmful operations from running automatically.

### Enabling Tools

To use full functionality, you'll need to manually enable tools:

1. **Open Tools Settings** - Click the gear icon in the sidebar
3. **Enable Selectively** - Turn on only the tools you need
4. **Apply Settings** - Your preferences are saved locally

<div align="center">

![Tools Settings Modal](public/screenshots/tools-modal.png)
*Tools Settings interface - enable only what you need*

</div>

**Recommended approach**: Start with basic tools enabled and add more as needed. You can always adjust these settings later.

## Usage Guide

### Core Features

#### Project Management
It automatically discovers agent sessions and groups them together into projects
session counts
- **Project Actions** - Rename, delete, and organize projects
- **Smart Navigation** - Quick access to recent projects and sessions
- **MCP support** - Add your own MCP servers through the UI

#### Chat Interface
- **Use responsive chat or CLI** - You can either use the adapted chat interface or use the shell button to connect to CLI.
- **Real-time Communication** - Stream responses from AI agents with WebSocket connection
- **Session Management** - Resume previous conversations or start fresh sessions
- **Message History** - Complete conversation history with timestamps and metadata
- **Multi-format Support** - Text, code blocks, and file references

#### File Explorer & Editor
- **Interactive File Tree** - Browse project structure with expand/collapse navigation
- **Live File Editing** - Read, modify, and save files directly in the interface
- **Syntax Highlighting** - Support for multiple programming languages
- **File Operations** - Create, rename, delete files and directories

#### Session Management
- **Session Persistence** - All conversations automatically saved
- **Session Organization** - Group sessions by project and timestamp
- **Session Actions** - Rename, delete, and export conversation history
- **Cross-device Sync** - Access sessions from any device

### Mobile App
- **Responsive Design** - Optimized for all screen sizes
- **Touch-friendly Interface** - Swipe gestures and touch navigation
- **Mobile Navigation** - Bottom tab bar for easy thumb navigation
- **Adaptive Layout** - Collapsible sidebar and smart content prioritization
- **Add shortcut to Home Screen** - Add a shortcut to your home screen and the app will behave like a PWA

## Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  Agent     │
│   (React/Vite)  │◄──►│ (Express/WS)    │◄──►│  Integration    │
│                 │    │                 │    │                │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Backend (Node.js + Express)
- **Express Server** - RESTful API with static file serving
- **WebSocket Server** - Communication for chats and project refresh
- **Agent Integration** - Process spawning and management
- **File System API** - Exposing file browser for projects

### Frontend (React + Vite)
- **React 18** - Modern component architecture with hooks
- **CodeMirror** - Advanced code editor with syntax highlighting





### Contributing

We welcome contributions! Please follow these guidelines:

#### Getting Started
1. **Fork** the repository
2. **Clone** your fork: `git clone <your-fork-url>`
3. **Install** dependencies: `npm install`
4. **Create** a feature branch: `git checkout -b feature/amazing-feature`

#### Development Process
1. **Make your changes** following the existing code style
2. **Test thoroughly** - ensure all features work correctly
3. **Run quality checks**: `npm run lint && npm run format`
4. **Commit** with descriptive messages following [Conventional Commits](https://conventionalcommits.org/)
5. **Push** to your branch: `git push origin feature/amazing-feature`
6. **Submit** a Pull Request with:
   - Clear description of changes
   - Screenshots for UI changes
   - Test results if applicable

#### What to Contribute
- **Bug fixes** - Help us improve stability
- **New features** - Enhance functionality (discuss in issues first)
- **Documentation** - Improve guides and API docs
- **UI/UX improvements** - Better user experience
- **Performance optimizations** - Make it faster

## Troubleshooting

### Common Issues & Solutions


#### "No projects found"
**Problem**: The UI shows no projects or empty project list
**Solutions**:
- Ensure you have initialized at least one project
- Verify `~/.claude/projects/` directory exists and has proper permissions

#### File Explorer Issues
**Problem**: Files not loading, permission errors, empty directories
**Solutions**:
- Check project directory permissions (`ls -la` in terminal)
- Verify the project path exists and is accessible
- Review server console logs for detailed error messages
- Ensure you're not trying to access system directories outside project scope


## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) file for details.

This project is open source and free to use, modify, and distribute under the GPL v3 license.

## Acknowledgments

### Built With
- **[React](https://react.dev/)** - User interface library
- **[Vite](https://vitejs.dev/)** - Fast build tool and dev server
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[CodeMirror](https://codemirror.net/)** - Advanced code editor

## Support & Community

### Stay Updated
- **Star** this repository to show support
- **Watch** for updates and new releases
- **Follow** the project for announcements

---

<div align="center">
  <strong>Made with care for the AI community.</strong>
</div>
