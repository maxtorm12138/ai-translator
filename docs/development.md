# 开发指南

## 1. 开发环境设置

### 1.1 前置要求

- Node.js 18+ 
- pnpm 8+ (推荐) 或 npm 9+
- Chrome/Edge/Firefox 浏览器（用于调试）

### 1.2 项目初始化

```bash
# 克隆项目
git clone <repository-url>
cd ai-translator

# 安装依赖
pnpm install

# 启动开发模式
pnpm dev
```

### 1.3 项目脚本

```json
{
  "scripts": {
    "dev": "vite --mode development",
    "build": "tsc && vite build",
    "build:chrome": "vite build --mode chrome",
    "build:firefox": "vite build --mode firefox",
    "pack": "node scripts/pack.ts",
    "lint": "eslint src --ext .ts",
    "test": "vitest"
  }
}
```

---

## 2. 构建配置

### 2.1 Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@background': resolve(__dirname, 'src/background'),
      '@content': resolve(__dirname, 'src/content'),
      '@popup': resolve(__dirname, 'src/popup'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
      },
      output: {
        entryFileNames: '[name]/index.js',
        chunkFileNames: 'shared/[name].js',
        assetFileNames: (info) => {
          const infoName = info.name || '';
          if (infoName.endsWith('.css')) {
            return 'styles/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  plugins: [
    crx({ manifest }),
  ],
}));
```

### 2.2 TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["chrome", "firefox-webext-browser", "node"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## 3. 目录开发规范

### 3.1 文件组织

```
src/
├── background/           # Background Service Worker
│   ├── index.ts         # 入口文件
│   └── *.ts             # 功能模块
│
├── content/             # Content Scripts
│   ├── index.ts         # 入口文件
│   ├── twitter/         # Twitter 特定逻辑
│   ├── components/      # Web Components
│   └── styles/          # CSS 文件
│
├── popup/               # Popup 页面
│   ├── index.html
│   ├── index.ts
│   └── *.ts
│
├── options/             # 选项页面
│   └── ...
│
└── shared/              # 共享模块
    ├── types/           # 类型定义
    ├── constants/       # 常量
    ├── utils/           # 工具函数
    └── services/        # 服务层
```

### 3.2 命名规范

| 类型 | 命名规范 | 示例 |
|------|----------|------|
| 文件 | kebab-case | `tweet-parser.ts` |
| 类 | PascalCase | `class TweetParser` |
| 接口 | PascalCase | `interface ParsedTweet` |
| 类型别名 | PascalCase | `type MessageHandler` |
| 函数 | camelCase | `function parseTweet()` |
| 常量 | SCREAMING_SNAKE_CASE | `const MAX_RETRY = 3` |
| 枚举 | PascalCase | `enum MessageType` |
| 枚举值 | SCREAMING_SNAKE_CASE | `TRANSLATE_TWEET` |

### 3.3 导入规范

```typescript
// 1. 第三方库
import { something } from 'lodash-es';

// 2. 内部共享模块
import { MessageType } from '@shared/constants/messages';
import type { ParsedTweet } from '@shared/types/tweet';

// 3. 相对路径（同目录或子目录）
import { parseTimestamp } from './utils';

// 4. CSS/资源
import './styles.css';
```

---

## 4. 模块开发指南

### 4.1 Background Service Worker

```typescript
// src/background/index.ts
import { MessageType } from '@shared/constants/messages';
import { TranslationService } from '@shared/services/translation-service';

const translationService = new TranslationService();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 异步处理需要返回 true
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
) {
  try {
    switch (message.type) {
      case MessageType.TRANSLATE_TWEET:
        const result = await translationService.translate(message.payload);
        sendResponse({ success: true, data: result });
        break;
      
      case MessageType.GET_CONFIG:
        const config = await getConfig();
        sendResponse({ success: true, data: config });
        break;
      
      // ... 其他消息处理
      
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    sendResponse({ success: false, error: (error as Error).message });
  }
}
```

### 4.2 Content Script

```typescript
// src/content/twitter/index.ts
import { TweetObserver } from './tweet-observer';
import { UIInjector } from './ui-injector';

// 等待页面加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  const observer = new TweetObserver();
  const injector = new UIInjector();
  
  // 监听新推文
  observer.onTweetDetected = (tweet) => {
    injector.injectButton(tweet);
  };
  
  // 启动观察
  observer.start();
  
  console.log('[AI Translator] Content script initialized');
}
```

### 4.3 Web Component

```typescript
// src/content/components/translate-button.ts
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: inline-flex;
    }
    .btn {
      /* 样式 */
    }
  </style>
  <button class="btn">
    <slot name="icon"></slot>
    <span class="text"><slot></slot></span>
  </button>
`;

export class TranslateButton extends HTMLElement {
  private _onClick?: () => void;
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
    
    this.shadowRoot!.querySelector('.btn')!.addEventListener('click', () => {
      this._onClick?.();
    });
  }
  
  set onClick(handler: () => void) {
    this._onClick = handler;
  }
  
  set loading(value: boolean) {
    this.toggleAttribute('loading', value);
  }
}

customElements.define('ai-translate-button', TranslateButton);
```

---

## 5. 调试指南

### 5.1 加载开发版插件

**Chrome/Edge:**
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/` 目录

**Firefox:**
1. 打开 `about:debugging`
2. 点击「此 Firefox」
3. 点击「临时载入附加组件」
4. 选择 `dist/manifest.json`

### 5.2 调试技巧

```typescript
// 添加调试日志
const DEBUG = process.env.NODE_ENV === 'development';

export function debug(...args: any[]) {
  if (DEBUG) {
    console.log('[AI Translator]', ...args);
  }
}

// 在代码中使用
debug('Tweet detected:', tweetId);
```

### 5.3 热重载

开发模式下，修改代码后 Vite 会自动重新构建。需要手动刷新扩展：

1. 在 `chrome://extensions/` 页面
2. 点击扩展卡片的刷新按钮
3. 刷新 Twitter 页面

---

## 6. 测试

### 6.1 单元测试

```typescript
// src/shared/utils/__tests__/cache-key.test.ts
import { describe, it, expect } from 'vitest';
import { generateCacheKey } from '../cache-key';

describe('generateCacheKey', () => {
  it('should generate consistent keys for same input', () => {
    const text = 'Hello World';
    const key1 = generateCacheKey(text, 'zh');
    const key2 = generateCacheKey(text, 'zh');
    expect(key1).toBe(key2);
  });
  
  it('should generate different keys for different languages', () => {
    const text = 'Hello World';
    const keyZh = generateCacheKey(text, 'zh');
    const keyEn = generateCacheKey(text, 'en');
    expect(keyZh).not.toBe(keyEn);
  });
});
```

### 6.2 E2E 测试

```typescript
// tests/twitter-translation.spec.ts
import { test, expect } from './fixtures/extension';

test('should translate a tweet', async ({ page, extensionId }) => {
  await page.goto('https://x.com/elonmusk');
  
  // 等待推文加载
  const tweet = await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });
  
  // 点击翻译按钮
  const translateBtn = await tweet.waitForSelector('ai-translate-button');
  await translateBtn.click();
  
  // 等待翻译结果
  const result = await tweet.waitForSelector('.translation-result', { timeout: 30000 });
  const text = await result.textContent();
  
  expect(text).toBeTruthy();
  expect(text!.length).toBeGreaterThan(0);
});
```

---

## 7. 发布流程

### 7.1 版本号管理

遵循 [SemVer](https://semver.org/lang/zh-CN/) 规范：
- `MAJOR.MINOR.PATCH`
- 例如：`1.2.3`

### 7.2 发布前检查清单

- [ ] 版本号已更新
- [ ] CHANGELOG.md 已更新
- [ ] 所有测试通过
- [ ] 构建成功
- [ ] 手动测试通过
- [ ] 代码已审查

### 7.3 打包

```bash
# 生产构建
pnpm build

# 打包为 zip（用于上传商店）
pnpm pack

# 输出：ai-translator-v{version}.zip
```

### 7.4 商店发布

**Chrome Web Store:**
1. 访问 [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. 上传 `ai-translator-v{version}.zip`
3. 填写商店信息
4. 提交审核

**Firefox Add-ons:**
1. 访问 [Firefox Developer Hub](https://addons.mozilla.org/developers/)
2. 上传 `ai-translator-v{version}.zip`
3. 填写附加信息
4. 提交审核

**Edge Add-ons:**
1. 访问 [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/)
2. 上传并填写信息
3. 提交审核

---

## 8. 常见问题

### 8.1 开发问题

**Q: Content Script 不生效？**
A: 检查 manifest.json 中的 `matches` 是否正确，以及是否需要刷新扩展和页面。

**Q: API 调用被拦截？**
A: 确保 manifest.json 中声明了正确的 `host_permissions`，并且使用 HTTPS。

**Q: 样式被 Twitter 覆盖？**
A: 使用 Shadow DOM 或更具体的选择器，避免样式冲突。

### 8.2 构建问题

**Q: 类型定义找不到？**
A: 运行 `pnpm install`，确保 `@types/chrome` 已安装。

**Q: 构建后文件缺失？**
A: 检查 vite.config.ts 中的 `rollupOptions.input` 配置。

---

## 9. 贡献指南

### 9.1 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型：
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

示例：
```
feat(translation): add support for streaming response

Implement streaming translation to show partial results
while waiting for complete response.

Closes #123
```

### 9.2 PR 流程

1. Fork 项目
2. 创建功能分支：`git checkout -b feat/my-feature`
3. 提交更改：`git commit -m 'feat: add my feature'`
4. 推送分支：`git push origin feat/my-feature`
5. 创建 Pull Request

---

## 10. 资源链接

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension Workshop](https://extensionworkshop.com/)
- [WebExtension API Compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs)
- [Vite Plugin for Chrome Extension](https://crxjs.dev/vite-plugin)
