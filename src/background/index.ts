import type { 
  Message, 
  TranslateTweetMessage, 
  TranslateResultMessage, 
  TranslateErrorMessage,
  GetConfigMessage,
  SetConfigMessage,
  ClearCacheMessage,
  GetCacheStatsMessage,
  GetApiStatusMessage,
  PluginConfig 
} from '@/types';
import { MessageType, DEFAULT_CONFIG } from '@/types';
import { getFullConfig, setConfig, onConfigChanged } from '@/utils/storage';
import { 
  translateWithRetry, 
  TranslationErrorWrapper, 
  checkApiStatus 
} from '@/utils/api';
import { 
  getCachedTranslation, 
  cacheTranslation,
  clearCache,
  getCacheStats,
  maintainCache,
  isCacheEnabled
} from '@/utils/cache';

/**
 * Background Service Worker
 * 处理来自 Content Script 的消息，管理翻译请求和缓存
 */

// 初始化
console.log('[AI Translator Background] Service Worker starting...');
cacheMaintainance();
console.log('[AI Translator Background] Service Worker initialized');

// 监听消息
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  console.log('[AI Translator Background] Received message:', message);
  // 处理异步响应
  handleMessage(message, sender)
    .then(response => {
      console.log('[AI Translator Background] Sending response:', response);
      sendResponse({ success: true, data: response });
    })
    .catch(error => {
      console.error('[AI Translator Background] Error handling message:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });

  // 返回 true 表示将异步发送响应
  return true;
});

/**
 * 处理消息
 * @param message 消息对象
 * @param sender 发送者信息
 * @returns Promise<any>
 */
async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const startTime = Date.now();
  console.log('[AI Translator Background] handleMessage, type:', message.type);

  switch (message.type) {
    case MessageType.TRANSLATE_TWEET:
      return handleTranslateRequest(message as TranslateTweetMessage, startTime);

    case MessageType.GET_CONFIG:
      return handleGetConfig(message as GetConfigMessage);

    case MessageType.SET_CONFIG:
      return handleSetConfig(message as SetConfigMessage);

    case MessageType.CONFIG_CHANGED:
      // CONFIG_CHANGED 是广播消息，background 不需要处理，直接返回
      return Promise.resolve({ acknowledged: true });

    case MessageType.CLEAR_CACHE:
      return handleClearCache(message as ClearCacheMessage);

    case MessageType.GET_CACHE_STATS:
      return handleGetCacheStats(message as GetCacheStatsMessage);

    case MessageType.GET_API_STATUS:
      return handleGetApiStatus(message as GetApiStatusMessage);

    default:
      throw new Error(`Unknown message type: ${(message as Message).type}`);
  }
}

/**
 * 处理翻译请求
 * @param message 翻译请求消息
 * @param startTime 开始时间
 * @returns Promise<TranslateResultMessage | TranslateErrorMessage>
 */
async function handleTranslateRequest(
  message: TranslateTweetMessage,
  startTime: number
): Promise<TranslateResultMessage | TranslateErrorMessage> {
  const { tweetId, text, sourceLang, targetLang } = message.payload;
  console.log('[AI Translator Background] handleTranslateRequest:', { tweetId, text: text?.substring(0, 50), sourceLang, targetLang });

  try {
    // 获取配置并验证
    const config = await getFullConfig();
    console.log('[AI Translator Background] Config:', {
      endpoint: config.api.endpoint,
      hasKey: !!config.api.key,
      model: config.api.model
    });
    
    if (!config.api.key) {
      return createErrorResponse(
        tweetId,
        'CONFIG_MISSING_API_KEY',
        '未配置 API 密钥，请在插件设置中配置',
        false
      );
    }
    
    if (!config.api.endpoint) {
      return createErrorResponse(
        tweetId,
        'CONFIG_INVALID_ENDPOINT',
        '未配置 API 端点，请在插件设置中配置',
        false
      );
    }

    // 验证输入
    if (!text || text.trim().length === 0) {
      return createErrorResponse(
        tweetId,
        'CONTENT_EMPTY',
        '推文内容为空',
        false
      );
    }

    // 检查缓存
    const cacheEnabled = await isCacheEnabled();
    if (cacheEnabled) {
      const cached = await getCachedTranslation(text, targetLang);
      if (cached) {
        return {
          type: MessageType.TRANSLATE_RESULT,
          payload: {
            tweetId,
            translatedText: cached.translatedText,
            detectedLang: cached.sourceLang,
            tokensUsed: cached.tokensUsed,
            fromCache: true,
            processingTime: Date.now() - startTime
          },
          timestamp: Date.now()
        };
      }
    }

    // 调用 API 进行翻译
    const result = await translateWithRetry(
      text,
      targetLang,
      sourceLang || 'auto',
      config
    );

    // 缓存结果
    if (cacheEnabled) {
      await cacheTranslation(
        text,
        result.text,
        'auto', // API 可能未返回检测到的语言
        targetLang,
        result.tokensUsed
      );
    }

    return {
      type: MessageType.TRANSLATE_RESULT,
      payload: {
        tweetId,
        translatedText: result.text,
        tokensUsed: result.tokensUsed,
        fromCache: false,
        processingTime: Date.now() - startTime
      },
      timestamp: Date.now()
    };

  } catch (error) {
    console.error('[AI Translator] Translation failed:', error);

    // 处理翻译错误
    if (error instanceof TranslationErrorWrapper) {
      return createErrorResponse(
        tweetId,
        error.code,
        error.message,
        error.retryable
      );
    }

    // 其他错误
    return createErrorResponse(
      tweetId,
      'UNKNOWN_ERROR',
      error instanceof Error ? error.message : '翻译失败',
      true
    );
  }
}

/**
 * 创建错误响应
 * @param tweetId 推文 ID
 * @param code 错误码
 * @param message 错误消息
 * @param retryable 是否可重试
 * @returns TranslateErrorMessage
 */
function createErrorResponse(
  tweetId: string,
  code: string,
  message: string,
  retryable: boolean
): TranslateErrorMessage {
  return {
    type: MessageType.TRANSLATE_ERROR,
    payload: {
      tweetId,
      error: {
        code,
        message,
        retryable
      }
    },
    timestamp: Date.now()
  };
}

/**
 * 处理获取配置请求
 * @param message 获取配置消息
 * @returns Promise<Partial<PluginConfig>>
 */
async function handleGetConfig(message: GetConfigMessage): Promise<Partial<PluginConfig>> {
  const config = await getFullConfig();
  const keys = message.payload?.keys;

  if (!keys || keys.length === 0) {
    return config;
  }

  // 返回指定的配置项
  const result: Partial<PluginConfig> = {};
  for (const key of keys) {
    const parts = key.split('.');
    let current: unknown = config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
        break;
      }
    }
    
    // 构建嵌套结果
    let target: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = current;
  }

  return result;
}

/**
 * 处理设置配置请求
 * @param message 设置配置消息
 * @returns Promise<void>
 */
async function handleSetConfig(message: SetConfigMessage): Promise<void> {
  await setConfig(message.payload);
}

/**
 * 处理清空缓存请求
 * @param message 清空缓存消息
 * @returns Promise<void>
 */
async function handleClearCache(message: ClearCacheMessage): Promise<void> {
  await clearCache(message.payload?.olderThan);
}

/**
 * 处理获取缓存统计请求
 * @param message 获取缓存统计消息
 * @returns Promise<CacheStats>
 */
async function handleGetCacheStats(message: GetCacheStatsMessage): Promise<{
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
}> {
  return getCacheStats();
}

/**
 * 处理获取 API 状态请求
 * @param message 获取 API 状态消息
 * @returns Promise<ApiStatusResult>
 */
async function handleGetApiStatus(message: GetApiStatusMessage): Promise<{
  status: 'connected' | 'error' | 'unconfigured';
  latency?: number;
  error?: string;
  modelAvailable?: boolean;
}> {
  const config = await getFullConfig();
  return checkApiStatus(config);
}

/**
 * 定期执行缓存维护
 */
function cacheMaintainance(): void {
  // 启动时执行一次
  maintainCache();

  // 每 30 分钟执行一次
  chrome.alarms.create('cacheMaintenance', { periodInMinutes: 30 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cacheMaintenance') {
      maintainCache();
    }
  });
}

/**
 * 安装/更新时的处理
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[AI Translator] Extension installed');
    
    // 初始化默认配置
    getFullConfig().then(config => {
      if (!config.api.endpoint) {
        // 首次安装，设置默认配置
        setConfig(DEFAULT_CONFIG);
      }
    });

  } else if (details.reason === 'update') {
    console.log('[AI Translator] Extension updated');
    
    // 版本更新时的迁移处理可以在这里添加
    maintainCache();
  }
});

/**
 * 监听来自其他部分的配置变更
 */
onConfigChanged((changes) => {
  console.log('[AI Translator] Config changed:', changes);
});

// 导出用于测试
export { handleMessage };