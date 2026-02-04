import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// 复制静态资源到输出目录的插件
const copyPublicPlugin = () => ({
  name: 'copy-public',
  closeBundle() {
    const publicDir = resolve(__dirname, 'public');
    const outDir = resolve(__dirname, 'dist');
    
    // 复制 manifest.json
    const manifestSrc = resolve(publicDir, 'manifest.json');
    const manifestDest = resolve(outDir, 'manifest.json');
    if (existsSync(manifestSrc)) {
      copyFileSync(manifestSrc, manifestDest);
    }
    
    // 复制国际化文件
    const localesSrc = resolve(publicDir, '_locales');
    const localesDest = resolve(outDir, '_locales');
    if (existsSync(localesSrc)) {
      copyLocalesRecursive(localesSrc, localesDest);
    }
    
    // 复制图标文件
    const iconsSrc = resolve(publicDir, 'icons');
    const iconsDest = resolve(outDir, 'icons');
    if (existsSync(iconsSrc)) {
      copyLocalesRecursive(iconsSrc, iconsDest);
    }
    
    // 复制 content/styles.css（manifest.json 需要此文件）
    const contentCssSrc = resolve(__dirname, 'src/content/styles.css');
    const contentDir = resolve(outDir, 'content');
    const contentCssDest = resolve(contentDir, 'styles.css');
    if (existsSync(contentCssSrc)) {
      if (!existsSync(contentDir)) {
        mkdirSync(contentDir, { recursive: true });
      }
      copyFileSync(contentCssSrc, contentCssDest);
      console.log('[copy-public] Copied content/styles.css');
    }
  }
});

function copyLocalesRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const entries = readdirSync(src);
  
  for (const entry of entries) {
    const srcPath = resolve(src, entry);
    const destPath = resolve(dest, entry);
    const stat = statSync(srcPath);
    
    if (stat.isDirectory()) {
      copyLocalesRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        'content/index': resolve(__dirname, 'src/content/index.ts'),
        'popup/index': resolve(__dirname, 'src/popup/index.html'),
        'options/index': resolve(__dirname, 'src/options/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo: { name: string }) => {
          if (chunkInfo.name === 'background') {
            return 'background/index.js';
          }
          return '[name].js';
        },
        chunkFileNames: 'shared/[name].js',
        assetFileNames: (assetInfo: { name?: string }) => {
          const info = assetInfo.name || '';
          // Content script CSS 需要输出到 content/styles.css 以匹配 manifest.json
          if (info.includes('content') && info.endsWith('.css')) {
            return 'content/styles.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    copyPublicPlugin()
  ],
});