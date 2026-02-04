import type { PluginConfig } from '@/types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '@/types';

/**
 * Chrome Storage API 封装
 * 提供类型安全的存储操作
 */

/**
 * 从 chrome.storage.sync 获取配置
 * @returns Promise<PluginConfig>
 */
export async function getConfig(): Promise<PluginConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.CONFIG);
    const storedConfig = result[STORAGE_KEYS.CONFIG];
    
    if (!storedConfig) {
      return DEFAULT_CONFIG;
    }
    
    // 合并默认配置和存储的配置（处理新增字段）
    return mergeConfig(DEFAULT_CONFIG, storedConfig);
  } catch (error) {
    console.error('[AI Translator] Failed to get config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存配置到 chrome.storage.sync
 * @param config 部分配置对象
 */
export async function setConfig(config: Partial<PluginConfig>): Promise<void> {
  try {
    const currentConfig = await getConfig();
    const newConfig = { ...currentConfig, ...config };
    
    await chrome.storage.sync.set({
      [STORAGE_KEYS.CONFIG]: newConfig
    });
  } catch (error) {
    console.error('[AI Translator] Failed to save config:', error);
    throw error;
  }
}

/**
 * 从 chrome.storage.local 获取 API 密钥
 * @returns Promise<string>
 */
export async function getApiKey(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
    return result[STORAGE_KEYS.API_KEY] || '';
  } catch (error) {
    console.error('[AI Translator] Failed to get API key:', error);
    return '';
  }
}

/**
 * 保存 API 密钥到 chrome.storage.local
 * @param apiKey API 密钥
 */
export async function setApiKey(apiKey: string): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.API_KEY]: apiKey
    });
  } catch (error) {
    console.error('[AI Translator] Failed to save API key:', error);
    throw error;
  }
}

/**
 * 获取完整的 API 配置（包括密钥）
 * @returns Promise<PluginConfig>
 */
export async function getFullConfig(): Promise<PluginConfig> {
  const [config, apiKey] = await Promise.all([
    getConfig(),
    getApiKey()
  ]);
  
  return {
    ...config,
    api: {
      ...config.api,
      key: apiKey
    }
  };
}

/**
 * 保存完整的配置（包括 API 密钥）
 * @param config 完整配置
 */
export async function setFullConfig(config: PluginConfig): Promise<void> {
  const { api, ...restConfig } = config;
  
  await Promise.all([
    setConfig({
      ...restConfig,
      api: {
        endpoint: api.endpoint,
        model: api.model,
        key: '' // 不包含密钥
      }
    }),
    setApiKey(api.key)
  ]);
}

/**
 * 监听配置变更
 * @param callback 配置变更回调
 * @returns 取消监听的函数
 */
export function onConfigChanged(
  callback: (changes: Record<string, { oldValue: unknown; newValue: unknown }>) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName === 'sync' && changes[STORAGE_KEYS.CONFIG]) {
      const configChanges: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      
      // 简化的变更通知，只通知配置发生变化
      configChanges[STORAGE_KEYS.CONFIG] = {
        oldValue: changes[STORAGE_KEYS.CONFIG].oldValue,
        newValue: changes[STORAGE_KEYS.CONFIG].newValue
      };
      
      callback(configChanges);
    }
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  // 返回取消监听的函数
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

/**
 * 清空所有存储数据
 */
export async function clearAllStorage(): Promise<void> {
  await Promise.all([
    chrome.storage.sync.clear(),
    chrome.storage.local.clear()
  ]);
}

/**
 * 重置配置为默认值
 */
export async function resetConfig(): Promise<void> {
  await setFullConfig(DEFAULT_CONFIG);
}

/**
 * 合并配置（深度合并）
 * @param defaultConfig 默认配置
 * @param storedConfig 存储的配置
 * @returns 合并后的配置
 */
function mergeConfig(
  defaultConfig: PluginConfig,
  storedConfig: Partial<PluginConfig>
): PluginConfig {
  return {
    api: {
      ...defaultConfig.api,
      ...storedConfig.api
    },
    translation: {
      ...defaultConfig.translation,
      ...storedConfig.translation
    },
    ui: {
      ...defaultConfig.ui,
      ...storedConfig.ui
    },
    cache: {
      ...defaultConfig.cache,
      ...storedConfig.cache
    },
    advanced: {
      ...defaultConfig.advanced,
      ...storedConfig.advanced
    }
  };
}

/**
 * 获取存储空间使用情况
 * @returns Promise<{sync: number, local: number}>
 */
export async function getStorageUsage(): Promise<{ sync: number; local: number }> {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.getBytesInUse(),
    chrome.storage.local.getBytesInUse()
  ]);
  
  return { sync, local };
}