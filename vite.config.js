import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  
  return {
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_PORT) || 5173,
      proxy: {
        '/api': `http://localhost:${env.PORT || 3001}`,
        '/ws': {
          target: `ws://localhost:${env.PORT || 3001}`,
          ws: true
        },
        '/shell': {
          target: `ws://localhost:${env.PORT || 3001}`,
          ws: true
        }
      }
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-codemirror': [
              '@uiw/react-codemirror',
              '@codemirror/lang-css',
              '@codemirror/lang-html',
              '@codemirror/lang-javascript',
              '@codemirror/lang-json',
              '@codemirror/lang-markdown',
              '@codemirror/lang-python',
              '@codemirror/theme-one-dark',
              '@codemirror/merge',
              '@replit/codemirror-minimap'
            ],
            'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-clipboard', '@xterm/addon-webgl', '@xterm/addon-web-links'],
            'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex'],
            'vendor-syntax': ['react-syntax-highlighter'],
            'vendor-icons': ['lucide-react'],
            'vendor-katex': ['katex'],
            'vendor-utils': ['fuse.js', 'clsx', 'tailwind-merge', 'class-variance-authority']
          }
        }
      }
    }
  }
})