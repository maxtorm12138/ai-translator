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

// 全局观察器
let domObserver: MutationObserver | null = null;

// 重试计数器
let retryCount = 0;
const MAX_RETRIES = 5;

/**
 * 初始化 Content Script
 */
function initialize(): void {
  console.log('[AI Translator] ==========================================');
  console.log('[AI Translator] Initializing...');
  console.log('[AI Translator] Hostname:', window.location.hostname);
  console.log('[AI Translator] URL:', window.location.href);
  console.log('[AI Translator] Document readyState:', document.readyState);
  // 检查是否在 Twitter/X 页面
  if (!isTwitterPage()) {
    console.log('[AI Translator] Not a Twitter page, exiting');
    return;
  }
  console.log('[AI Translator] Twitter page detected');

  // 初始化 UI 注入器
  uiInjector = new UIInjector();

  // 开始观察 DOM 变化
  observeDOM();

  // 延迟处理页面上已有的推文，确保 DOM 已加载
  setTimeout(() => {
    processExistingTweets();
  }, 500);
  
  // 再次延迟处理，确保动态加载的推文也被处理
  setTimeout(() => {
    processExistingTweets();
  }, 2000);

  // 延迟重试机制：在页面加载完成后多次尝试扫描推文
  scheduleRetryScans();

  // 监听来自 Background 的消息
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  
  // 监听页面变化（Twitter 是单页应用）
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // 重置已处理集合，因为页面内容已改变
      processedTweets.clear();
      retryCount = 0;
      document.querySelectorAll(`[data-${NAMESPACE}-processed]`).forEach(el => {
        el.removeAttribute(`data-${NAMESPACE}-processed`);
        el.removeAttribute(`data-${NAMESPACE}-tweet-id`);
      });
      setTimeout(processExistingTweets, 500);
      // 页面切换后重新启动延迟重试扫描
      scheduleRetryScans();
    }
  }).observe(document, { subtree: true, childList: true });
}

/**
 * 调度延迟重试扫描
 * 在页面加载后的多个时间点尝试扫描推文，处理懒加载情况
 */
function scheduleRetryScans(): void {
  const retryDelays = [3000, 5000, 8000, 12000, 15000];
  
  retryDelays.forEach((delay, index) => {
    setTimeout(() => {
      if (retryCount < MAX_RETRIES) {
        console.log(`[AI Translator] Retry scan #${index + 1} after ${delay}ms`);
        retryCount++;
        processExistingTweets();
      }
    }, delay);
  });
}

/**
 * 检查当前页面是否是 Twitter/X
 */
function isTwitterPage(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'twitter.com' ||
         hostname === 'x.com' ||
         hostname === 'www.twitter.com' ||
         hostname === 'www.x.com' ||
         hostname.endsWith('.twitter.com') ||
         hostname.endsWith('.x.com');
}

/**
 * 观察 DOM 变化
 */
function observeDOM(): void {
  if (domObserver) {
    return;
  }
  
  console.log('[AI Translator] Starting DOM observer...');
  
  domObserver = new MutationObserver((mutations) => {
    // 防抖处理
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      handleMutations(mutations);
    }, 100);
  });

  // 监听整个文档树的变化，而不仅仅是 body
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  console.log('[AI Translator] DOM observer started on document.documentElement');
}

/**
 * 处理 DOM 变化
 */
function handleMutations(mutations: MutationRecord[]): void {
  const tweetElements: HTMLElement[] = [];
  let checkedNodes = 0;
  let matchedNodes = 0;

  console.log('[AI Translator] handleMutations called with', mutations.length, 'mutations');

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        checkedNodes++;
        
        // 调试：输出前几个节点的信息
        if (checkedNodes <= 5) {
          console.log('[AI Translator] Checking node:', node.tagName,
            'className:', node.className?.substring(0, 100),
            'data-testid:', node.getAttribute('data-testid'),
            'role:', node.getAttribute('role'));
        }
        
        // 策略 1: 检查是否是 article 元素
        if (node.matches?.(TWITTER_SELECTORS.TWEET_ARTICLE)) {
          tweetElements.push(node);
          matchedNodes++;
          console.log('[AI Translator] Mutation matched article:', node.tagName, node.className?.substring(0, 50));
        }
        
        // 策略 2: 检查是否是直接带 data-testid="tweet" 的元素
        if (node.matches?.('[data-testid="tweet"]')) {
          if (!tweetElements.includes(node)) {
            tweetElements.push(node);
            matchedNodes++;
            console.log('[AI Translator] Mutation matched data-testid="tweet":', node.tagName);
          }
        }

        // 策略 3: 检查是否是带 data-testid="cellInnerDiv" 的元素（新版首页）
        if (node.matches?.(TWITTER_SELECTORS.TWEET_CELL_INNER)) {
          if (!tweetElements.includes(node)) {
            tweetElements.push(node);
            matchedNodes++;
            console.log('[AI Translator] Mutation matched cellInnerDiv:', node.tagName);
          }
        }

        // 策略 4: 基于 CSS 类名识别推文（Twitter 使用原子 CSS）
        const cssClassTweets = findTweetsByCssClasses(node);
        if (cssClassTweets.length > 0) {
          console.log('[AI Translator] Found', cssClassTweets.length, 'tweets by CSS classes in mutation');
          for (const tweet of cssClassTweets) {
            if (!tweetElements.includes(tweet)) {
              tweetElements.push(tweet);
              matchedNodes++;
            }
          }
        }

        // 策略 5: 深度遍历子节点查找推文
        const deepTweets = findTweetsDeep(node);
        if (deepTweets.length > 0) {
          console.log('[AI Translator] Found', deepTweets.length, 'tweets by deep traversal');
          for (const tweet of deepTweets) {
            if (!tweetElements.includes(tweet)) {
              tweetElements.push(tweet);
              matchedNodes++;
            }
          }
        }

        // 策略 6: 检查子元素中是否有推文（article 标签）
        const articles = node.querySelectorAll?.(TWITTER_SELECTORS.TWEET_ARTICLE);
        if (articles && articles.length > 0) {
          console.log('[AI Translator] Found', articles.length, 'articles in child nodes');
          for (const article of articles) {
            if (!tweetElements.includes(article as HTMLElement)) {
              tweetElements.push(article as HTMLElement);
              matchedNodes++;
            }
          }
        }

        // 策略 7: 检查子元素中是否有带 data-testid="tweet" 的元素
        const tweets = node.querySelectorAll?.('[data-testid="tweet"]');
        if (tweets && tweets.length > 0) {
          console.log('[AI Translator] Found', tweets.length, 'elements with data-testid="tweet" in child nodes');
          for (const tweet of tweets) {
            if (!tweetElements.includes(tweet as HTMLElement)) {
              tweetElements.push(tweet as HTMLElement);
              matchedNodes++;
            }
          }
        }

        // 策略 8: 检查子元素中是否有带 data-testid="cellInnerDiv" 的元素（新版首页）
        const cells = node.querySelectorAll?.(TWITTER_SELECTORS.TWEET_CELL_INNER);
        if (cells && cells.length > 0) {
          console.log('[AI Translator] Found', cells.length, 'elements with data-testid="cellInnerDiv" in child nodes');
          for (const cell of cells) {
            if (!tweetElements.includes(cell as HTMLElement)) {
              tweetElements.push(cell as HTMLElement);
              matchedNodes++;
            }
          }
        }

        // 策略 9: 检查 primaryColumn 容器内部的变化
        if (node.matches?.('[data-testid="primaryColumn"]') || 
            node.querySelector?.('[data-testid="primaryColumn"]')) {
          console.log('[AI Translator] Detected primaryColumn change, scanning for tweets');
          const primaryColumnTweets = scanPrimaryColumnForTweets();
          for (const tweet of primaryColumnTweets) {
            if (!tweetElements.includes(tweet)) {
              tweetElements.push(tweet);
              matchedNodes++;
            }
          }
        }
      }
    }
  }

  console.log('[AI Translator] handleMutations checked', checkedNodes, 'nodes, matched', matchedNodes, 'tweet elements');

  // 去重
  const uniqueElements = [...new Set(tweetElements)];
  console.log('[AI Translator] Processing', uniqueElements.length, 'unique tweet elements');

  // 处理发现的推文
  for (const element of uniqueElements) {
    processTweetElement(element);
  }
}

/**
 * 通过 CSS 类名识别推文
 * Twitter 使用原子 CSS 类名，如 r-1habvwh, r-18u37iz 等
 */
function findTweetsByCssClasses(rootElement: HTMLElement): HTMLElement[] {
  const tweets: HTMLElement[] = [];
  
  // Twitter 常用原子 CSS 类名模式
  const twitterCssPatterns = [
    // 推文容器常用的类名组合
    '.r-1habvwh', // 常用基础类
    '.r-18u37iz', // flex 布局类
    '.r-1loqt21', // 交互元素类
    '.r-1ny4l3l', // 文本相关类
    '.r-1udh08x', // 布局类
  ];
  
  // 查找包含状态链接和时间戳的元素
  const allElements = rootElement.querySelectorAll('div');
  
  for (const el of allElements) {
    // 检查是否包含推文特征
    const hasStatusLink = el.querySelector('a[href*="/status/"]') !== null;
    const hasTime = el.querySelector('time') !== null;
    const hasTextContent = el.textContent && el.textContent.length > 20;
    
    // 如果包含状态链接和时间戳，可能是推文
    if (hasStatusLink && hasTime && hasTextContent) {
      // 检查是否已经在列表中
      if (!tweets.includes(el as HTMLElement)) {
        // 进一步验证：检查是否有用户链接
        const hasUserLink = el.querySelector('a[href^="/"]') !== null;
        if (hasUserLink) {
          tweets.push(el as HTMLElement);
        }
      }
    }
  }
  
  return tweets;
}

/**
 * 深度遍历查找推文元素
 * 递归遍历所有子节点，查找可能的推文容器
 */
function findTweetsDeep(rootElement: HTMLElement, depth = 0, maxDepth = 5): HTMLElement[] {
  const tweets: HTMLElement[] = [];
  
  if (depth > maxDepth) {
    return tweets;
  }
  
  // 检查当前元素是否是推文
  if (isPotentialTweetElement(rootElement)) {
    tweets.push(rootElement);
  }
  
  // 递归检查子元素
  const children = rootElement.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child instanceof HTMLElement) {
      const childTweets = findTweetsDeep(child, depth + 1, maxDepth);
      tweets.push(...childTweets);
    }
  }
  
  return tweets;
}

/**
 * 检查元素是否是潜在的推文元素
 */
function isPotentialTweetElement(element: HTMLElement): boolean {
  // 必须是 div 或 article
  if (element.tagName !== 'DIV' && element.tagName !== 'ARTICLE') {
    return false;
  }
  
  // 检查是否包含状态链接
  const hasStatusLink = element.querySelector('a[href*="/status/"]') !== null;
  
  // 检查是否包含时间戳
  const hasTime = element.querySelector('time') !== null;
  
  // 检查是否包含推文文本特征
  const tweetText = element.querySelector('[data-testid="tweetText"]');
  const hasTweetText = tweetText !== null;
  
  // 检查是否有 lang 属性的元素（推文通常有语言标记）
  const hasLangElement = element.querySelector('[lang]') !== null;
  
  // 检查是否有交互按钮
  const hasInteraction = element.querySelector('[data-testid="like"]') !== null ||
                         element.querySelector('[data-testid="reply"]') !== null ||
                         element.querySelector('[data-testid="retweet"]') !== null;
  
  // 综合判断：包含状态链接 + (时间戳或推文文本或交互按钮)
  return hasStatusLink && (hasTime || hasTweetText || hasInteraction || hasLangElement);
}

/**
 * 扫描 primaryColumn 容器查找推文
 * primaryColumn 是 Twitter 主页时间线的主要容器
 */
function scanPrimaryColumnForTweets(): HTMLElement[] {
  const tweets: HTMLElement[] = [];
  
  // 获取 primaryColumn 容器
  const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
  if (!primaryColumn) {
    console.log('[AI Translator] primaryColumn not found');
    return tweets;
  }
  
  console.log('[AI Translator] Scanning primaryColumn for tweets');
  
  // 在 primaryColumn 内部查找所有可能的推文容器
  // 策略 1: 查找 article 元素
  const articles = primaryColumn.querySelectorAll('article');
  console.log('[AI Translator] Found', articles.length, 'articles in primaryColumn');
  tweets.push(...Array.from(articles) as HTMLElement[]);
  
  // 策略 2: 查找带 data-testid="tweet" 的元素
  const tweetElements = primaryColumn.querySelectorAll('[data-testid="tweet"]');
  console.log('[AI Translator] Found', tweetElements.length, 'data-testid="tweet" in primaryColumn');
  for (const el of tweetElements) {
    if (!tweets.includes(el as HTMLElement)) {
      tweets.push(el as HTMLElement);
    }
  }
  
  // 策略 3: 查找带 data-testid="cellInnerDiv" 的元素
  const cellElements = primaryColumn.querySelectorAll('[data-testid="cellInnerDiv"]');
  console.log('[AI Translator] Found', cellElements.length, 'data-testid="cellInnerDiv" in primaryColumn');
  for (const el of cellElements) {
    if (!tweets.includes(el as HTMLElement)) {
      tweets.push(el as HTMLElement);
    }
  }
  
  // 策略 4: 通过 follow 按钮查找推文（用户ID+"-follow" 模式）
  const followButtons = primaryColumn.querySelectorAll('[data-testid$="-follow"]');
  console.log('[AI Translator] Found', followButtons.length, 'follow buttons in primaryColumn');
  
  for (const followBtn of followButtons) {
    // 向上查找父元素，直到找到可能的推文容器
    let parent = followBtn.parentElement;
    let depth = 0;
    const maxDepth = 10;
    
    while (parent && depth < maxDepth) {
      // 检查这个父元素是否是推文容器
      if (isPotentialTweetElement(parent)) {
        if (!tweets.includes(parent)) {
          tweets.push(parent);
          console.log('[AI Translator] Found tweet container via follow button at depth', depth);
        }
        break;
      }
      parent = parent.parentElement;
      depth++;
    }
  }
  
  // 策略 5: 通过 CSS 类名查找
  const cssTweets = findTweetsByCssClasses(primaryColumn as HTMLElement);
  console.log('[AI Translator] Found', cssTweets.length, 'tweets by CSS classes in primaryColumn');
  for (const tweet of cssTweets) {
    if (!tweets.includes(tweet)) {
      tweets.push(tweet);
    }
  }
  
  return tweets;
}

/**
 * 处理页面上已有的推文
 */
function processExistingTweets(): void {
  const tweetElements: HTMLElement[] = [];
  
  console.log('[AI Translator] ==========================================');
  console.log('[AI Translator] processExistingTweets started');
  console.log('[AI Translator] ==========================================');
  
  // 策略 1: 查找所有 article 元素（旧版）
  const articles = document.querySelectorAll(TWITTER_SELECTORS.TWEET_ARTICLE);
  console.log('[AI Translator] processExistingTweets: found', articles.length, 'article elements');
  tweetElements.push(...Array.from(articles) as HTMLElement[]);
  
  // 策略 2: 查找所有带 data-testid="tweet" 的元素
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  console.log('[AI Translator] processExistingTweets: found', tweets.length, 'elements with data-testid="tweet"');
  tweetElements.push(...Array.from(tweets) as HTMLElement[]);
  
  // 策略 3: 查找所有带 data-testid="cellInnerDiv" 的元素（新版首页）
  const cells = document.querySelectorAll(TWITTER_SELECTORS.TWEET_CELL_INNER);
  console.log('[AI Translator] processExistingTweets: found', cells.length, 'elements with data-testid="cellInnerDiv"');
  tweetElements.push(...Array.from(cells) as HTMLElement[]);
  
  // 策略 4: 扫描 primaryColumn 容器
  const primaryColumnTweets = scanPrimaryColumnForTweets();
  console.log('[AI Translator] processExistingTweets: found', primaryColumnTweets.length, 'tweets in primaryColumn');
  for (const tweet of primaryColumnTweets) {
    if (!tweetElements.includes(tweet)) {
      tweetElements.push(tweet);
    }
  }
  
  // 策略 5: 通过 CSS 类名识别推文
  const cssTweets = findTweetsByCssClasses(document.body);
  console.log('[AI Translator] processExistingTweets: found', cssTweets.length, 'tweets by CSS classes');
  for (const tweet of cssTweets) {
    if (!tweetElements.includes(tweet)) {
      tweetElements.push(tweet);
    }
  }
  
  // 策略 6: 深度遍历整个文档查找推文
  const deepTweets = findTweetsDeep(document.body);
  console.log('[AI Translator] processExistingTweets: found', deepTweets.length, 'tweets by deep traversal');
  for (const tweet of deepTweets) {
    if (!tweetElements.includes(tweet)) {
      tweetElements.push(tweet);
    }
  }
  
  // === 详细的 DOM 结构调试 ===
  console.log('[AI Translator] ========== DOM 结构详细分析 ==========');
  
  // 检查推文交互按钮（like, reply, retweet）
  const likeButtons = document.querySelectorAll('[data-testid="like"]');
  const replyButtons = document.querySelectorAll('[data-testid="reply"]');
  const retweetButtons = document.querySelectorAll('[data-testid="retweet"]');
  console.log('[AI Translator] Found interaction buttons:', {
    like: likeButtons.length,
    reply: replyButtons.length,
    retweet: retweetButtons.length
  });
  
  // 检查其他可能的 data-testid
  const tweetTextElements = document.querySelectorAll('[data-testid="tweetText"]');
  const userNameElements = document.querySelectorAll('[data-testid="User-Name"]');
  const userNameElements2 = document.querySelectorAll('[data-testid="user-name"]');
  console.log('[AI Translator] Found other data-testid elements:', {
    tweetText: tweetTextElements.length,
    UserName: userNameElements.length,
    userName: userNameElements2.length
  });
  
  // 策略 7: 详细分析带有链接的 div 元素
  const allDivs = document.querySelectorAll('div');
  console.log('[AI Translator] Total div elements:', allDivs.length);
  
  let statusDivCount = 0;
  let divsWithLinks = 0;
  const debugInfo: Array<{
    index: number;
    hasLink: boolean;
    linkHref: string;
    hasTime: boolean;
    hasTweetText: boolean;
    hasLike: boolean;
    hasReply: boolean;
    className: string;
    htmlPreview: string;
  }> = [];
  
  for (let i = 0; i < allDivs.length; i++) {
    const div = allDivs[i];
    const links = div.querySelectorAll('a');
    const hasLink = links.length > 0;
    
    if (hasLink) {
      divsWithLinks++;
      
      // 查找 status 链接
      const statusLink = div.querySelector('a[href*="/status/"]');
      const hasStatusLink = !!statusLink;
      
      // 检查各种时间戳选择器
      const hasTime = !!div.querySelector('time');
      const hasTweetText = !!div.querySelector('[data-testid="tweetText"]');
      const hasLike = !!div.querySelector('[data-testid="like"]');
      const hasReply = !!div.querySelector('[data-testid="reply"]');
      
      // 收集前20个有链接的 div 的详细信息
      if (debugInfo.length < 20) {
        const linkHref = hasStatusLink
          ? (statusLink as HTMLAnchorElement).href.substring(0, 100)
          : (links[0] as HTMLAnchorElement).href?.substring(0, 100) || 'N/A';
        
        // 生成 HTML 预览（缩略版）
        const html = div.outerHTML;
        const htmlPreview = html.length > 500
          ? html.substring(0, 500) + '...(truncated)'
          : html;
        
        debugInfo.push({
          index: i,
          hasLink: true,
          linkHref,
          hasTime,
          hasTweetText,
          hasLike,
          hasReply,
          className: div.className?.substring(0, 100) || 'N/A',
          htmlPreview
        });
      }
      
      // 如果包含 status 链接和时间戳，认为是推文
      if (hasStatusLink && hasTime && !tweetElements.includes(div as HTMLElement)) {
        tweetElements.push(div as HTMLElement);
        statusDivCount++;
      }
    }
  }
  
  console.log('[AI Translator] Div analysis summary:', {
    totalDivs: allDivs.length,
    divsWithLinks: divsWithLinks,
    statusDivsWithTime: statusDivCount
  });
  
  // 输出前10个带有链接的 div 的详细信息
  console.log('[AI Translator] ========== 前10个带链接的 Div 详情 ==========');
  debugInfo.slice(0, 10).forEach((info, idx) => {
    console.log(`[AI Translator] Div #${idx + 1} (index: ${info.index}):`, {
      hasLink: info.hasLink,
      linkHref: info.linkHref,
      hasTime: info.hasTime,
      hasTweetText: info.hasTweetText,
      hasLike: info.hasLike,
      hasReply: info.hasReply,
      className: info.className
    });
    console.log(`[AI Translator] Div #${idx + 1} HTML:`, info.htmlPreview);
    console.log('[AI Translator] ---');
  });
  
  // 输出所有 data-testid 属性值（用于发现未知的推文标识）
  console.log('[AI Translator] ========== 所有 data-testid 属性值 ==========');
  const allDataTestIds = new Set<string>();
  document.querySelectorAll('[data-testid]').forEach(el => {
    const testId = el.getAttribute('data-testid');
    if (testId) {
      allDataTestIds.add(testId);
    }
  });
  console.log('[AI Translator] Unique data-testid values:', Array.from(allDataTestIds).sort());
  
  console.log('[AI Translator] processExistingTweets: found', statusDivCount, 'div elements with status links and timestamps');
  
  // 去重
  const uniqueElements = [...new Set(tweetElements)];
  console.log('[AI Translator] processExistingTweets: processing', uniqueElements.length, 'unique elements');
  
  // 如果没有找到推文，输出诊断信息
  if (uniqueElements.length === 0) {
    console.warn('[AI Translator] WARNING: No tweet elements found!');
    console.warn('[AI Translator] This might indicate:');
    console.warn('  1. Page has not fully loaded yet');
    console.warn('  2. Twitter/X DOM structure has changed');
    console.warn('  3. User is not on a page with tweets');
    console.warn('[AI Translator] Current URL:', window.location.href);
  }
  
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
      console.log('[AI Translator] Element already processed, skipping');
      return;
    }

    // 解析推文
    const tweet = TweetParser.parse(element);
    if (!tweet) {
      console.log('[AI Translator] Failed to parse tweet from element');
      return;
    }
    console.log('[AI Translator] Successfully parsed tweet:', tweet.id, 'author:', tweet.author.handle);

    // 检查是否已处理过这个 ID
    if (processedTweets.has(tweet.id)) {
      console.log('[AI Translator] Tweet ID already in processed set:', tweet.id);
      return;
    }

    // 标记为已处理
    element.setAttribute(`data-${NAMESPACE}-processed`, 'true');
    element.setAttribute(`data-${NAMESPACE}-tweet-id`, tweet.id);
    processedTweets.add(tweet.id);

    // 注入翻译按钮
    if (uiInjector) {
      console.log('[AI Translator] Injecting button for tweet:', tweet.id);
      uiInjector.injectTranslateButton(tweet, handleTranslateRequest);
    } else {
      console.log('[AI Translator] UIInjector not available');
    }

  } catch (error) {
    console.error('[AI Translator] Failed to process tweet:', error);
  }
}

/**
 * 处理翻译请求
 */
async function handleTranslateRequest(tweet: ParsedTweet): Promise<void> {
  console.log('[AI Translator] handleTranslateRequest called for tweet:', tweet.id);
  try {
    // 显示加载状态
    uiInjector?.showLoading(tweet.id);

    // 发送翻译请求到 Background
    console.log('[AI Translator] Sending message to background');
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
    console.log('[AI Translator] Received response:', response);
    if (response.data?.payload?.translatedText) {
      console.log('[AI Translator] Translated text length:', response.data.payload.translatedText.length);
      console.log('[AI Translator] Translated text preview:', response.data.payload.translatedText.substring(0, 200));
    }

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
  console.log('[AI Translator] Received background message:', message);
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
