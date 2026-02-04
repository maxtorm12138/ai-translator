# API 接口规范文档

## 1. OpenAI 兼容 API 规范

### 1.1 请求接口

#### 端点
```
POST {apiEndpoint}/v1/chat/completions
```

#### 请求头
```http
Content-Type: application/json
Authorization: Bearer {apiKey}
```

#### 请求体

```typescript
interface ChatCompletionRequest {
  // 模型名称，必填
  model: string;
  
  // 消息列表，必填
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  
  // 采样温度，可选，默认 0.3
  // 翻译任务建议使用较低值以获得更确定的结果
  temperature?: number;
  
  // 最大生成 token 数，可选，默认 2000
  max_tokens?: number;
  
  // 是否流式返回，可选，默认 false
  stream?: boolean;
  
  // 终止序列，可选
  stop?: string | string[];
  
  // 存在惩罚，可选
  presence_penalty?: number;
  
  // 频率惩罚，可选
  frequency_penalty?: number;
}
```

#### 翻译专用请求构造

```typescript
function createTranslationRequest(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto',
  config: ApiConfig
): ChatCompletionRequest {
  const systemPrompt = `You are a professional translator specializing in social media content.
Translate the given text accurately while:
1. Preserving the original tone and style
2. Maintaining emojis and hashtags appropriately
3. Keeping @mentions and URLs unchanged
4. Only returning the translation, no explanations or notes
5. If the text is already in the target language, return it as-is`;

  const userPrompt = sourceLang === 'auto'
    ? `Detect the language and translate to ${targetLang}:\n\n${text}`
    : `Translate from ${sourceLang} to ${targetLang}:\n\n${text}`;

  return {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: Math.min(Math.ceil(text.length * 2) + 100, 2000),
    stream: false
  };
}
```

### 1.2 响应格式

#### 成功响应 (200 OK)

```typescript
interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

#### 错误响应

```typescript
// HTTP 4xx/5xx
interface ApiError {
  error: {
    message: string;
    type: string;
    code: string;
    param?: string;
  };
}

// 常见错误码
enum ErrorCode {
  INVALID_API_KEY = 'invalid_api_key',
  INSUFFICIENT_QUOTA = 'insufficient_quota',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  MODEL_NOT_FOUND = 'model_not_found',
  CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',
  SERVER_ERROR = 'server_error'
}
```

### 1.3 流式响应 (可选)

```typescript
interface ChatCompletionStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: null | 'stop';
  }>;
}
```

---

## 2. 插件内部消息协议

### 2.1 消息类型定义

```typescript
// 消息类型枚举
enum MessageType {
  // ========== 翻译相关 ==========
  TRANSLATE_TWEET = 'TRANSLATE_TWEET',
  TRANSLATE_RESULT = 'TRANSLATE_RESULT',
  TRANSLATE_ERROR = 'TRANSLATE_ERROR',
  TRANSLATE_PROGRESS = 'TRANSLATE_PROGRESS',
  
  // ========== 配置相关 ==========
  GET_CONFIG = 'GET_CONFIG',
  SET_CONFIG = 'SET_CONFIG',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  
  // ========== 缓存相关 ==========
  CLEAR_CACHE = 'CLEAR_CACHE',
  GET_CACHE_STATS = 'GET_CACHE_STATS',
  
  // ========== 状态相关 ==========
  GET_API_STATUS = 'GET_API_STATUS',
  API_STATUS_RESULT = 'API_STATUS_RESULT'
}

// 基础消息接口
interface BaseMessage {
  type: MessageType;
  requestId?: string;
  timestamp?: number;
}
```

### 2.2 翻译消息

```typescript
// Content Script -> Background: 请求翻译
interface TranslateTweetMessage extends BaseMessage {
  type: MessageType.TRANSLATE_TWEET;
  payload: {
    tweetId: string;           // 推文唯一标识
    text: string;              // 需要翻译的文本
    sourceLang?: string;       // 源语言代码 (ISO 639-1)，可选，默认 auto
    targetLang: string;        // 目标语言代码 (ISO 639-1)，必填
    context?: {                // 上下文信息（用于更好的翻译）
      authorHandle?: string;
      isReply?: boolean;
      hasMedia?: boolean;
    };
  };
}

// Background -> Content Script: 翻译成功
interface TranslateResultMessage extends BaseMessage {
  type: MessageType.TRANSLATE_RESULT;
  payload: {
    tweetId: string;
    translatedText: string;    // 翻译后的文本
    detectedLang?: string;     // 检测到的源语言
    tokensUsed?: number;       // 使用的 token 数
    fromCache?: boolean;       // 是否来自缓存
    processingTime?: number;   // 处理耗时(ms)
  };
}

// Background -> Content Script: 翻译失败
interface TranslateErrorMessage extends BaseMessage {
  type: MessageType.TRANSLATE_ERROR;
  payload: {
    tweetId: string;
    error: {
      code: string;            // 错误码
      message: string;         // 错误信息
      retryable: boolean;      // 是否可重试
    };
  };
}

// 流式翻译进度 (可选)
interface TranslateProgressMessage extends BaseMessage {
  type: MessageType.TRANSLATE_PROGRESS;
  payload: {
    tweetId: string;
    partialText: string;       // 部分翻译结果
    progress: number;          // 进度百分比 0-100
  };
}
```

### 2.3 配置消息

```typescript
// 获取配置
interface GetConfigMessage extends BaseMessage {
  type: MessageType.GET_CONFIG;
  payload?: {
    keys?: string[];           // 指定获取的配置项，不传则返回全部
  };
}

// 设置配置
interface SetConfigMessage extends BaseMessage {
  type: MessageType.SET_CONFIG;
  payload: Partial<PluginConfig>;
}

// 配置变更通知
interface ConfigChangedMessage extends BaseMessage {
  type: MessageType.CONFIG_CHANGED;
  payload: {
    changes: Record<string, { oldValue: any; newValue: any }>;
  };
}
```

### 2.4 缓存消息

```typescript
// 清空缓存
interface ClearCacheMessage extends BaseMessage {
  type: MessageType.CLEAR_CACHE;
  payload?: {
    olderThan?: number;        // 清空多久以前的数据(ms)
  };
}

// 获取缓存统计
interface GetCacheStatsMessage extends BaseMessage {
  type: MessageType.GET_CACHE_STATS;
}

interface CacheStatsResult extends BaseMessage {
  type: MessageType.GET_CACHE_STATS;
  payload: {
    totalEntries: number;
    totalSize: number;         // 字节
    hitRate: number;           // 命中率
    oldestEntry: number;       // 时间戳
    newestEntry: number;
  };
}
```

### 2.5 API 状态检查

```typescript
// 检查 API 连接状态
interface GetApiStatusMessage extends BaseMessage {
  type: MessageType.GET_API_STATUS;
}

interface ApiStatusResultMessage extends BaseMessage {
  type: MessageType.API_STATUS_RESULT;
  payload: {
    status: 'connected' | 'error' | 'unconfigured';
    latency?: number;          // API 响应延迟
    error?: string;            // 错误信息
    modelAvailable?: boolean;  // 模型是否可用
  };
}
```

---

## 3. 数据结构定义

### 3.1 配置类型

```typescript
// 插件完整配置
interface PluginConfig {
  // API 配置
  api: {
    endpoint: string;          // API 端点，如 "https://api.openai.com"
    key: string;               // API 密钥
    model: string;             // 默认模型，如 "gpt-4o-mini"
  };
  
  // 翻译配置
  translation: {
    targetLang: string;        // 目标语言，如 "zh", "en"
    sourceLang: string;        // 源语言，"auto" 为自动检测
    autoTranslate: boolean;    // 是否自动翻译
    showOriginal: boolean;     // 是否同时显示原文
    preserveFormatting: boolean; // 保留格式（换行、表情等）
  };
  
  // UI 配置
  ui: {
    buttonPosition: 'inline' | 'corner';  // 按钮位置
    theme: 'auto' | 'light' | 'dark';     // 主题
    fontSize: 'small' | 'medium' | 'large';
    maxTranslationLength: number;         // 最大翻译长度
  };
  
  // 缓存配置
  cache: {
    enabled: boolean;
    maxAge: number;            // 缓存有效期(ms)
    maxEntries: number;        // 最大条目数
  };
  
  // 高级配置
  advanced: {
    temperature: number;       // 翻译温度 0-2
    maxTokens: number;         // 最大 token
    timeout: number;           // API 超时(ms)
    retryAttempts: number;     // 重试次数
    systemPrompt?: string;     // 自定义系统提示词
  };
}

// 默认配置
const DEFAULT_CONFIG: PluginConfig = {
  api: {
    endpoint: 'https://api.openai.com',
    key: '',
    model: 'gpt-4o-mini'
  },
  translation: {
    targetLang: 'zh',
    sourceLang: 'auto',
    autoTranslate: false,
    showOriginal: true,
    preserveFormatting: true
  },
  ui: {
    buttonPosition: 'inline',
    theme: 'auto',
    fontSize: 'medium',
    maxTranslationLength: 2000
  },
  cache: {
    enabled: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    maxEntries: 1000
  },
  advanced: {
    temperature: 0.3,
    maxTokens: 2000,
    timeout: 30000,
    retryAttempts: 3
  }
};
```

### 3.2 推文类型

```typescript
// 解析后的推文
interface ParsedTweet {
  id: string;                  // 推文 ID
  text: string;                // 推文正文
  author: {
    name: string;              // 显示名称
    handle: string;            // @用户名
    avatar?: string;           // 头像 URL
  };
  timestamp: string;           // ISO 8601 格式
  url: string;                 // 推文链接
  metrics?: {
    replies?: number;
    retweets?: number;
    likes?: number;
  };
  media?: Array<{
    type: 'photo' | 'video' | 'gif';
    url: string;
  }>;
  isReply: boolean;
  isRetweet: boolean;
  quotedTweet?: ParsedTweet;   // 引用的推文
  element: HTMLElement;        // DOM 元素引用
}

// 翻译后的推文
interface TranslatedTweet extends ParsedTweet {
  translation: {
    text: string;
    detectedLang: string;
    timestamp: number;
    tokensUsed?: number;
  };
}
```

### 3.3 缓存类型

```typescript
// 缓存条目
interface CacheEntry {
  key: string;                 // 缓存键
  sourceText: string;          // 原文
  translatedText: string;      // 译文
  sourceLang: string;          // 源语言
  targetLang: string;          // 目标语言
  timestamp: number;           // 创建时间
  tokensUsed: number;          // Token 使用量
  hitCount: number;            // 命中次数
}

// 缓存键生成
function generateCacheKey(text: string, targetLang: string): string {
  // 使用文本的哈希值作为键的一部分
  const hash = cyrb53(text);
  return `${targetLang}:${hash}`;
}

// 快速哈希函数
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
```

---

## 4. 错误处理规范

### 4.1 错误码定义

```typescript
enum TranslationErrorCode {
  // 配置错误
  CONFIG_MISSING_API_KEY = 'CONFIG_MISSING_API_KEY',
  CONFIG_INVALID_ENDPOINT = 'CONFIG_INVALID_ENDPOINT',
  
  // 网络错误
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  // API 错误
  API_UNAUTHORIZED = 'API_UNAUTHORIZED',
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  API_INSUFFICIENT_QUOTA = 'API_INSUFFICIENT_QUOTA',
  API_MODEL_NOT_FOUND = 'API_MODEL_NOT_FOUND',
  API_CONTEXT_TOO_LONG = 'API_CONTEXT_TOO_LONG',
  API_SERVER_ERROR = 'API_SERVER_ERROR',
  API_UNKNOWN_ERROR = 'API_UNKNOWN_ERROR',
  
  // 内容错误
  CONTENT_EMPTY = 'CONTENT_EMPTY',
  CONTENT_TOO_LONG = 'CONTENT_TOO_LONG',
  CONTENT_BLOCKED = 'CONTENT_BLOCKED',
  
  // 其他
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
```

### 4.2 错误映射

```typescript
// OpenAI API 错误映射到内部错误码
const ERROR_MAPPING: Record<string, TranslationErrorCode> = {
  'invalid_api_key': TranslationErrorCode.API_UNAUTHORIZED,
  'insufficient_quota': TranslationErrorCode.API_INSUFFICIENT_QUOTA,
  'rate_limit_exceeded': TranslationErrorCode.API_RATE_LIMITED,
  'model_not_found': TranslationErrorCode.API_MODEL_NOT_FOUND,
  'context_length_exceeded': TranslationErrorCode.API_CONTEXT_TOO_LONG,
  'server_error': TranslationErrorCode.API_SERVER_ERROR
};

// HTTP 状态码映射
const HTTP_ERROR_MAPPING: Record<number, TranslationErrorCode> = {
  401: TranslationErrorCode.API_UNAUTHORIZED,
  429: TranslationErrorCode.API_RATE_LIMITED,
  500: TranslationErrorCode.API_SERVER_ERROR,
  502: TranslationErrorCode.API_SERVER_ERROR,
  503: TranslationErrorCode.API_SERVER_ERROR
};
```

### 4.3 用户友好的错误消息

```typescript
const ERROR_MESSAGES: Record<TranslationErrorCode, { title: string; message: string; retryable: boolean }> = {
  [TranslationErrorCode.CONFIG_MISSING_API_KEY]: {
    title: '未配置 API 密钥',
    message: '请在插件设置中配置您的 API 密钥',
    retryable: false
  },
  [TranslationErrorCode.API_UNAUTHORIZED]: {
    title: 'API 密钥无效',
    message: '请检查您的 API 密钥是否正确',
    retryable: false
  },
  [TranslationErrorCode.API_RATE_LIMITED]: {
    title: '请求过于频繁',
    message: 'API 速率限制已达上限，请稍后再试',
    retryable: true
  },
  [TranslationErrorCode.NETWORK_TIMEOUT]: {
    title: '请求超时',
    message: '网络连接不稳定，请检查网络后重试',
    retryable: true
  },
  [TranslationErrorCode.CONTENT_TOO_LONG]: {
    title: '内容过长',
    message: '推文内容超出翻译长度限制',
    retryable: false
  },
  // ... 其他错误
};
```

---

## 5. 浏览器存储规范

### 5.1 存储区域划分

```typescript
// chrome.storage.sync - 用户配置（跨设备同步）
interface SyncStorage {
  'at:config': PluginConfig;
  'at:ui:theme': string;
}

// chrome.storage.local - 本地数据（不同步）
interface LocalStorage {
  'at:api:key': string;              // API 密钥（敏感信息）
  'at:cache:v1': Record<string, CacheEntry>;  // 翻译缓存
  'at:cache:metadata': {
    version: number;
    lastCleanup: number;
  };
  'at:stats:usage': {
    totalTranslations: number;
    totalTokensUsed: number;
    cacheHitRate: number;
  };
}

// chrome.storage.session - 会话数据（重启清空）
interface SessionStorage {
  'at:session:apiStatus': ApiStatus;
  'at:session:pendingRequests': string[];
}
```

### 5.2 存储键命名规范

```typescript
// 命名空间前缀: at: (ai-translator)
// 格式: at:{category}:{subcategory}:{name}

const STORAGE_KEYS = {
  CONFIG: 'at:config',
  API_KEY: 'at:api:key',
  CACHE_PREFIX: 'at:cache:',
  STATS: 'at:stats:usage',
  SESSION_STATUS: 'at:session:apiStatus'
} as const;
```

---

## 6. 事件命名规范

```typescript
// 自定义事件（用于组件间通信）
enum CustomEventType {
  // UI 事件
  TWEET_DETECTED = 'at:tweet:detected',
  TRANSLATION_REQUESTED = 'at:translation:requested',
  TRANSLATION_COMPLETED = 'at:translation:completed',
  TRANSLATION_FAILED = 'at:translation:failed',
  
  // 配置事件
  CONFIG_UPDATED = 'at:config:updated',
  THEME_CHANGED = 'at:theme:changed',
  
  // 缓存事件
  CACHE_CLEARED = 'at:cache:cleared'
}

// 事件详情类型
interface TweetDetectedEventDetail {
  tweetId: string;
  element: HTMLElement;
}

interface TranslationCompletedEventDetail {
  tweetId: string;
  translatedText: string;
  detectedLang: string;
}
```

---

## 7. 版本兼容性

### 7.1 API 版本

- **当前版本**: v1
- **兼容性**: OpenAI API v1 兼容
- **支持的模型**: gpt-4o, gpt-4o-mini, gpt-4, gpt-3.5-turbo 及兼容端点

### 7.2 数据迁移

```typescript
// 配置迁移处理
interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate: (oldConfig: any) => any;
}

const MIGRATIONS: Migration[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: (old) => ({
      ...DEFAULT_CONFIG,
      ...old,
      _version: 1
    })
  }
];
```

---

## 8. 速率限制策略

### 8.1 请求队列

```typescript
interface RequestQueue {
  maxConcurrent: number;       // 最大并发数
  maxQueueSize: number;        // 最大队列长度
  retryDelay: number;          // 重试延迟(ms)
  maxRetries: number;          // 最大重试次数
}

const DEFAULT_QUEUE_CONFIG: RequestQueue = {
  maxConcurrent: 3,
  maxQueueSize: 50,
  retryDelay: 1000,
  maxRetries: 3
};
```

### 8.2 退避策略

```typescript
function calculateBackoff(attempt: number, baseDelay = 1000): number {
  // 指数退避 + 随机抖动
  const exponential = Math.pow(2, attempt) * baseDelay;
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, 30000); // 最大 30s
}
```

---

## 附录 A: 语言代码表

| 代码 | 语言 |
|------|------|
| auto | 自动检测 |
| zh | 中文 |
| en | 英语 |
| ja | 日语 |
| ko | 韩语 |
| es | 西班牙语 |
| fr | 法语 |
| de | 德语 |
| ru | 俄语 |
| pt | 葡萄牙语 |
| it | 意大利语 |
| ar | 阿拉伯语 |
| hi | 印地语 |
| th | 泰语 |
| vi | 越南语 |
