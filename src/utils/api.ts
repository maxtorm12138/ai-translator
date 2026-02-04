import type { 
  APIRequest, 
  APIResponse, 
  APIError, 
  PluginConfig,
  TranslationError,
  TranslationErrorCode 
} from '@/types';
import { 
  TranslationErrorCode as ErrorCode,
  DEFAULT_CONFIG 
} from '@/types';

/**
 * OpenAI 兼容 API 调用封装
 */

/**
 * 创建翻译请求体
 * @param text 要翻译的文本
 * @param targetLang 目标语言
 * @param sourceLang 源语言（可选，默认 auto）
 * @param config 插件配置
 * @returns APIRequest
 */
export function createTranslationRequest(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto',
  config: PluginConfig
): APIRequest {
  const systemPrompt = config.advanced.systemPrompt ||
    `
You are also a professional translator specializing in social media content.
Translate the given text accurately while:
1. Preserving the original tone and style
2. Maintaining emojis and hashtags appropriately
3. Keeping @mentions and URLs unchanged
4. Only returning the translation, no explanations or notes
5. If the text is already in the target language, return it as-is`;

  const userPrompt = sourceLang === 'auto'
    ? `Detect the language and translate to ${targetLang}:\n\n${text}`
    : `Translate from ${sourceLang} to ${targetLang}:\n\n${text}`;

  // 根据文本长度动态计算 max_tokens
  // 日语/中文等 CJK 字符通常需要更多 token，分析输出需要额外空间
  // 使用更宽松的估算：文本长度 * 4 + 500 缓冲区
  const estimatedTokens = Math.ceil(text.length * 4) + 500;
  const maxTokens = Math.min(estimatedTokens, config.advanced.maxTokens || 4000);

  // 检测是否是 Moonshot/Kimi 模型
  const isMoonshotModel = config.api.model.includes('kimi') || config.api.endpoint.includes('moonshot');
  
  // 检测是否是 kimi-k2.5 模型（特殊处理）
  const isKimiK2_5 = config.api.model === 'kimi-k2.5' || config.api.model.includes('k2.5');

  // 确保 temperature 是有效数值
  // kimi-k2.5 模型使用 temperature 1.0，其他 Moonshot 模型使用 0.6
  let temperature: number;
  if (isKimiK2_5) {
    temperature = 1.0;
  } else if (isMoonshotModel) {
    temperature = 0.6;
  } else {
    temperature = typeof config.advanced.temperature === 'number'
      ? Math.max(0, Math.min(2, config.advanced.temperature))
      : 0.3;
  }

  // 构建请求体
  const request: APIRequest = {
    model: config.api.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false
  };

  // 配置 thinking 参数
  // kimi-k2.5 模型启用思考能力
  // 其他 Moonshot/Kimi 模型禁用思考能力
  if (isKimiK2_5) {
    request.thinking = { type: 'enabled' };
  } else if (isMoonshotModel) {
    request.thinking = { type: 'disabled' };
  }

  return request;
}

/**
 * 发送翻译请求到 API
 * @param request 翻译请求体
 * @param config 插件配置
 * @returns Promise<string> 翻译后的文本
 */
export async function sendTranslationRequest(
  request: APIRequest,
  config: PluginConfig
): Promise<{ text: string; tokensUsed: number; detectedLang?: string }> {
  // 验证 API 密钥
  if (!config.api.key) {
    throw createTranslationError(
      ErrorCode.CONFIG_MISSING_API_KEY,
      '未配置 API 密钥，请在设置中配置',
      false
    );
  }

  // 验证 API 端点
  if (!config.api.endpoint) {
    throw createTranslationError(
      ErrorCode.CONFIG_INVALID_ENDPOINT,
      '未配置 API 端点，请在设置中配置',
      false
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, config.advanced.timeout);

  try {
    console.log('[AI Translator API] Sending request to:', config.api.endpoint);
    console.log('[AI Translator API] Request body:', JSON.stringify(request, null, 2));
    console.log('[AI Translator API] max_tokens:', request.max_tokens);
    const response = await fetch(`${config.api.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api.key}`
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // 处理 HTTP 错误
    if (!response.ok) {
      const error = await parseAPIError(response);
      throw error;
    }

    const data: APIResponse = await response.json();
    console.log('[AI Translator API] Response:', JSON.stringify(data, null, 2));
    console.log('[AI Translator API] finish_reason:', data.choices?.[0]?.finish_reason);
    
    // 检查是否因为 token 限制被截断
    if (data.choices?.[0]?.finish_reason === 'length') {
      console.warn('[AI Translator API] Warning: Response truncated due to max_tokens limit');
    }
    
    // 验证响应结构
    if (!data.choices || data.choices.length === 0) {
      throw createTranslationError(
        ErrorCode.API_UNKNOWN_ERROR,
        'API 返回了无效的响应',
        false
      );
    }

    const message = data.choices[0].message;
    let content = message?.content?.trim() || '';
    
    console.log('[AI Translator API] Raw message content:', content);
    console.log('[AI Translator API] Message fields:', Object.keys(message || {}));
    
    console.log('[AI Translator API] Content:', content);
    const tokensUsed = data.usage?.total_tokens || 0;

    return {
      text: content,
      tokensUsed: tokensUsed
    };

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof TranslationErrorWrapper) {
      throw error;
    }

    // 处理网络错误
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw createTranslationError(
        ErrorCode.NETWORK_ERROR,
        '网络连接失败，请检查网络设置',
        true
      );
    }

    // 处理超时错误
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createTranslationError(
        ErrorCode.NETWORK_TIMEOUT,
        '请求超时，请稍后重试',
        true
      );
    }

    // 其他错误
    throw createTranslationError(
      ErrorCode.UNKNOWN_ERROR,
      error instanceof Error ? error.message : '发生未知错误',
      true
    );
  }
}

/**
 * 检查 API 连接状态
 * @param config 插件配置
 * @returns Promise<{status: string, latency?: number, error?: string}>
 */
export async function checkApiStatus(
  config: PluginConfig
): Promise<{ status: 'connected' | 'error' | 'unconfigured'; latency?: number; error?: string; modelAvailable?: boolean }> {
  // 检查是否配置了 API 密钥
  if (!config.api.key) {
    return { status: 'unconfigured', error: '未配置 API 密钥' };
  }

  if (!config.api.endpoint) {
    return { status: 'unconfigured', error: '未配置 API 端点' };
  }

  const startTime = Date.now();
  
  try {
    // 发送一个简单的请求来测试连接
    const testRequest: APIRequest = {
      model: config.api.model,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 5
    };

    const response = await fetch(`${config.api.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api.key}`
      },
      body: JSON.stringify(testRequest)
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      return { 
        status: 'connected', 
        latency, 
        modelAvailable: true 
      };
    }

    // 处理特定的错误
    const errorData = await response.json().catch(() => ({})) as APIError;
    const errorCode = errorData.error?.code || '';
    
    if (errorCode === 'model_not_found') {
      return { 
        status: 'error', 
        latency, 
        error: '模型不可用，请检查模型名称',
        modelAvailable: false 
      };
    }

    return { 
      status: 'error', 
      latency, 
      error: errorData.error?.message || 'API 返回错误',
      modelAvailable: false 
    };

  } catch (error) {
    const latency = Date.now() - startTime;
    
    return { 
      status: 'error', 
      latency, 
      error: error instanceof Error ? error.message : '连接失败'
    };
  }
}

/**
 * 带重试机制的翻译请求
 * @param text 要翻译的文本
 * @param targetLang 目标语言
 * @param sourceLang 源语言
 * @param config 插件配置
 * @param attempt 当前重试次数
 * @returns Promise<{text: string, tokensUsed: number}>
 */
export async function translateWithRetry(
  text: string,
  targetLang: string,
  sourceLang: string,
  config: PluginConfig,
  attempt: number = 0
): Promise<{ text: string; tokensUsed: number }> {
  try {
    const request = createTranslationRequest(text, targetLang, sourceLang, config);
    return await sendTranslationRequest(request, config);
  } catch (error) {
    // 检查是否可重试
    if (error instanceof TranslationErrorWrapper && error.retryable) {
      const maxRetries = config.advanced.retryAttempts;
      
      if (attempt < maxRetries) {
        // 指数退避 + 随机抖动
        const delay = calculateBackoff(attempt);
        await sleep(delay);
        
        // 递归重试
        return translateWithRetry(text, targetLang, sourceLang, config, attempt + 1);
      }
    }
    
    throw error;
  }
}

/**
 * 解析 API 错误响应
 * @param response HTTP 响应
 * @returns TranslationErrorWrapper
 */
async function parseAPIError(response: Response): Promise<TranslationErrorWrapper> {
  let errorData: APIError;
  
  try {
    errorData = await response.json() as APIError;
  } catch {
    errorData = {
      error: {
        message: `HTTP ${response.status}: ${response.statusText}`,
        type: 'http_error',
        code: response.status.toString()
      }
    };
  }

  const errorCode = errorData.error?.code || '';
  const errorType = errorData.error?.type || '';
  const errorMessage = errorData.error?.message || '';
  const httpStatus = response.status;
  
  // 映射 OpenAI 错误码到内部错误码
  const errorMapping: Record<string, ErrorCode> = {
    'invalid_api_key': ErrorCode.API_UNAUTHORIZED,
    'insufficient_quota': ErrorCode.API_INSUFFICIENT_QUOTA,
    'rate_limit_exceeded': ErrorCode.API_RATE_LIMITED,
    'model_not_found': ErrorCode.API_MODEL_NOT_FOUND,
    'context_length_exceeded': ErrorCode.API_CONTEXT_TOO_LONG,
    'server_error': ErrorCode.API_SERVER_ERROR
  };

  // HTTP 状态码映射
  const httpErrorMapping: Record<number, ErrorCode> = {
    401: ErrorCode.API_UNAUTHORIZED,
    429: ErrorCode.API_RATE_LIMITED,
    500: ErrorCode.API_SERVER_ERROR,
    502: ErrorCode.API_SERVER_ERROR,
    503: ErrorCode.API_SERVER_ERROR
  };

  // 首先检查错误码映射
  let internalCode = errorMapping[errorCode] || httpErrorMapping[httpStatus];
  
  // 如果没有匹配到，根据错误类型和消息进一步判断
  if (!internalCode) {
    // 检查是否是 API 密钥相关的错误
    if (errorType === 'invalid_request_error' &&
        (errorMessage.toLowerCase().includes('api key') ||
         errorMessage.toLowerCase().includes('incorrect api key'))) {
      internalCode = ErrorCode.API_UNAUTHORIZED;
    } else {
      internalCode = ErrorCode.API_UNKNOWN_ERROR;
    }
  }
  
  // 判断是否可以重试
  const retryableCodes: ErrorCode[] = [
    ErrorCode.API_RATE_LIMITED,
    ErrorCode.API_SERVER_ERROR,
    ErrorCode.NETWORK_TIMEOUT,
    ErrorCode.NETWORK_ERROR
  ];
  
  return createTranslationError(
    internalCode,
    errorData.error?.message || 'API 请求失败',
    retryableCodes.includes(internalCode)
  );
}

/**
 * 创建翻译错误
 * @param code 错误码
 * @param message 错误消息
 * @param retryable 是否可重试
 * @returns TranslationErrorWrapper
 */
function createTranslationError(
  code: TranslationErrorCode,
  message: string,
  retryable: boolean
): TranslationErrorWrapper {
  return new TranslationErrorWrapper(code, message, retryable);
}

/**
 * 计算退避延迟（指数退避 + 随机抖动）
 * @param attempt 重试次数
 * @param baseDelay 基础延迟（毫秒）
 * @returns 延迟时间（毫秒）
 */
function calculateBackoff(attempt: number, baseDelay: number = 1000): number {
  const exponential = Math.pow(2, attempt) * baseDelay;
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, 30000); // 最大 30 秒
}

/**
 * 延迟函数
 * @param ms 毫秒
 * @returns Promise<void>
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 翻译错误包装类
 */
export class TranslationErrorWrapper extends Error {
  code: TranslationErrorCode;
  retryable: boolean;

  constructor(code: TranslationErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.retryable = retryable;
  }

  toJSON(): TranslationError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable
    };
  }
}

/**
 * 用户友好的错误消息
 */
export const ERROR_MESSAGES: Record<ErrorCode, { title: string; message: string; retryable: boolean }> = {
  [ErrorCode.CONFIG_MISSING_API_KEY]: {
    title: '未配置 API 密钥',
    message: '请在插件设置中配置您的 API 密钥',
    retryable: false
  },
  [ErrorCode.CONFIG_INVALID_ENDPOINT]: {
    title: 'API 端点无效',
    message: '请检查您的 API 端点配置',
    retryable: false
  },
  [ErrorCode.API_UNAUTHORIZED]: {
    title: 'API 密钥无效',
    message: '请检查您的 API 密钥是否正确',
    retryable: false
  },
  [ErrorCode.API_RATE_LIMITED]: {
    title: '请求过于频繁',
    message: 'API 速率限制已达上限，请稍后再试',
    retryable: true
  },
  [ErrorCode.API_INSUFFICIENT_QUOTA]: {
    title: '配额不足',
    message: '您的 API 配额已用完，请检查账户余额',
    retryable: false
  },
  [ErrorCode.API_MODEL_NOT_FOUND]: {
    title: '模型不可用',
    message: '指定的模型不可用，请检查模型名称',
    retryable: false
  },
  [ErrorCode.API_CONTEXT_TOO_LONG]: {
    title: '内容过长',
    message: '文本内容超出模型上下文长度限制',
    retryable: false
  },
  [ErrorCode.API_SERVER_ERROR]: {
    title: 'API 服务错误',
    message: 'API 服务器暂时不可用，请稍后重试',
    retryable: true
  },
  [ErrorCode.API_UNKNOWN_ERROR]: {
    title: 'API 错误',
    message: '发生未知的 API 错误，请稍后重试',
    retryable: true
  },
  [ErrorCode.NETWORK_TIMEOUT]: {
    title: '请求超时',
    message: '网络连接不稳定，请检查网络后重试',
    retryable: true
  },
  [ErrorCode.NETWORK_OFFLINE]: {
    title: '网络离线',
    message: '您当前处于离线状态，请检查网络连接',
    retryable: true
  },
  [ErrorCode.NETWORK_ERROR]: {
    title: '网络错误',
    message: '网络连接失败，请检查网络设置',
    retryable: true
  },
  [ErrorCode.CONTENT_EMPTY]: {
    title: '内容为空',
    message: '没有可翻译的内容',
    retryable: false
  },
  [ErrorCode.CONTENT_TOO_LONG]: {
    title: '内容过长',
    message: '推文内容超出翻译长度限制',
    retryable: false
  },
  [ErrorCode.CONTENT_BLOCKED]: {
    title: '内容被阻止',
    message: '该内容无法翻译，可能包含敏感信息',
    retryable: false
  },
  [ErrorCode.UNKNOWN_ERROR]: {
    title: '未知错误',
    message: '发生未知错误，请稍后重试',
    retryable: true
  }
};