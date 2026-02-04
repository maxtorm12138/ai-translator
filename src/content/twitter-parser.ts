import type { ParsedTweet, TweetAuthor, TweetMedia } from '@/types';

/**
 * Twitter DOM 解析器
 * 负责从 Twitter/X 页面 DOM 中提取推文内容
 */

export class TweetParser {
  private static readonly SELECTORS = {
    TWEET_ARTICLE: 'article',
    TWEET_CONTAINER: '[data-testid="tweet"]',
    TWEET_TEXT: '[data-testid="tweetText"]',
    TWEET_TEXT_SPAN: '[data-testid="tweetText"] > span',
    USER_NAME: '[data-testid="User-Name"]',
    USER_LINK: 'a[role="link"]',
    TIMESTAMP: 'time',
    TWEET_LINK: 'a[href*="/status/"]',
    MEDIA_PHOTO: '[data-testid="tweetPhoto"]',
    MEDIA_VIDEO: '[data-testid="videoPlayer"]',
    MEDIA_GIF: '[data-testid="gifPlayer"]',
    METRIC_REPLIES: '[data-testid="reply"]',
    METRIC_RETWEETS: '[data-testid="retweet"]',
    METRIC_LIKES: '[data-testid="like"]'
  };

  /**
   * 解析推文元素
   * @param element 推文 DOM 元素
   * @returns ParsedTweet | null
   */
  static parse(element: HTMLElement): ParsedTweet | null {
    try {
      console.log('[AI Translator] TweetParser.parse called for element:', element.tagName, element.className?.substring(0, 50));
      // 验证元素
      if (!this.isValidTweetElement(element)) {
        console.log('[AI Translator] TweetParser.parse: element is not valid tweet element');
        return null;
      }
      console.log('[AI Translator] TweetParser.parse: element passed validation');

      // 提取推文 ID
      const tweetId = this.extractTweetId(element);
      if (!tweetId) {
        console.log('[AI Translator] TweetParser.parse: failed to extract tweet ID');
        return null;
      }
      console.log('[AI Translator] TweetParser.parse: extracted tweet ID:', tweetId);

      // 提取文本内容
      const text = this.extractText(element);

      // 提取作者信息
      const author = this.extractAuthor(element);

      // 提取时间戳
      const timestamp = this.extractTimestamp(element);

      // 提取推文链接
      const url = this.extractTweetUrl(element, tweetId);

      // 提取统计数据
      const metrics = this.extractMetrics(element);

      // 提取媒体
      const media = this.extractMedia(element);

      // 检查是否是回复
      const isReply = this.isReplyTweet(element);

      // 检查是否是转发
      const isRetweet = this.isRetweetTweet(element);

      return {
        id: tweetId,
        text,
        author,
        timestamp,
        url,
        metrics,
        media,
        isReply,
        isRetweet,
        element
      };

    } catch (error) {
      console.error('[AI Translator] Failed to parse tweet:', error);
      return null;
    }
  }

  /**
   * 验证是否是有效的推文元素
   * 支持首页时间线和推文详情页的不同结构
   */
  private static isValidTweetElement(element: HTMLElement): boolean {
    // 支持多种推文容器
    const isArticle = element.tagName === 'ARTICLE';
    const hasTweetAttribute = element.matches('[data-testid="tweet"]') ||
                              element.querySelector('[data-testid="tweet"]') !== null;
    const isCellInnerDiv = element.matches('[data-testid="cellInnerDiv"]') ||
                           element.closest('[data-testid="cellInnerDiv"]') !== null;
    
    console.log('[AI Translator] isValidTweetElement: isArticle=', isArticle,
      'hasTweetAttribute=', hasTweetAttribute,
      'isCellInnerDiv=', isCellInnerDiv);
    
    if (!isArticle && !hasTweetAttribute && !isCellInnerDiv) {
      console.log('[AI Translator] isValidTweetElement: rejected - not recognized as tweet container');
      return false;
    }
    
    // 检查是否包含推文文本（支持多种选择器）
    let textElement = element.querySelector(this.SELECTORS.TWEET_TEXT);
    
    // 策略 1: 检查 data-testid="tweetText"
    if (textElement) {
      console.log('[AI Translator] isValidTweetElement: matched strategy 1 (tweetText)');
      return true;
    }
    
    // 策略 2: 检查 lang 属性（推文通常有 lang 属性标记语言）
    const langElement = element.querySelector('[lang]');
    if (langElement) {
      console.log('[AI Translator] isValidTweetElement: matched strategy 2 (lang attribute)');
      return true;
    }
    
    // 策略 3: 检查包含长文本的 span（首页时间线推文结构）
    const spans = element.querySelectorAll('span');
    console.log('[AI Translator] isValidTweetElement: checking', spans.length, 'spans for strategy 3');
    for (const span of spans) {
      const text = span.textContent?.trim() || '';
      // 过滤掉只包含 URL、短文本或特殊字符的
      if (text.length > 10 && !/^https?:\/\//.test(text)) {
        // 确保不是按钮或链接的一部分
        const parentButton = span.closest('button, a[role="link"]');
        if (!parentButton) {
          console.log('[AI Translator] isValidTweetElement: matched strategy 3 (span with text length', text.length, ')');
          return true;
        }
      }
    }
    
    // 策略 4: 检查是否包含时间戳和用户信息
    const hasTimestamp = element.querySelector('time') !== null;
    const hasUserInfo = element.querySelector('a[href^="/"]') !== null;
    
    console.log('[AI Translator] isValidTweetElement: hasTimestamp=', hasTimestamp, 'hasUserInfo=', hasUserInfo);
    
    if (hasTimestamp && hasUserInfo) {
      console.log('[AI Translator] isValidTweetElement: matched strategy 4 (timestamp + user info)');
      return true;
    }

    // 最后检查：对于带有 data-testid="tweet" 的元素，认为是推文
    if (hasTweetAttribute) {
      console.log('[AI Translator] isValidTweetElement: matched strategy 5 (has tweet attribute)');
      return true;
    }

    console.log('[AI Translator] isValidTweetElement: rejected - no strategy matched');
    return false;
  }

  /**
   * 提取推文 ID
   */
  private static extractTweetId(element: HTMLElement): string | null {
    // 方法 1: 从推文链接中提取
    const tweetLink = element.querySelector(this.SELECTORS.TWEET_LINK);
    console.log('[AI Translator] extractTweetId: tweetLink found?', !!tweetLink);
    if (tweetLink) {
      const href = tweetLink.getAttribute('href');
      console.log('[AI Translator] extractTweetId: tweetLink href =', href);
      if (href) {
        const match = href.match(/\/status\/(\d+)/);
        if (match) {
          console.log('[AI Translator] extractTweetId: method 1 matched, ID =', match[1]);
          return match[1];
        }
      }
    }

    // 方法 2: 从时间戳链接中提取
    const timeElement = element.querySelector(this.SELECTORS.TIMESTAMP);
    console.log('[AI Translator] extractTweetId: timeElement found?', !!timeElement);
    if (timeElement) {
      const parent = timeElement.closest('a');
      if (parent) {
        const href = parent.getAttribute('href');
        console.log('[AI Translator] extractTweetId: time link href =', href);
        if (href) {
          const match = href.match(/\/status\/(\d+)/);
          if (match) {
            console.log('[AI Translator] extractTweetId: method 2 matched, ID =', match[1]);
            return match[1];
          }
        }
      }
    }

    // 方法 3: 生成基于内容的 ID
    const text = this.extractText(element);
    console.log('[AI Translator] extractTweetId: extracted text length =', text?.length);
    if (text && text.length > 0) {
      const hashedId = this.hashText(text);
      console.log('[AI Translator] extractTweetId: method 3 generated hash ID =', hashedId);
      return hashedId;
    }

    // 方法 4: 使用时间戳作为 ID
    const fallbackId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    console.log('[AI Translator] extractTweetId: method 4 using fallback ID =', fallbackId);
    return fallbackId;
  }

  /**
   * 提取推文文本
   */
  private static extractText(element: HTMLElement): string {
    // 尝试多种选择器获取推文文本
    console.log('[AI Translator] extractText: starting extraction');
    let textElement = element.querySelector(this.SELECTORS.TWEET_TEXT);
    console.log('[AI Translator] extractText: data-testid="tweetText" found?', !!textElement);
    
    // 如果找不到，尝试其他选择器
    if (!textElement) {
      // 尝试查找包含文本内容的 span 元素
      textElement = element.querySelector('div[dir="auto"] span');
      console.log('[AI Translator] extractText: div[dir="auto"] span found?', !!textElement);
    }
    
    // 如果还是找不到，尝试查找任何文本内容
    if (!textElement) {
      const spans = element.querySelectorAll('span');
      console.log('[AI Translator] extractText: checking', spans.length, 'spans for text content');
      for (const span of spans) {
        if (span.textContent && span.textContent.trim().length > 10) {
          textElement = span;
          console.log('[AI Translator] extractText: found span with text:', span.textContent.trim().substring(0, 50));
          break;
        }
      }
    }
    
    if (!textElement) {
      console.log('[AI Translator] extractText: no text element found, returning empty');
      return '';
    }

    // 克隆元素以避免修改原始 DOM
    const clone = textElement.cloneNode(true) as HTMLElement;

    // 处理换行符（Twitter 使用 <br> 或分隔的 span）
    const breaks = clone.querySelectorAll('br');
    breaks.forEach(br => br.replaceWith('\n'));

    // 获取纯文本内容
    let text = clone.textContent || '';

    // 清理多余空白
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * 提取作者信息
   */
  private static extractAuthor(element: HTMLElement): TweetAuthor {
    const userNameElement = element.querySelector(this.SELECTORS.USER_NAME);
    
    let name = 'Unknown';
    let handle = '@unknown';
    let avatar = '';

    if (userNameElement) {
      // 提取显示名称
      const nameElement = userNameElement.querySelector('a span span');
      if (nameElement) {
        name = nameElement.textContent || name;
      }

      // 提取用户名（handle）
      const links = userNameElement.querySelectorAll('a');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/') && !href.includes('/status/')) {
          handle = href.replace('/', '@');
          break;
        }
      }

      // 提取头像
      const avatarImg = element.querySelector('img[src*="profile_images"]');
      if (avatarImg) {
        avatar = avatarImg.getAttribute('src') || '';
      }
    } else {
      // 备选：尝试从其他位置提取作者信息
      const allLinks = element.querySelectorAll('a[href^="/"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/') && !href.includes('/status/') && href.length > 1) {
          handle = href.replace('/', '@');
          name = link.textContent || name;
          break;
        }
      }
    }

    return { name, handle, avatar };
  }

  /**
   * 提取时间戳
   */
  private static extractTimestamp(element: HTMLElement): string {
    const timeElement = element.querySelector(this.SELECTORS.TIMESTAMP);
    if (timeElement) {
      const datetime = timeElement.getAttribute('datetime');
      if (datetime) {
        return datetime;
      }
    }
    return new Date().toISOString();
  }

  /**
   * 提取推文 URL
   */
  private static extractTweetUrl(element: HTMLElement, tweetId: string): string {
    const timeElement = element.querySelector(this.SELECTORS.TIMESTAMP);
    if (timeElement) {
      const link = timeElement.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href) {
          return `https://twitter.com${href}`;
        }
      }
    }

    // 备用：构建 URL
    const author = this.extractAuthor(element);
    return `https://twitter.com${author.handle.replace('@', '/')}/status/${tweetId}`;
  }

  /**
   * 提取统计数据
   */
  private static extractMetrics(element: HTMLElement): { replies?: number; retweets?: number; likes?: number } {
    const metrics: { replies?: number; retweets?: number; likes?: number } = {};

    // 提取回复数
    const replyElement = element.querySelector(this.SELECTORS.METRIC_REPLIES);
    if (replyElement) {
      const count = this.parseCount(replyElement.textContent);
      if (count !== undefined) metrics.replies = count;
    }

    // 提取转发数
    const retweetElement = element.querySelector(this.SELECTORS.METRIC_RETWEETS);
    if (retweetElement) {
      const count = this.parseCount(retweetElement.textContent);
      if (count !== undefined) metrics.retweets = count;
    }

    // 提取点赞数
    const likeElement = element.querySelector(this.SELECTORS.METRIC_LIKES);
    if (likeElement) {
      const count = this.parseCount(likeElement.textContent);
      if (count !== undefined) metrics.likes = count;
    }

    return metrics;
  }

  /**
   * 解析计数文本（如 "1.2K" -> 1200）
   */
  private static parseCount(text: string | null): number | undefined {
    if (!text) return undefined;

    const cleanText = text.trim().toUpperCase();
    if (!cleanText) return undefined;

    // 处理 "1.2K" 格式
    if (cleanText.includes('K')) {
      const num = parseFloat(cleanText.replace('K', ''));
      return Math.round(num * 1000);
    }

    // 处理 "1.2M" 格式
    if (cleanText.includes('M')) {
      const num = parseFloat(cleanText.replace('M', ''));
      return Math.round(num * 1000000);
    }

    // 处理普通数字
    const num = parseInt(cleanText.replace(/,/g, ''), 10);
    return isNaN(num) ? undefined : num;
  }

  /**
   * 提取媒体
   */
  private static extractMedia(element: HTMLElement): TweetMedia[] | undefined {
    const media: TweetMedia[] = [];

    // 提取图片
    const photos = element.querySelectorAll(this.SELECTORS.MEDIA_PHOTO);
    for (const photo of photos) {
      const img = photo.querySelector('img');
      if (img) {
        const url = img.getAttribute('src');
        if (url) {
          media.push({ type: 'photo', url });
        }
      }
    }

    // 提取视频
    const videos = element.querySelectorAll(this.SELECTORS.MEDIA_VIDEO);
    for (const video of videos) {
      const poster = video.getAttribute('poster');
      if (poster) {
        media.push({ type: 'video', url: poster });
      }
    }

    // 提取 GIF
    const gifs = element.querySelectorAll(this.SELECTORS.MEDIA_GIF);
    for (const gif of gifs) {
      const video = gif.querySelector('video');
      if (video) {
        const src = video.getAttribute('src');
        if (src) {
          media.push({ type: 'gif', url: src });
        }
      }
    }

    return media.length > 0 ? media : undefined;
  }

  /**
   * 检查是否是回复推文
   */
  private static isReplyTweet(element: HTMLElement): boolean {
    // 检查是否有回复指示器
    const replyIndicator = element.querySelector('[data-testid="socialContext"]');
    if (replyIndicator) {
      const text = replyIndicator.textContent?.toLowerCase() || '';
      return text.includes('replying to') || text.includes('回复');
    }
    return false;
  }

  /**
   * 检查是否是转发推文
   */
  private static isRetweetTweet(element: HTMLElement): boolean {
    // 检查是否有转发指示器
    const socialContext = element.querySelector('[data-testid="socialContext"]');
    if (socialContext) {
      const text = socialContext.textContent?.toLowerCase() || '';
      return text.includes('retweeted') || 
             text.includes('reposted') || 
             text.includes('转推') || 
             text.includes('转发');
    }
    return false;
  }

  /**
   * 对文本进行简单哈希
   */
  private static hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为 32bit 整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 检查推文是否包含可翻译内容
   * @param tweet 解析的推文
   * @returns boolean
   */
  static hasTranslatableContent(tweet: ParsedTweet): boolean {
    if (!tweet.text || tweet.text.trim().length === 0) {
      return false;
    }

    // 检查是否只包含 URL、@提及、#标签
    const textWithoutSpecial = tweet.text
      .replace(/https?:\/\/\S+/g, '') // 移除 URL
      .replace(/@\w+/g, '') // 移除 @提及
      .replace(/#\w+/g, '') // 移除 #标签
      .trim();

    return textWithoutSpecial.length > 0;
  }

  /**
   * 获取推文字数（近似值）
   * @param tweet 解析的推文
   * @returns number
   */
  static getTextLength(tweet: ParsedTweet): number {
    return tweet.text?.length || 0;
  }
}