import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '').replace(/-build\.[0-9a-f]+$/i, '');
}

// Get version from environment, git tag, or package.json
function getVersion(): string {
  // 1. Environment variable (set by GitHub Actions)
  if (process.env.VERSION) {
    return normalizeVersion(process.env.VERSION);
  }

  // 2. Try git tag
  try {
    const gitTag = execSync('git describe --tags --exact-match 2>/dev/null || git describe --tags 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    if (gitTag) {
      return normalizeVersion(gitTag);
    }
  } catch {
    // Git not available or no tags
  }

  // 3. Fall back to branch + commit for local non-release builds
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    const shortSha = execSync('git rev-parse --short HEAD 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    const safeBranch = branch.replace(/[^0-9A-Za-z._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (safeBranch && shortSha) {
      return `${safeBranch}.${shortSha}`;
    }
  } catch {
    // Git not available
  }

  // 4. Fall back to package.json version
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    if (pkg.version && pkg.version !== '0.0.0') {
      return normalizeVersion(pkg.version);
    }
  } catch {
    // package.json not readable
  }

  return 'local';
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(getVersion())
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined
      }
    }
  }
});
