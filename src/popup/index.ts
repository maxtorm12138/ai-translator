import type { 
  PluginConfig, 
  CacheStats, 
  ApiStatusResult,
  LanguageCode 
} from '@/types';
import { MessageType, LANGUAGE_NAMES, DEFAULT_CONFIG } from '@/types';

/**
 * Popup 页面逻辑
 */

// DOM 元素缓存
const elements = {
  // 状态指示器
  statusIndicator: document.getElementById('statusIndicator') as HTMLElement,
  statusDot: document.querySelector('.status-dot') as HTMLElement,
  apiStatus: document.getElementById('apiStatus') as HTMLElement,
  currentLang: document.getElementById('currentLang') as HTMLElement,
  cacheCount: document.getElementById('cacheCount') as HTMLElement,

  // 快捷翻译
  quickInput: document.getElementById('quickInput') as HTMLTextAreaElement,
  targetLang: document.getElementById('targetLang') as HTMLSelectElement,
  quickTranslateBtn: document.getElementById('quickTranslateBtn') as HTMLButtonElement,
  quickResult: document.getElementById('quickResult') as HTMLElement,
  resultText: document.getElementById('resultText') as HTMLElement,
  copyResultBtn: document.getElementById('copyResultBtn') as HTMLButtonElement,

  // 快捷设置
  autoTranslate: document.getElementById('autoTranslate') as HTMLInputElement,
  showOriginal: document.getElementById('showOriginal') as HTMLInputElement,
  buttonPosition: document.getElementById('buttonPosition') as HTMLSelectElement,

  // 底部按钮
  openOptionsBtn: document.getElementById('openOptionsBtn') as HTMLButtonElement,
  clearCacheBtn: document.getElementById('clearCacheBtn') as HTMLButtonElement,
};

// 当前配置
let currentConfig: PluginConfig = DEFAULT_CONFIG;

/**
 * 初始化 Popup
 */
async function initialize(): Promise<void> {
  // 加载配置
  await loadConfig();

  // 检查 API 状态
  await checkApiStatus();

  // 加载缓存统计
  await loadCacheStats();

  // 绑定事件
  bindEvents();

  // 恢复设置状态
  restoreSettings();
}

/**
 * 加载配置
 */
async function loadConfig(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.GET_CONFIG,
      timestamp: Date.now()
    });

    if (response.success && response.data) {
      currentConfig = { ...DEFAULT_CONFIG, ...response.data };
      updateUI();
    }
  } catch (error) {
    console.error('[AI Translator Popup] Failed to load config:', error);
  }
}

/**
 * 更新 UI 显示
 */
function updateUI(): void {
  // 更新目标语言显示
  elements.currentLang.textContent = LANGUAGE_NAMES[currentConfig.translation.targetLang];
  elements.targetLang.value = currentConfig.translation.targetLang;

  // 更新设置状态
  elements.autoTranslate.checked = currentConfig.translation.autoTranslate;
  elements.showOriginal.checked = currentConfig.translation.showOriginal;
  elements.buttonPosition.value = currentConfig.ui.buttonPosition;
}

/**
 * 恢复设置状态
 */
function restoreSettings(): void {
  elements.autoTranslate.checked = currentConfig.translation.autoTranslate;
  elements.showOriginal.checked = currentConfig.translation.showOriginal;
  elements.buttonPosition.value = currentConfig.ui.buttonPosition;
}

/**
 * 检查 API 状态
 */
async function checkApiStatus(): Promise<void> {
  // 显示检查中状态
  elements.statusDot.className = 'status-dot checking';
  elements.apiStatus.textContent = '检查中...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.GET_API_STATUS,
      timestamp: Date.now()
    });

    if (response.success) {
      const status = response.data as ApiStatusResult;
      updateStatusIndicator(status);
    } else {
      setErrorStatus('检查失败');
    }
  } catch (error) {
    console.error('[AI Translator Popup] Failed to check API status:', error);
    setErrorStatus('检查失败');
  }
}

/**
 * 更新状态指示器
 */
function updateStatusIndicator(status: ApiStatusResult): void {
  elements.statusDot.classList.remove('checking', 'connected', 'error');

  if (status.status === 'connected') {
    elements.statusDot.classList.add('connected');
    elements.apiStatus.textContent = '已连接';
    if (status.latency) {
      elements.apiStatus.textContent += ` (${status.latency}ms)`;
    }
  } else if (status.status === 'unconfigured') {
    elements.statusDot.classList.add('error');
    elements.apiStatus.textContent = '未配置';
  } else {
    elements.statusDot.classList.add('error');
    elements.apiStatus.textContent = status.error || '连接失败';
  }
}

/**
 * 设置错误状态
 */
function setErrorStatus(message: string): void {
  elements.statusDot.classList.remove('checking', 'connected');
  elements.statusDot.classList.add('error');
  elements.apiStatus.textContent = message;
}

/**
 * 加载缓存统计
 */
async function loadCacheStats(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.GET_CACHE_STATS,
      timestamp: Date.now()
    });

    if (response.success) {
      const stats = response.data as CacheStats;
      elements.cacheCount.textContent = stats.totalEntries.toString();
    }
  } catch (error) {
    console.error('[AI Translator Popup] Failed to load cache stats:', error);
    elements.cacheCount.textContent = '-';
  }
}

/**
 * 绑定事件
 */
function bindEvents(): void {
  // 快捷翻译
  elements.quickTranslateBtn.addEventListener('click', handleQuickTranslate);
  elements.quickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleQuickTranslate();
    }
  });

  // 复制结果
  elements.copyResultBtn.addEventListener('click', copyTranslationResult);

  // 目标语言改变
  elements.targetLang.addEventListener('change', async (e) => {
    const targetLang = (e.target as HTMLSelectElement).value as LanguageCode;
    await saveSetting('translation.targetLang', targetLang);
  });

  // 自动翻译开关
  elements.autoTranslate.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await saveSetting('translation.autoTranslate', checked);
  });

  // 显示原文开关
  elements.showOriginal.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    await saveSetting('translation.showOriginal', checked);
  });

  // 按钮位置改变
  elements.buttonPosition.addEventListener('change', async (e) => {
    const position = (e.target as HTMLSelectElement).value as 'inline' | 'corner';
    await saveSetting('ui.buttonPosition', position);
  });

  // 打开设置页面
  elements.openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // 清空缓存
  elements.clearCacheBtn.addEventListener('click', handleClearCache);

  // 状态指示器点击刷新
  elements.statusIndicator.addEventListener('click', () => {
    checkApiStatus();
  });
}

/**
 * 处理快捷翻译
 */
async function handleQuickTranslate(): Promise<void> {
  const text = elements.quickInput.value.trim();
  if (!text) {
    return;
  }

  const targetLang = elements.targetLang.value;

  // 显示加载状态
  elements.quickTranslateBtn.disabled = true;
  elements.quickTranslateBtn.innerHTML = '<span class="spinner"></span>';

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.TRANSLATE_TWEET,
      payload: {
        tweetId: 'quick-translate-' + Date.now(),
        text: text,
        targetLang: targetLang,
        sourceLang: 'auto'
      },
      timestamp: Date.now()
    });

    if (response.success) {
      const result = response.data;
      if (result.type === MessageType.TRANSLATE_RESULT) {
        showTranslationResult(result.payload.translatedText);
      } else if (result.type === MessageType.TRANSLATE_ERROR) {
        showError(result.payload.error.message);
      }
    } else {
      showError(response.error || '翻译失败');
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : '翻译失败');
  } finally {
    elements.quickTranslateBtn.disabled = false;
    elements.quickTranslateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      翻译
    `;
  }
}

/**
 * 显示翻译结果
 */
function showTranslationResult(text: string): void {
  elements.resultText.textContent = text;
  elements.quickResult.classList.remove('hidden');
}

/**
 * 显示错误
 */
function showError(message: string): void {
  elements.resultText.innerHTML = `<span class="error-message">${escapeHtml(message)}</span>`;
  elements.quickResult.classList.remove('hidden');
}

/**
 * 复制翻译结果
 */
async function copyTranslationResult(): Promise<void> {
  const text = elements.resultText.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    elements.copyResultBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    `;
    setTimeout(() => {
      elements.copyResultBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
      `;
    }, 2000);
  } catch (error) {
    console.error('[AI Translator Popup] Failed to copy:', error);
  }
}

/**
 * 保存设置
 */
async function saveSetting(key: string, value: unknown): Promise<void> {
  try {
    const keys = key.split('.');
    const update: Record<string, unknown> = {};
    let current = update;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;

    await chrome.runtime.sendMessage({
      type: MessageType.SET_CONFIG,
      payload: update,
      timestamp: Date.now()
    });

    // 更新本地配置
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let target: any = currentConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;

  } catch (error) {
    console.error('[AI Translator Popup] Failed to save setting:', error);
  }
}

/**
 * 处理清空缓存
 */
async function handleClearCache(): Promise<void> {
  if (!confirm('确定要清空所有翻译缓存吗？')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.CLEAR_CACHE,
      timestamp: Date.now()
    });

    if (response.success) {
      elements.cacheCount.textContent = '0';
      showNotification('缓存已清空', 'success');
    }
  } catch (error) {
    console.error('[AI Translator Popup] Failed to clear cache:', error);
    showNotification('清空缓存失败', 'error');
  }
}

/**
 * 显示通知
 */
function showNotification(message: string, type: 'success' | 'error'): void {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = type === 'success' ? 'success-message' : 'error-message';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    animation: slideUp 0.3s ease;
  `;

  document.body.appendChild(notification);

  // 3秒后移除
  setTimeout(() => {
    notification.style.animation = 'slideDown 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', initialize);

// 导出用于测试
export { initialize };