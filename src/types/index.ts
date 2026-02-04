// ==========================================
// AI Translator 类型定义
// ==========================================

// ------------------------------------------
// 基础类型
// ------------------------------------------

/** 语言代码 (ISO 639-1) */
export type LanguageCode = 
  | 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' 
  | 'ru' | 'pt' | 'it' | 'ar' | 'hi' | 'th' | 'vi';

/** 主题设置 */
export type Theme = 'auto' | 'light' | 'dark';

/** 字体大小 */
export type FontSize = 'small' | 'medium' | 'large';

/** 按钮位置 */
export type ButtonPosition = 'inline' | 'corner';

// ------------------------------------------
// 配置类型
// ------------------------------------------

/** API 配置 */
export interface ApiConfig {
  endpoint: string;
  key: string;
  model: string;
}

/** 翻译配置 */
export interface TranslationConfig {
  targetLang: LanguageCode;
  sourceLang: LanguageCode;
  autoTranslate: boolean;
  showOriginal: boolean;
  preserveFormatting: boolean;
}

/** UI 配置 */
export interface UIConfig {
  buttonPosition: ButtonPosition;
  theme: Theme;
  fontSize: FontSize;
  maxTranslationLength: number;
}

/** 缓存配置 */
export interface CacheConfig {
  enabled: boolean;
  maxAge: number;
  maxEntries: number;
}

/** 高级配置 */
export interface AdvancedConfig {
  temperature: number;
  maxTokens: number;
  timeout: number;
  retryAttempts: number;
  systemPrompt?: string;
}

/** 插件完整配置 */
export interface PluginConfig {
  api: ApiConfig;
  translation: TranslationConfig;
  ui: UIConfig;
  cache: CacheConfig;
  advanced: AdvancedConfig;
}

// ------------------------------------------
// 推文相关类型
// ------------------------------------------

/** 推文作者信息 */
export interface TweetAuthor {
  name: string;
  handle: string;
  avatar?: string;
}

/** 推文媒体 */
export interface TweetMedia {
  type: 'photo' | 'video' | 'gif';
  url: string;
}

/** 推文统计数据 */
export interface TweetMetrics {
  replies?: number;
  retweets?: number;
  likes?: number;
}

/** 解析后的推文 */
export interface ParsedTweet {
  id: string;
  text: string;
  author: TweetAuthor;
  timestamp: string;
  url: string;
  metrics?: TweetMetrics;
  media?: TweetMedia[];
  isReply: boolean;
  isRetweet: boolean;
  quotedTweet?: ParsedTweet;
  element: HTMLElement;
}

/** 翻译后的推文 */
export interface TranslatedTweet extends ParsedTweet {
  translation: {
    text: string;
    detectedLang: string;
    timestamp: number;
    tokensUsed?: number;
  };
}

// ------------------------------------------
// API 相关类型
// ------------------------------------------

/** 聊天消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant';

/** 聊天消息 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** OpenAI 兼容 API 请求 */
export interface APIRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
}

/** OpenAI 兼容 API 响应选择 */
export interface APIResponseChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter';
}

/** OpenAI 兼容 API Token 使用情况 */
export interface APIResponseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** OpenAI 兼容 API 响应 */
export interface APIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: APIResponseChoice[];
  usage: APIResponseUsage;
}

/** API 错误响应 */
export interface APIError {
  error: {
    message: string;
    type: string;
    code: string;
    param?: string;
  };
}

// ------------------------------------------
// 缓存相关类型
// ------------------------------------------

/** 缓存条目 */
export interface CacheEntry {
  key: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
  tokensUsed: number;
  hitCount: number;
}

/** 缓存统计 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
}

/** 翻译缓存 */
export interface TranslationCache {
  [key: string]: CacheEntry;
}

// ------------------------------------------
// 消息类型 (Content Script <-> Background)
// ------------------------------------------

export enum MessageType {
  // 翻译相关
  TRANSLATE_TWEET = 'TRANSLATE_TWEET',
  TRANSLATE_RESULT = 'TRANSLATE_RESULT',
  TRANSLATE_ERROR = 'TRANSLATE_ERROR',
  TRANSLATE_PROGRESS = 'TRANSLATE_PROGRESS',
  
  // 配置相关
  GET_CONFIG = 'GET_CONFIG',
  SET_CONFIG = 'SET_CONFIG',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  
  // 缓存相关
  CLEAR_CACHE = 'CLEAR_CACHE',
  GET_CACHE_STATS = 'GET_CACHE_STATS',
  
  // 状态相关
  GET_API_STATUS = 'GET_API_STATUS',
  API_STATUS_RESULT = 'API_STATUS_RESULT'
}

/** 基础消息 */
export interface BaseMessage {
  type: MessageType;
  requestId?: string;
  timestamp?: number;
}

/** 翻译请求消息 */
export interface TranslateTweetMessage extends BaseMessage {
  type: MessageType.TRANSLATE_TWEET;
  payload: {
    tweetId: string;
    text: string;
    sourceLang?: string;
    targetLang: string;
    context?: {
      authorHandle?: string;
      isReply?: boolean;
      hasMedia?: boolean;
    };
  };
}

/** 翻译结果消息 */
export interface TranslateResultMessage extends BaseMessage {
  type: MessageType.TRANSLATE_RESULT;
  payload: {
    tweetId: string;
    translatedText: string;
    detectedLang?: string;
    tokensUsed?: number;
    fromCache?: boolean;
    processingTime?: number;
  };
}

/** 翻译错误消息 */
export interface TranslateErrorMessage extends BaseMessage {
  type: MessageType.TRANSLATE_ERROR;
  payload: {
    tweetId: string;
    error: {
      code: string;
      message: string;
      retryable: boolean;
    };
  };
}

/** 翻译进度消息 */
export interface TranslateProgressMessage extends BaseMessage {
  type: MessageType.TRANSLATE_PROGRESS;
  payload: {
    tweetId: string;
    partialText: string;
    progress: number;
  };
}

/** 获取配置消息 */
export interface GetConfigMessage extends BaseMessage {
  type: MessageType.GET_CONFIG;
  payload?: {
    keys?: string[];
  };
}

/** 设置配置消息 */
export interface SetConfigMessage extends BaseMessage {
  type: MessageType.SET_CONFIG;
  payload: Partial<PluginConfig>;
}

/** 配置变更消息 */
export interface ConfigChangedMessage extends BaseMessage {
  type: MessageType.CONFIG_CHANGED;
  payload: {
    changes: Record<string, { oldValue: unknown; newValue: unknown }>;
  };
}

/** 清空缓存消息 */
export interface ClearCacheMessage extends BaseMessage {
  type: MessageType.CLEAR_CACHE;
  payload?: {
    olderThan?: number;
  };
}

/** 获取缓存统计消息 */
export interface GetCacheStatsMessage extends BaseMessage {
  type: MessageType.GET_CACHE_STATS;
}

/** 缓存统计结果消息 */
export interface CacheStatsResultMessage extends BaseMessage {
  type: MessageType.GET_CACHE_STATS;
  payload: CacheStats;
}

/** 获取 API 状态消息 */
export interface GetApiStatusMessage extends BaseMessage {
  type: MessageType.GET_API_STATUS;
}

/** API 状态结果 */
export interface ApiStatusResult {
  status: 'connected' | 'error' | 'unconfigured';
  latency?: number;
  error?: string;
  modelAvailable?: boolean;
}

/** API 状态结果消息 */
export interface ApiStatusResultMessage extends BaseMessage {
  type: MessageType.API_STATUS_RESULT;
  payload: ApiStatusResult;
}

/** 所有消息类型的联合 */
export type Message =
  | TranslateTweetMessage
  | TranslateResultMessage
  | TranslateErrorMessage
  | TranslateProgressMessage
  | GetConfigMessage
  | SetConfigMessage
  | ConfigChangedMessage
  | ClearCacheMessage
  | GetCacheStatsMessage
  | CacheStatsResultMessage
  | GetApiStatusMessage
  | ApiStatusResultMessage;

// ------------------------------------------
// 错误相关类型
// ------------------------------------------

export enum TranslationErrorCode {
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

export interface TranslationError {
  code: TranslationErrorCode;
  message: string;
  retryable: boolean;
}

// ------------------------------------------
// 存储键名常量
// ------------------------------------------

export const STORAGE_KEYS = {
  CONFIG: 'at:config',
  API_KEY: 'at:api:key',
  CACHE: 'at:cache:v1',
  CACHE_METADATA: 'at:cache:metadata',
  STATS: 'at:stats:usage',
  SESSION_STATUS: 'at:session:apiStatus'
} as const;

// ------------------------------------------
// 默认配置
// ------------------------------------------

export const DEFAULT_CONFIG: PluginConfig = {
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

// ------------------------------------------
// Twitter DOM 选择器
// ------------------------------------------

export const TWITTER_SELECTORS = {
  TWEET_ARTICLE: 'article[data-testid="tweet"]',
  TWEET_TEXT: '[data-testid="tweetText"]',
  TWEET_LINK: 'a[href*="/status/"]',
  USER_NAME: '[data-testid="User-Name"]',
  TIMESTAMP: 'time',
  MEDIA_PHOTO: '[data-testid="tweetPhoto"]',
  MEDIA_VIDEO: '[data-testid="videoPlayer"]',
  REPLY_ICON: '[data-testid="reply"]',
  RETWEET_ICON: '[data-testid="retweet"]',
  LIKE_ICON: '[data-testid="like"]'
} as const;

// ------------------------------------------
// 语言映射
// ------------------------------------------

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  auto: '自动检测',
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  es: '西班牙语',
  fr: '法语',
  de: '德语',
  ru: '俄语',
  pt: '葡萄牙语',
  it: '意大利语',
  ar: '阿拉伯语',
  hi: '印地语',
  th: '泰语',
  vi: '越南语'
};