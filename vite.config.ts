import { defineConfig, type UserConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, readFileSync, writeFileSync } from 'fs';
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

    // 修复 HTML 文件位置：Vite 构建时将 HTML 放在了 dist/src/ 下，需要移动到正确位置
    const wrongOptionsHtml = resolve(outDir, 'src/options/index.html');
    const correctOptionsDir = resolve(outDir, 'options');
    const correctOptionsHtml = resolve(correctOptionsDir, 'index.html');
    if (existsSync(wrongOptionsHtml)) {
      if (!existsSync(correctOptionsDir)) {
        mkdirSync(correctOptionsDir, { recursive: true });
      }
      copyFileSync(wrongOptionsHtml, correctOptionsHtml);
      console.log('[copy-public] Fixed options/index.html location');
    }

    const wrongPopupHtml = resolve(outDir, 'src/popup/index.html');
    const correctPopupDir = resolve(outDir, 'popup');
    const correctPopupHtml = resolve(correctPopupDir, 'index.html');
    if (existsSync(wrongPopupHtml)) {
      if (!existsSync(correctPopupDir)) {
        mkdirSync(correctPopupDir, { recursive: true });
      }
      copyFileSync(wrongPopupHtml, correctPopupHtml);
      console.log('[copy-public] Fixed popup/index.html location');
    }

    // 修复 HTML 文件中的路径引用
    fixHtmlPaths(correctOptionsHtml, 'options');
    fixHtmlPaths(correctPopupHtml, 'popup');

    // 清理错误的 src 目录
    const wrongSrcDir = resolve(outDir, 'src');
    if (existsSync(wrongSrcDir)) {
      rmSync(wrongSrcDir, { recursive: true });
      console.log('[copy-public] Cleaned up dist/src directory');
    }
  }
});

// 修复 HTML 文件中的路径引用
function fixHtmlPaths(htmlPath: string, dirName: string): void {
  if (!existsSync(htmlPath)) return;
  
  let content = readFileSync(htmlPath, 'utf-8');
  // 将 ../../dirName/index.js 替换为 ./index.js
  content = content.replace(
    new RegExp(`\\.\\./\\.\\./${dirName}/index\\.js`, 'g'),
    './index.js'
  );
  // 将 ../../assets/ 替换为 ../assets/
  content = content.replace(/\.\.\/\.\.\/assets\//g, '../assets/');
  
  writeFileSync(htmlPath, content, 'utf-8');
  console.log(`[copy-public] Fixed paths in ${dirName}/index.html`);
}

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

export default defineConfig(({ mode }): UserConfig => {
  const isContentOnly = mode === 'content';
  
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const input = isContentOnly
    ? { 'content/index': resolve(__dirname, 'src/content/index.ts') } as Record<string, string>
    : {
        background: resolve(__dirname, 'src/background/index.ts'),
        'popup/index': resolve(__dirname, 'src/popup/index.html'),
        'options/index': resolve(__dirname, 'src/options/index.html'),
      } as Record<string, string>;
  
  return {
    base: './',
    build: {
      target: 'es2020',
      outDir: 'dist',
      emptyOutDir: false, // 始终不清空，由 clean 脚本手动清理
      modulePreload: false,
      cssCodeSplit: true,
      rollupOptions: {
        input,
        output: {
          entryFileNames: (chunkInfo: { name: string }) => {
            if (chunkInfo.name === 'background') {
              return 'background/index.js';
            }
            return '[name].js';
          },
          inlineDynamicImports: isContentOnly,
          chunkFileNames: isContentOnly ? undefined : 'shared/[name].js',
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
    plugins: isContentOnly ? [] : [copyPublicPlugin()],
  };
});
