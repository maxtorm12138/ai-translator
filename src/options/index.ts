import type { PluginConfig, LanguageCode } from '@/types';
import { DEFAULT_CONFIG, STORAGE_KEYS } from '@/types';
import { getConfig, setConfig, getApiKey, setApiKey, getFullConfig } from '@/utils/storage';
import { sendTranslationRequest, createTranslationRequest } from '@/utils/api';
import { getCacheStats, clearAllCache } from '@/utils/cache';

/**
 * Options 页面逻辑
 * 处理设置页面的配置加载、验证和保存
 */

// ==========================================
// DOM 元素引用
// ==========================================

const elements = {
  // 状态提示
  statusMessage: document.getElementById('statusMessage') as HTMLElement,
  statusText: document.querySelector('.status-text') as HTMLElement,
  closeStatusBtn: document.querySelector('.status-message .close-btn') as HTMLButtonElement,
  
  // API 配置
  apiEndpoint: document.getElementById('apiEndpoint') as HTMLInputElement,
  apiKey: document.getElementById('apiKey') as HTMLInputElement,
  toggleApiKey: document.getElementById('toggleApiKey') as HTMLButtonElement,
  modelName: document.getElementById('modelName') as HTMLInputElement,
  
  // 翻译设置
  targetLang: document.getElementById('targetLang') as HTMLSelectElement,
  autoTranslate: document.getElementById('autoTranslate') as HTMLInputElement,
  showOriginal: document.getElementById('showOriginal') as HTMLInputElement,
  preserveFormatting: document.getElementById('preserveFormatting') as HTMLInputElement,
  
  // 缓存管理
  cacheCount: document.getElementById('cacheCount') as HTMLElement,
  cacheSize: document.getElementById('cacheSize') as HTMLElement,
  hitRate: document.getElementById('hitRate') as HTMLElement,
  clearCacheBtn: document.getElementById('clearCacheBtn') as HTMLButtonElement,
  
  // 高级设置
  advancedHeader: document.getElementById('advancedHeader') as HTMLElement,
  advancedContent: document.getElementById('advancedContent') as HTMLElement,
  temperature: document.getElementById('temperature') as HTMLInputElement,
  maxTokens: document.getElementById('maxTokens') as HTMLInputElement,
  timeout: document.getElementById('timeout') as HTMLInputElement,
  retryAttempts: document.getElementById('retryAttempts') as HTMLInputElement,
  systemPrompt: document.getElementById('systemPrompt') as HTMLTextAreaElement,
  
  // 按钮
  saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
  testApiBtn: document.getElementById('testApiBtn') as HTMLButtonElement,
} as const;

// ==========================================
// 状态管理
// ==========================================

let currentConfig: PluginConfig | null = null;
let isSaving = false;

// ==========================================
// 初始化
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  initializeEventListeners();
  await loadSettings();
  await updateCacheStats();
});

/**
 * 初始化所有事件监听器
 */
function initializeEventListeners(): void {
  // 保存按钮
  elements.saveBtn.addEventListener('click', handleSave);
  
  // 测试 API 按钮
  elements.testApiBtn.addEventListener('click', handleTestApi);
  
  // API Key 显示/隐藏切换
  elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
  
  // 高级设置折叠
  elements.advancedHeader.addEventListener('click', toggleAdvancedSection);
  
  // 清理缓存
  elements.clearCacheBtn.addEventListener('click', handleClearCache);
  
  // 关闭状态提示
  elements.closeStatusBtn.addEventListener('click', hideStatusMessage);
  
  // 输入验证 - 实时移除错误状态
  elements.apiEndpoint.addEventListener('input', () => removeErrorState(elements.apiEndpoint));
  elements.apiKey.addEventListener('input', () => removeErrorState(elements.apiKey));
  elements.modelName.addEventListener('input', () => removeErrorState(elements.modelName));
  
  // 监听配置变化（来自其他页面/实例）
  chrome.storage.onChanged.addListener(handleStorageChange);
}

/**
 * 加载设置
 */
async function loadSettings(): Promise<void> {
  try {
    const [config, apiKey] = await Promise.all([
      getConfig(),
      getApiKey()
    ]);
    
    currentConfig = config;
    
    // 填充 API 配置
    elements.apiEndpoint.value = config.api.endpoint || '';
    elements.apiKey.value = apiKey || '';
    elements.modelName.value = config.api.model || '';
    
    // 填充翻译设置
    elements.targetLang.value = config.translation.targetLang;
    elements.autoTranslate.checked = config.translation.autoTranslate;
    elements.showOriginal.checked = config.translation.showOriginal;
    elements.preserveFormatting.checked = config.translation.preserveFormatting;
    
    // 填充高级设置
    elements.temperature.value = String(config.advanced.temperature);
    elements.maxTokens.value = String(config.advanced.maxTokens);
    elements.timeout.value = String(config.advanced.timeout / 1000); // 转换为秒
    elements.retryAttempts.value = String(config.advanced.retryAttempts);
    elements.systemPrompt.value = config.advanced.systemPrompt || '';
    
    console.log('[AI Translator] Settings loaded');
  } catch (error) {
    console.error('[AI Translator] Failed to load settings:', error);
    showStatusMessage('加载设置失败，请刷新页面重试', 'error');
  }
}

// ==========================================
// 保存设置
// ==========================================

/**
 * 处理保存按钮点击
 */
async function handleSave(): Promise<void> {
  if (isSaving) return;
  
  // 验证表单
  if (!validateForm()) {
    return;
  }
  
  isSaving = true;
  setSaveButtonLoading(true);
  
  try {
    // 构建配置对象
    const config: Partial<PluginConfig> = {
      api: {
        endpoint: elements.apiEndpoint.value.trim(),
        key: '', // 密钥单独存储
        model: elements.modelName.value.trim()
      },
      translation: {
        targetLang: elements.targetLang.value as LanguageCode,
        sourceLang: 'auto',
        autoTranslate: elements.autoTranslate.checked,
        showOriginal: elements.showOriginal.checked,
        preserveFormatting: elements.preserveFormatting.checked
      },
      advanced: {
        temperature: parseFloat(elements.temperature.value) || 0.3,
        maxTokens: parseInt(elements.maxTokens.value, 10) || 2000,
        timeout: (parseInt(elements.timeout.value, 10) || 30) * 1000, // 转换为毫秒
        retryAttempts: parseInt(elements.retryAttempts.value, 10) || 2,
        systemPrompt: elements.systemPrompt.value.trim() || undefined
      }
    };
    
    // 保存配置（不包含 API Key）
    await setConfig(config);
    
    // 单独保存 API Key 到 local storage
    await setApiKey(elements.apiKey.value.trim());
    
    // 更新当前配置
    currentConfig = await getConfig();
    
    showStatusMessage('设置保存成功！', 'success');
    
    // 通知其他页面配置已更新
    notifyConfigChanged();
    
  } catch (error) {
    console.error('[AI Translator] Failed to save settings:', error);
    showStatusMessage(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
  } finally {
    isSaving = false;
    setSaveButtonLoading(false);
  }
}

/**
 * 验证表单
 */
function validateForm(): boolean {
  let isValid = true;
  
  // 验证 API Endpoint
  const endpoint = elements.apiEndpoint.value.trim();
  if (!endpoint) {
    showError(elements.apiEndpoint, '请输入 API 地址');
    isValid = false;
  } else if (!isValidUrl(endpoint)) {
    showError(elements.apiEndpoint, '请输入有效的 URL 地址');
    isValid = false;
  }
  
  // 验证 API Key
  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    showError(elements.apiKey, '请输入 API 密钥');
    isValid = false;
  }
  
  // 验证 Model Name
  const modelName = elements.modelName.value.trim();
  if (!modelName) {
    showError(elements.modelName, '请输入模型名称');
    isValid = false;
  }
  
  // 验证数值字段
  const temperature = parseFloat(elements.temperature.value);
  if (isNaN(temperature) || temperature < 0 || temperature > 2) {
    showError(elements.temperature, '温度值必须在 0-2 之间');
    isValid = false;
  }
  
  const maxTokens = parseInt(elements.maxTokens.value, 10);
  if (isNaN(maxTokens) || maxTokens < 100 || maxTokens > 4000) {
    showError(elements.maxTokens, '最大 Token 数必须在 100-4000 之间');
    isValid = false;
  }
  
  const timeout = parseInt(elements.timeout.value, 10);
  if (isNaN(timeout) || timeout < 5 || timeout > 60) {
    showError(elements.timeout, '超时时间必须在 5-60 秒之间');
    isValid = false;
  }
  
  const retryAttempts = parseInt(elements.retryAttempts.value, 10);
  if (isNaN(retryAttempts) || retryAttempts < 0 || retryAttempts > 5) {
    showError(elements.retryAttempts, '重试次数必须在 0-5 之间');
    isValid = false;
  }
  
  return isValid;
}

// ==========================================
// API 测试
// ==========================================

/**
 * 处理测试 API 按钮点击
 */
async function handleTestApi(): Promise<void> {
  const endpoint = elements.apiEndpoint.value.trim();
  const apiKey = elements.apiKey.value.trim();
  const model = elements.modelName.value.trim();
  
  if (!endpoint || !apiKey || !model) {
    showStatusMessage('请填写 API 地址、密钥和模型名称后再测试', 'warning');
    return;
  }
  
  setTestButtonLoading(true);
  
  try {
    // 读取高级设置中的 temperature
    const temperature = parseFloat(elements.temperature.value) || 0.3;
    
    // 构建测试用的临时配置
    const testConfig: PluginConfig = {
      ...DEFAULT_CONFIG,
      api: {
        endpoint,
        key: apiKey,
        model
      },
      advanced: {
        ...DEFAULT_CONFIG.advanced,
        temperature
      }
    };
    
    // 发送测试请求
    const testRequest = createTranslationRequest(
      'Hello, this is a test message.',
      'zh',
      'auto',
      testConfig
    );
    
    const response = await sendTranslationRequest(testRequest, testConfig);
    
    if (response.text) {
      showStatusMessage(
        `API 连接成功！模型: ${model}, 检测到语言: ${response.detectedLang || 'unknown'}`,
        'success'
      );
    }
  } catch (error) {
    console.error('[AI Translator] API test failed:', error);
    const errorMessage = error instanceof Error ? error.message : '连接失败';
    showStatusMessage(`API 测试失败: ${errorMessage}`, 'error');
  } finally {
    setTestButtonLoading(false);
  }
}

// ==========================================
// 缓存管理
// ==========================================

/**
 * 更新缓存统计信息
 */
async function updateCacheStats(): Promise<void> {
  try {
    const stats = await getCacheStats();
    
    elements.cacheCount.textContent = String(stats.totalEntries);
    elements.cacheSize.textContent = formatBytes(stats.totalSize);
    elements.hitRate.textContent = `${Math.round(stats.hitRate * 100)}%`;
  } catch (error) {
    console.error('[AI Translator] Failed to get cache stats:', error);
    elements.cacheCount.textContent = '-';
    elements.cacheSize.textContent = '-';
    elements.hitRate.textContent = '-';
  }
}

/**
 * 处理清理缓存
 */
async function handleClearCache(): Promise<void> {
  if (!confirm('确定要清理所有翻译缓存吗？此操作不可恢复。')) {
    return;
  }
  
  try {
    await clearAllCache();
    await updateCacheStats();
    showStatusMessage('缓存清理成功！', 'success');
  } catch (error) {
    console.error('[AI Translator] Failed to clear cache:', error);
    showStatusMessage('缓存清理失败', 'error');
  }
}

// ==========================================
// UI 辅助函数
// ==========================================

/**
 * 显示状态消息
 */
function showStatusMessage(message: string, type: 'success' | 'error' | 'warning'): void {
  elements.statusText.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
  
  // 5 秒后自动隐藏
  setTimeout(() => {
    hideStatusMessage();
  }, 5000);
}

/**
 * 隐藏状态消息
 */
function hideStatusMessage(): void {
  elements.statusMessage.classList.add('hidden');
  setTimeout(() => {
    elements.statusMessage.className = 'status-message hidden';
  }, 300);
}

/**
 * 显示输入错误
 */
function showError(input: HTMLElement, message: string): void {
  input.classList.add('error');
  
  // 创建错误提示
  let errorTip = input.parentElement?.querySelector('.error-tip') as HTMLElement;
  if (!errorTip) {
    errorTip = document.createElement('span');
    errorTip.className = 'error-tip form-hint';
    errorTip.style.color = 'var(--error)';
    
    if (input.parentElement?.classList.contains('input-with-toggle')) {
      input.parentElement.after(errorTip);
    } else {
      input.after(errorTip);
    }
  }
  errorTip.textContent = message;
}

/**
 * 移除错误状态
 */
function removeErrorState(input: HTMLElement): void {
  input.classList.remove('error');
  
  const parent = input.parentElement;
  if (parent) {
    const errorTip = parent.parentElement?.querySelector('.error-tip') || 
                     parent.querySelector('.error-tip');
    if (errorTip) {
      errorTip.remove();
    }
  }
}

/**
 * 切换 API Key 可见性
 */
function toggleApiKeyVisibility(): void {
  const isPassword = elements.apiKey.type === 'password';
  elements.apiKey.type = isPassword ? 'text' : 'password';
  
  const eyeIcon = elements.toggleApiKey.querySelector('.eye-icon') as HTMLElement;
  const eyeOffIcon = elements.toggleApiKey.querySelector('.eye-off-icon') as HTMLElement;
  
  eyeIcon.classList.toggle('hidden', !isPassword);
  eyeOffIcon.classList.toggle('hidden', isPassword);
}

/**
 * 切换高级设置折叠状态
 */
function toggleAdvancedSection(): void {
  elements.advancedHeader.classList.toggle('collapsed');
  elements.advancedContent.classList.toggle('hidden');
}

/**
 * 设置保存按钮加载状态
 */
function setSaveButtonLoading(loading: boolean): void {
  if (loading) {
    elements.saveBtn.disabled = true;
    elements.saveBtn.innerHTML = '<span class="spinner"></span> 保存中...';
  } else {
    elements.saveBtn.disabled = false;
    elements.saveBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
      </svg>
      保存设置
    `;
  }
}

/**
 * 设置测试按钮加载状态
 */
function setTestButtonLoading(loading: boolean): void {
  if (loading) {
    elements.testApiBtn.disabled = true;
    elements.testApiBtn.innerHTML = '<span class="spinner"></span> 测试中...';
  } else {
    elements.testApiBtn.disabled = false;
    elements.testApiBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      测试 API 连接
    `;
  }
}

// ==========================================
// 工具函数
// ==========================================

/**
 * 验证 URL 是否有效
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 通知其他页面配置已更改
 */
function notifyConfigChanged(): void {
  chrome.runtime.sendMessage({
    type: 'CONFIG_CHANGED',
    timestamp: Date.now()
  }).catch(() => {
    // 忽略可能的错误（如 background 未运行）
  });
}

/**
 * 处理存储变化
 */
function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
  if (changes[STORAGE_KEYS.CONFIG]) {
    // 配置被其他页面修改，重新加载
    console.log('[AI Translator] Config changed externally, reloading...');
    loadSettings();
  }
}
