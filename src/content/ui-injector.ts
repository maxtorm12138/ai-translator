import type { ParsedTweet } from '@/types';

/**
 * UI 注入器
 * 负责在推文旁边注入翻译按钮和结果显示
 * 使用 Shadow DOM 隔离样式
 */

export class UIInjector {
  private static readonly NAMESPACE = 'ai-translator';
  private static readonly SHADOW_STYLE = `
    :host {
      --at-primary: #1d9bf0;
      --at-primary-hover: #1a8cd8;
      --at-bg: rgba(29, 155, 240, 0.1);
      --at-bg-hover: rgba(29, 155, 240, 0.2);
      --at-text: #0f1419;
      --at-text-secondary: #536471;
      --at-border: rgb(207, 217, 222);
      --at-success: #00ba7c;
      --at-error: #f4212e;
      --at-radius: 9999px;
      --at-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      
      display: inline-flex;
      align-items: center;
      font-family: var(--at-font);
    }
    
    .at-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--at-primary);
      font-size: 14px;
      font-weight: 400;
      cursor: pointer;
      transition: opacity 0.2s ease;
      text-decoration: none;
      margin-top: 4px;
      margin-bottom: 4px;
    }
    
    .at-btn:hover {
      opacity: 0.8;
      text-decoration: underline;
    }
    
    .at-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      text-decoration: none;
    }
    
    .at-btn svg {
      width: 14px;
      height: 14px;
      fill: var(--at-primary);
    }
    
    .at-result {
      margin-top: 8px;
      padding: 12px 16px;
      background: var(--at-bg);
      border: 1px solid var(--at-border);
      border-radius: 12px;
      color: var(--at-text);
      font-size: 15px;
      line-height: 1.5;
      animation: at-fade-in 0.3s ease;
    }
    
    .at-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 12px;
      color: var(--at-text-secondary);
    }
    
    .at-result-label {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .at-result-actions {
      display: flex;
      gap: 8px;
    }
    
    .at-action-btn {
      padding: 2px 6px;
      background: transparent;
      border: none;
      color: var(--at-primary);
      font-size: 12px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    }
    
    .at-action-btn:hover {
      background: var(--at-bg-hover);
    }
    
    .at-result-text {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .at-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--at-text-secondary);
      font-size: 13px;
    }
    
    .at-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--at-border);
      border-top-color: var(--at-primary);
      border-radius: 50%;
      animation: at-spin 1s linear infinite;
    }
    
    .at-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(244, 33, 46, 0.1);
      border: 1px solid rgba(244, 33, 46, 0.2);
      border-radius: 8px;
      color: var(--at-error);
      font-size: 13px;
    }
    
    .at-error svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    
    .at-collapsed {
      display: none;
    }
    
    @keyframes at-fade-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    @keyframes at-spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    /* 暗黑模式适配 */
    @media (prefers-color-scheme: dark) {
      :host {
        --at-text: #e7e9ea;
        --at-text-secondary: #71767b;
        --at-border: rgb(51, 54, 57);
        --at-bg: rgba(29, 155, 240, 0.1);
      }
    }
  `;

  // 存储每个推文的 UI 状态
  private uiStates: Map<string, {
    container: HTMLElement;
    resultContainer?: HTMLElement;
    buttonContainer?: HTMLElement;
  }> = new Map();

  /**
   * 注入翻译按钮
   * @param tweet 解析的推文
   * @param onTranslate 翻译回调
   */
  injectTranslateButton(
    tweet: ParsedTweet,
    onTranslate: (tweet: ParsedTweet) => Promise<void>
  ): void {
    console.log('[AI Translator] injectTranslateButton called for tweet:', tweet.id, 'text preview:', tweet.text?.substring(0, 50));
    // 检查是否已注入
    if (this.uiStates.has(tweet.id)) {
      console.log('[AI Translator] Tweet already has UI injected:', tweet.id);
      return;
    }

    // 找到推文文本容器作为插入参考点
    console.log('[AI Translator] Finding tweet text container for element:', tweet.element.tagName, tweet.element.className?.substring(0, 50));
    const tweetTextContainer = this.findTweetTextContainer(tweet.element);
    if (!tweetTextContainer) {
      console.log('[AI Translator] Could not find tweet text container for tweet:', tweet.id);
      console.log('[AI Translator] Element HTML preview:', tweet.element.outerHTML?.substring(0, 500));
      return;
    }
    console.log('[AI Translator] Found tweet text container for tweet:', tweet.id, 'container:', tweetTextContainer.tagName, tweetTextContainer.className?.substring(0, 50));

    // 创建容器
    const container = document.createElement('div');
    container.className = `${UIInjector.NAMESPACE}-container`;
    container.style.cssText = `
      display: block;
    `;

    // 创建 Shadow DOM
    const shadow = container.attachShadow({ mode: 'open' });

    // 添加样式
    const style = document.createElement('style');
    style.textContent = UIInjector.SHADOW_STYLE;
    shadow.appendChild(style);

    // 创建按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'at-button-wrapper';

    // 创建翻译按钮
    console.log('[AI Translator] Creating translate button for tweet:', tweet.id);
    const button = this.createTranslateButton(async () => {
      console.log('[AI Translator] Translate callback called for tweet:', tweet.id);
      button.disabled = true;
      try {
        await onTranslate(tweet);
      } catch (error) {
        console.error('[AI Translator] onTranslate error:', error);
        throw error;
      } finally {
        button.disabled = false;
      }
    });

    buttonContainer.appendChild(button);
    shadow.appendChild(buttonContainer);

    // 插入到推文文本容器后面
    tweetTextContainer.insertAdjacentElement('afterend', container);
    console.log('[AI Translator] Button injected for tweet:', tweet.id);

    // 保存状态
    this.uiStates.set(tweet.id, {
      container,
      buttonContainer
    });
  }

  /**
   * 显示加载状态
   * @param tweetId 推文 ID
   */
  showLoading(tweetId: string): void {
    const state = this.uiStates.get(tweetId);
    if (!state) return;

    const shadow = state.container.shadowRoot;
    if (!shadow) return;

    // 清除之前的内容
    this.clearResult(tweetId);

    // 创建加载元素
    const loading = document.createElement('div');
    loading.className = 'at-loading';
    loading.innerHTML = `
      <div class="at-spinner"></div>
      <span>正在翻译...</span>
    `;

    // 创建结果容器
    const resultContainer = document.createElement('div');
    resultContainer.className = 'at-result-container';
    resultContainer.appendChild(loading);

    shadow.appendChild(resultContainer);
    state.resultContainer = resultContainer;
  }

  /**
   * 显示翻译结果
   * @param tweetId 推文 ID
   * @param translatedText 翻译后的文本
   */
  showTranslation(tweetId: string, translatedText: string): void {
    const state = this.uiStates.get(tweetId);
    if (!state) return;

    const shadow = state.container.shadowRoot;
    if (!shadow) return;

    // 清除之前的内容
    this.clearResult(tweetId);

    // 创建结果元素
    const result = document.createElement('div');
    result.className = 'at-result';
    result.innerHTML = `
      <div class="at-result-header">
        <span class="at-result-label">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
          </svg>
          AI 翻译
        </span>
        <div class="at-result-actions">
          <button class="at-action-btn at-copy-btn">复制</button>
          <button class="at-action-btn at-collapse-btn">收起</button>
        </div>
      </div>
      <div class="at-result-text">${this.escapeHtml(translatedText)}</div>
    `;

    // 创建结果容器
    const resultContainer = document.createElement('div');
    resultContainer.className = 'at-result-container';
    resultContainer.appendChild(result);

    // 绑定按钮事件
    const copyBtn = result.querySelector('.at-copy-btn');
    copyBtn?.addEventListener('click', () => {
      this.copyToClipboard(translatedText);
      copyBtn.textContent = '已复制!';
      setTimeout(() => {
        copyBtn.textContent = '复制';
      }, 2000);
    });

    const collapseBtn = result.querySelector('.at-collapse-btn');
    collapseBtn?.addEventListener('click', () => {
      result.classList.toggle('at-collapsed');
      collapseBtn.textContent = result.classList.contains('at-collapsed') ? '展开' : '收起';
    });

    shadow.appendChild(resultContainer);
    state.resultContainer = resultContainer;
  }

  /**
   * 显示错误
   * @param tweetId 推文 ID
   * @param errorMessage 错误消息
   */
  showError(tweetId: string, errorMessage: string): void {
    const state = this.uiStates.get(tweetId);
    if (!state) return;

    const shadow = state.container.shadowRoot;
    if (!shadow) return;

    // 清除之前的内容
    this.clearResult(tweetId);

    // 创建错误元素
    const error = document.createElement('div');
    error.className = 'at-error';
    error.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span>${this.escapeHtml(errorMessage)}</span>
    `;

    // 创建结果容器
    const resultContainer = document.createElement('div');
    resultContainer.className = 'at-result-container';
    resultContainer.appendChild(error);

    shadow.appendChild(resultContainer);
    state.resultContainer = resultContainer;
  }

  /**
   * 清除结果
   * @param tweetId 推文 ID
   */
  private clearResult(tweetId: string): void {
    const state = this.uiStates.get(tweetId);
    if (state?.resultContainer) {
      state.resultContainer.remove();
      state.resultContainer = undefined;
    }
  }

  /**
   * 创建翻译按钮
   * @param onClick 点击回调
   * @returns HTMLButtonElement
   */
  private createTranslateButton(onClick: () => Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'at-btn';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      <span>使用AI翻译</span>
    `;
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[AI Translator] Translate button clicked');
      try {
        await onClick();
      } catch (error) {
        console.error('[AI Translator] Button click handler error:', error);
      }
    });
    return button;
  }

  /**
   * 查找推文文本容器
   * 用于在文本后插入翻译按钮
   * @param tweetElement 推文元素
   * @returns HTMLElement | null
   */
  private findTweetTextContainer(tweetElement: HTMLElement): HTMLElement | null {
    console.log('[AI Translator] findTweetTextContainer called, element tag:', tweetElement.tagName);
    
    // 策略 1: 找到推文文本元素本身
    const tweetText = tweetElement.querySelector('[data-testid="tweetText"]');
    console.log('[AI Translator] Strategy 1 - tweetText query:', tweetText ? 'found' : 'not found');
    if (tweetText) {
      return tweetText as HTMLElement;
    }

    // 策略 2: 如果没有找到 data-testid="tweetText"，找包含 lang 属性的元素
    const langElement = tweetElement.querySelector('[lang]');
    console.log('[AI Translator] Strategy 2 - lang element query:', langElement ? 'found' : 'not found');
    if (langElement) {
      return langElement as HTMLElement;
    }

    // 策略 3: 找到 article 中的文本区域
    if (tweetElement.tagName === 'ARTICLE') {
      // 找 article 中的第一个 div，通常是内容区域
      const firstDiv = tweetElement.querySelector('div[dir="auto"]');
      console.log('[AI Translator] Strategy 3 - dir="auto" div:', firstDiv ? 'found' : 'not found');
      if (firstDiv) {
        return firstDiv as HTMLElement;
      }
    }

    // 策略 4: 查找包含文本内容的 span 元素
    // 首页时间线的推文可能使用 span 包裹文本，但没有 data-testid
    const spans = tweetElement.querySelectorAll('span');
    console.log('[AI Translator] Strategy 4 - checking', spans.length, 'spans');
    for (const span of spans) {
      const text = span.textContent?.trim();
      // 放宽条件：允许有子元素但内容足够长的 span
      if (text && text.length > 5 && !/^https?:\/\//.test(text)) {
        // 确保这个 span 不是按钮或链接的一部分
        const parentButton = span.closest('button, a[role="link"]');
        if (!parentButton) {
          console.log('[AI Translator] Strategy 4 matched span with text length:', text.length);
          return span as HTMLElement;
        }
      }
    }

    // 策略 5: 查找通用文本容器类名
    // Twitter/X 可能使用的文本容器类名模式
    const textContainerSelectors = [
      '[class*="textContent"]',
      '[class*="tweet-text"]',
      '[class*="TweetText"]',
      '[class*="tweetText"]',
      '[class*="content"]',
    ];
    for (const selector of textContainerSelectors) {
      const container = tweetElement.querySelector(selector);
      if (container) {
        console.log('[AI Translator] Strategy 5 matched selector:', selector);
        return container as HTMLElement;
      }
    }

    // 策略 6: 降级策略 - 返回推文元素本身
    // 确保按钮至少能注入到推文的某个位置
    console.log('[AI Translator] Using fallback strategy: returning tweet element itself');
    return tweetElement;
  }

  /**
   * 查找合适的插入位置
   * @param tweetElement 推文元素
   * @returns HTMLElement | null
   */
  private findInsertTarget(tweetElement: HTMLElement): HTMLElement | null {
    // 策略 1: 找到推文的操作栏（回复、转发、点赞按钮所在区域）
    const actionBar = tweetElement.querySelector('[role="group"]');
    if (actionBar?.parentElement) {
      return actionBar.parentElement;
    }

    // 策略 2: 找到推文文本的父元素
    const tweetText = tweetElement.querySelector('[data-testid="tweetText"]');
    if (tweetText?.parentElement) {
      return tweetText.parentElement;
    }

    // 策略 3: 找到包含多个交互按钮的容器
    const buttons = tweetElement.querySelectorAll('button[aria-label]');
    for (const btn of buttons) {
      const parent = btn.closest('div[role="group"]')?.parentElement;
      if (parent) {
        return parent;
      }
    }

    // 策略 4: 找到 article 的最后一层 div
    if (tweetElement.tagName === 'ARTICLE') {
      // 找到 article 中最深的 div 容器
      const divs = tweetElement.querySelectorAll(':scope > div');
      if (divs.length > 0) {
        return divs[divs.length - 1] as HTMLElement;
      }
    }

    // 策略 5: 如果元素本身就是带 data-testid="tweet" 的容器
    if (tweetElement.getAttribute('data-testid') === 'tweet') {
      // 找到最后一个子 div
      const children = Array.from(tweetElement.children).filter(el => el.tagName === 'DIV');
      if (children.length > 0) {
        return children[children.length - 1] as HTMLElement;
      }
    }

    // 最后备选：返回推文元素本身
    return tweetElement;
  }

  /**
   * HTML 转义
   * @param text 原始文本
   * @returns 转义后的文本
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 复制到剪贴板
   * @param text 要复制的文本
   */
  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('[AI Translator] Failed to copy to clipboard:', error);
    }
  }

  /**
   * 移除指定推文的 UI
   * @param tweetId 推文 ID
   */
  removeUI(tweetId: string): void {
    const state = this.uiStates.get(tweetId);
    if (state) {
      state.container.remove();
      this.uiStates.delete(tweetId);
    }
  }

  /**
   * 移除所有 UI
   */
  removeAllUI(): void {
    for (const [tweetId] of this.uiStates) {
      this.removeUI(tweetId);
    }
  }
}