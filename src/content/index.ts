import type { ParsedTweet, TranslateResultMessage, TranslateErrorMessage } from '@/types';
import { MessageType, TWITTER_SELECTORS } from '@/types';
import { TweetParser } from './twitter-parser';
import { UIInjector } from './ui-injector';
import './styles.css';

/**
 * Content Script 主入口
 * 负责初始化 Twitter DOM 监听和 UI 注入
 */

// 插件命名空间，避免冲突
const NAMESPACE = 'ai-translator';

// 已处理的推文集合
const processedTweets = new Set<string>();

// UI 注入器实例
let uiInjector: UIInjector | null = null;

// 防抖定时器
let debounceTimer: number | null = null;

/**
 * 初始化 Content Script
 */
function initialize(): void {
  console.log('[AI Translator] Content script initialized');

  // 检查是否在 Twitter/X 页面
  if (!isTwitterPage()) {
    return;
  }

  // 初始化 UI 注入器
  uiInjector = new UIInjector();

  // 开始观察 DOM 变化
  observeDOM();

  // 处理页面上已有的推文
  processExistingTweets();

  // 监听来自 Background 的消息
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
}

/**
 * 检查当前页面是否是 Twitter/X
 */
function isTwitterPage(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'twitter.com' || hostname === 'x.com';
}

/**
 * 观察 DOM 变化
 */
function observeDOM(): void {
  const observer = new MutationObserver((mutations) => {
    // 防抖处理
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      handleMutations(mutations);
    }, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * 处理 DOM 变化
 */
function handleMutations(mutations: MutationRecord[]): void {
  const tweetElements: HTMLElement[] = [];

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        // 检查是否是推文元素（article 或带 data-testid="tweet" 的元素）
        if (node.matches?.(TWITTER_SELECTORS.TWEET_ARTICLE)) {
          tweetElements.push(node);
        }
        
        // 检查是否是直接带 data-testid="tweet" 的元素
        if (node.matches?.('[data-testid="tweet"]')) {
          tweetElements.push(node);
        }

        // 检查子元素中是否有推文（article 标签）
        const articles = node.querySelectorAll?.(TWITTER_SELECTORS.TWEET_ARTICLE);
        if (articles) {
          tweetElements.push(...Array.from(articles) as HTMLElement[]);
        }

        // 检查子元素中是否有带 data-testid="tweet" 的元素
        const tweets = node.querySelectorAll?.('[data-testid="tweet"]');
        if (tweets) {
          tweetElements.push(...Array.from(tweets) as HTMLElement[]);
        }
      }
    }
  }

  // 去重
  const uniqueElements = [...new Set(tweetElements)];

  // 处理发现的推文
  for (const element of uniqueElements) {
    processTweetElement(element);
  }
}

/**
 * 处理页面上已有的推文
 */
function processExistingTweets(): void {
  const tweetElements: HTMLElement[] = [];
  
  // 查找所有 article 元素
  const articles = document.querySelectorAll(TWITTER_SELECTORS.TWEET_ARTICLE);
  tweetElements.push(...Array.from(articles) as HTMLElement[]);
  
  // 查找所有带 data-testid="tweet" 的元素
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  tweetElements.push(...Array.from(tweets) as HTMLElement[]);
  
  // 去重
  const uniqueElements = [...new Set(tweetElements)];
  
  for (const element of uniqueElements) {
    processTweetElement(element);
  }
}

/**
 * 处理单个推文元素
 */
async function processTweetElement(element: HTMLElement): Promise<void> {
  try {
    // 检查是否已处理
    if (element.hasAttribute(`data-${NAMESPACE}-processed`)) {
      return;
    }

    // 解析推文
    const tweet = TweetParser.parse(element);
    if (!tweet) {
      return;
    }

    // 检查是否已处理过这个 ID
    if (processedTweets.has(tweet.id)) {
      return;
    }

    // 标记为已处理
    element.setAttribute(`data-${NAMESPACE}-processed`, 'true');
    element.setAttribute(`data-${NAMESPACE}-tweet-id`, tweet.id);
    processedTweets.add(tweet.id);

    // 注入翻译按钮
    if (uiInjector) {
      uiInjector.injectTranslateButton(tweet, handleTranslateRequest);
    }

  } catch (error) {
    console.error('[AI Translator] Failed to process tweet:', error);
  }
}

/**
 * 处理翻译请求
 */
async function handleTranslateRequest(tweet: ParsedTweet): Promise<void> {
  try {
    // 显示加载状态
    uiInjector?.showLoading(tweet.id);

    // 发送翻译请求到 Background
    const response = await chrome.runtime.sendMessage({
      type: MessageType.TRANSLATE_TWEET,
      payload: {
        tweetId: tweet.id,
        text: tweet.text,
        targetLang: 'zh', // 默认目标语言，可以从配置中读取
        sourceLang: 'auto'
      },
      timestamp: Date.now()
    });

    if (!response.success) {
      throw new Error(response.error || '翻译请求失败');
    }

    const result = response.data as TranslateResultMessage | TranslateErrorMessage;

    if (result.type === MessageType.TRANSLATE_RESULT) {
      // 显示翻译结果
      uiInjector?.showTranslation(tweet.id, result.payload.translatedText);
    } else if (result.type === MessageType.TRANSLATE_ERROR) {
      // 显示错误
      uiInjector?.showError(tweet.id, result.payload.error.message);
    }

  } catch (error) {
    console.error('[AI Translator] Translation request failed:', error);
    uiInjector?.showError(
      tweet.id, 
      error instanceof Error ? error.message : '翻译失败'
    );
  }
}

/**
 * 处理来自 Background 的消息
 */
function handleBackgroundMessage(
  message: unknown, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response?: unknown) => void
): boolean {
  // 目前主要用于配置变更通知
  const msg = message as { type: string; payload?: unknown };
  
  if (msg.type === MessageType.CONFIG_CHANGED) {
    // 配置变更，可以重新初始化或更新设置
    console.log('[AI Translator] Config changed:', msg.payload);
    sendResponse({ success: true });
    return true;
  }

  return false;
}

/**
 * 清理已处理的推文记录（防止内存泄漏）
 */
function cleanupProcessedTweets(): void {
  // 保留最近的 1000 条推文记录
  if (processedTweets.size > 1000) {
    const toDelete = processedTweets.size - 1000;
    const iterator = processedTweets.values();
    for (let i = 0; i < toDelete; i++) {
      const result = iterator.next().value;
      if (result) {
        processedTweets.delete(result);
      }
    }
  }
}

// 定期清理
setInterval(cleanupProcessedTweets, 60000);

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  processedTweets.clear();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
});

// 初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 导出用于测试
export { processTweetElement, handleTranslateRequest };