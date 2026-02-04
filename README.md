# AI Translator - X/Twitter 智能翻译插件

<p align="center">
  <img src="public/icons/icon128.png" alt="AI Translator Logo" width="64" height="64">
</p>

<p align="center">
  <strong>基于 AI 的 X/Twitter 推文实时翻译浏览器扩展</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装方法">安装方法</a> •
  <a href="#配置说明">配置说明</a> •
  <a href="#使用指南">使用指南</a> •
  <a href="#支持的模型">支持的模型</a>
</p>

---

## 功能特性

- 🤖 **AI 智能翻译** - 支持 OpenAI 兼容 API，翻译更自然流畅
- 🎯 **X/Twitter 集成** - 专为 X/Twitter 优化，自动识别推文内容
- ⚡ **即时翻译** - 点击即可翻译，无需离开当前页面
- 💾 **智能缓存** - 自动缓存翻译结果，节省 API 调用
- 🎨 **优雅 UI** - 原生风格设计，与 X/Twitter 完美融合
- 🔒 **隐私保护** - 数据本地存储，API 密钥安全加密
- 🌍 **多语言支持** - 支持中英文界面切换
- ⌨️ **快捷键支持** - Alt+T 快速切换翻译显示

---

## 安装方法

### 开发者模式加载（推荐）

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-username/ai-translator.git
   cd ai-translator
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **构建插件**
   ```bash
   npm run build
   ```

4. **加载到浏览器**

   **Chrome / Edge:**
   1. 打开浏览器，访问 `chrome://extensions/`
   2. 开启右上角的「开发者模式」
   3. 点击「加载已解压的扩展程序」
   4. 选择项目中的 `dist` 文件夹

   **Firefox:**
   1. 打开浏览器，访问 `about:debugging`
   2. 点击「此 Firefox」→「临时载入附加组件」
   3. 选择 `dist/manifest.json` 文件

---

## 配置说明

### 首次使用配置

1. 点击浏览器工具栏的插件图标
2. 在弹出窗口中点击「设置」进入选项页面
3. 配置以下必填项：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API URL | OpenAI 兼容 API 地址 | `https://api.openai.com/v1/chat/completions` |
| API Key | 你的 API 密钥 | `sk-xxxxxxxxxxxxxxxx` |
| 模型 | 使用的 AI 模型 | `gpt-3.5-turbo` |
| 目标语言 | 翻译目标语言 | `简体中文` |

### 支持的 API 提供商

- **OpenAI** - `https://api.openai.com/v1/chat/completions`
- **Azure OpenAI** - `https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2023-12-01-preview`
- **Anthropic Claude** - `https://api.anthropic.com/v1/messages`
- **Google Gemini** - `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`
- **自定义 API** - 任何 OpenAI 兼容格式的 API

---

## 使用指南

### 翻译推文

1. 打开 [X/Twitter](https://twitter.com) 或 [X](https://x.com)
2. 浏览推文时，每条推文下方会出现「翻译」按钮
3. 点击「翻译」按钮即可查看翻译结果
4. 再次点击可隐藏翻译

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + T` | 切换当前页面翻译显示 |

### 选项页面

点击插件图标 → 「设置」可进入完整设置页面，包括：

- API 配置
- 模型选择
- 翻译目标语言
- 缓存管理
- 界面语言

---

## 支持的模型

### OpenAI 模型

| 模型 | 说明 | 推荐度 |
|------|------|--------|
| `gpt-4` | 最强大的模型，翻译质量最高 | ⭐⭐⭐⭐⭐ |
| `gpt-4-turbo` | GPT-4 优化版，更快更便宜 | ⭐⭐⭐⭐⭐ |
| `gpt-3.5-turbo` | 性价比高，翻译速度快 | ⭐⭐⭐⭐ |

### 其他兼容模型

- **Anthropic Claude** - `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`
- **Google Gemini** - `gemini-pro`, `gemini-1.5-pro`
- **本地模型** - 通过 Ollama 等工具部署的本地模型

---

## 项目结构

```
ai-translator/
├── 📁 src/                          # 源代码目录
│   ├── 📁 background/               # Background Service Worker
│   │   └── index.ts                 # 后台脚本入口
│   │
│   ├── 📁 content/                  # Content Scripts
│   │   ├── index.ts                 # 内容脚本入口
│   │   ├── twitter-parser.ts        # 推文解析器
│   │   ├── ui-injector.ts           # UI 注入器
│   │   └── styles.css               # 内容脚本样式
│   │
│   ├── 📁 popup/                    # 弹出窗口
│   │   ├── index.html               # Popup HTML
│   │   ├── index.ts                 # Popup 脚本
│   │   └── style.css                # Popup 样式
│   │
│   ├── 📁 options/                  # 选项页面
│   │   ├── index.html               # 选项页面 HTML
│   │   ├── index.ts                 # 选项页面脚本
│   │   └── style.css                # 选项页面样式
│   │
│   ├── 📁 types/                    # TypeScript 类型定义
│   │   └── index.ts                 # 类型定义入口
│   │
│   └── 📁 utils/                    # 工具函数
│       ├── api.ts                   # API 客户端
│       ├── cache.ts                 # 缓存管理
│       └── storage.ts               # 存储管理
│
├── 📁 public/                       # 静态资源
│   ├── manifest.json                # 插件清单 (Manifest V3)
│   ├── icons/                       # 插件图标
│   └── _locales/                    # 国际化文件
│       ├── en/                      # 英文
│       └── zh_CN/                   # 简体中文
│
├── 📁 docs/                         # 文档
│   ├── architecture.md              # 架构设计文档
│   ├── api-spec.md                  # API 接口规范
│   └── development.md               # 开发指南
│
├── 📁 scripts/                      # 构建脚本
│   └── generate-icons.js            # 图标生成脚本
│
├── vite.config.ts                   # Vite 配置
├── tsconfig.json                    # TypeScript 配置
├── package.json                     # 项目配置
└── README.md                        # 本文件
```

---

## 开发命令

```bash
# 开发模式（带热重载）
npm run dev

# 生产构建
npm run build

# 监听构建
npm run build:watch

# 代码检查
npm run lint

# 类型检查
npm run type-check

# 生成图标
node scripts/generate-icons.js
```

---

## 技术栈

- **框架**: TypeScript (Vanilla)
- **构建工具**: Vite 5.x
- **浏览器 API**: WebExtension API (Manifest V3)
- **样式**: 原生 CSS
- **类型检查**: TypeScript 5.x

---

## 浏览器兼容性

| 浏览器 | 最低版本 | 说明 |
|--------|----------|------|
| Chrome | 88+ | 完整支持 |
| Edge | 88+ | 完整支持 |
| Firefox | 109+ | Manifest V3 支持 |

---

## 隐私说明

- API 密钥使用浏览器加密存储 API 保存
- 翻译缓存仅存储在本地浏览器
- 不会收集或上传任何用户数据
- 所有网络请求直接发送至用户配置的 API 端点

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

## 许可证

[MIT](LICENSE) © AI Translator Contributors

---

## 支持

如有问题或建议，请提交 [GitHub Issue](https://github.com/your-username/ai-translator/issues)。

---

<p align="center">
  Made with ❤️ for X/Twitter users
</p>
