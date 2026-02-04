import type { CacheEntry, CacheStats, PluginConfig } from '@/types';
import { STORAGE_KEYS } from '@/types';

/**
 * 翻译结果缓存管理
 * 使用 Chrome Storage Local API 存储缓存数据
 */

const CACHE_VERSION = 1;
const CACHE_KEY_PREFIX = 'at:cache:v1:';

/**
 * 生成缓存键
 * @param text 原文
 * @param targetLang 目标语言
 * @returns 缓存键
 */
export function generateCacheKey(text: string, targetLang: string): string {
  const hash = cyrb53(text);
  return `${CACHE_KEY_PREFIX}${targetLang}:${hash}`;
}

/**
 * 快速哈希函数 (cyrb53)
 * @param str 输入字符串
 * @param seed 随机种子
 * @returns 哈希值（36进制字符串）
 */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * 获取缓存条目
 * @param key 缓存键
 * @returns Promise<CacheEntry | null>
 */
export async function getCacheEntry(key: string): Promise<CacheEntry | null> {
  try {
    const result = await chrome.storage.local.get(key);
    const entry = result[key] as CacheEntry | undefined;
    
    if (!entry) {
      return null;
    }
    
    // 验证缓存条目有有效的翻译结果
    if (!entry.translatedText || entry.translatedText.trim().length === 0) {
      console.log('[AI Translator] Cache entry has empty translation, removing');
      await removeCacheEntry(key);
      return null;
    }
    
    // 检查是否过期
    const config = await getCacheConfig();
    if (isExpired(entry.timestamp, config.maxAge)) {
      await removeCacheEntry(key);
      return null;
    }
    
    // 更新命中次数
    entry.hitCount = (entry.hitCount || 0) + 1;
    await chrome.storage.local.set({ [key]: entry });
    
    return entry;
  } catch (error) {
    console.error('[AI Translator] Failed to get cache entry:', error);
    return null;
  }
}

/**
 * 设置缓存条目
 * @param entry 缓存条目
 */
export async function setCacheEntry(entry: CacheEntry): Promise<void> {
  try {
    const config = await getCacheConfig();
    
    // 检查缓存是否已满
    const currentEntries = await getAllCacheEntries();
    if (currentEntries.length >= config.maxEntries) {
      // 清理最旧的条目
      await cleanupOldestEntries(1);
    }
    
    await chrome.storage.local.set({ [entry.key]: entry });
  } catch (error) {
    console.error('[AI Translator] Failed to set cache entry:', error);
  }
}

/**
 * 移除缓存条目
 * @param key 缓存键
 */
export async function removeCacheEntry(key: string): Promise<void> {
  try {
    await chrome.storage.local.remove(key);
  } catch (error) {
    console.error('[AI Translator] Failed to remove cache entry:', error);
  }
}

/**
 * 获取翻译结果（带缓存检查）
 * @param text 原文
 * @param targetLang 目标语言
 * @returns Promise<CacheEntry | null>
 */
export async function getCachedTranslation(
  text: string, 
  targetLang: string
): Promise<CacheEntry | null> {
  const key = generateCacheKey(text, targetLang);
  return getCacheEntry(key);
}

/**
 * 缓存翻译结果
 * @param text 原文
 * @param translatedText 译文
 * @param sourceLang 源语言
 * @param targetLang 目标语言
 * @param tokensUsed Token 使用量
 */
export async function cacheTranslation(
  text: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
  tokensUsed: number
): Promise<void> {
  // 验证翻译结果不为空
  if (!translatedText || translatedText.trim().length === 0) {
    console.warn('[AI Translator] Attempted to cache empty translation, skipping');
    return;
  }
  
  const key = generateCacheKey(text, targetLang);
  
  const entry: CacheEntry = {
    key,
    sourceText: text,
    translatedText,
    sourceLang,
    targetLang,
    timestamp: Date.now(),
    tokensUsed,
    hitCount: 0
  };
  
  await setCacheEntry(entry);
}

/**
 * 清空所有缓存
 * @param olderThan 可选，只清空指定时间之前的缓存（毫秒）
 */
export async function clearCache(olderThan?: number): Promise<void> {
  try {
    const entries = await getAllCacheEntries();
    const keysToRemove: string[] = [];
    
    for (const entry of entries) {
      if (!olderThan || entry.timestamp < Date.now() - olderThan) {
        keysToRemove.push(entry.key);
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    
    // 更新元数据
    await chrome.storage.local.set({
      [STORAGE_KEYS.CACHE_METADATA]: {
        version: CACHE_VERSION,
        lastCleanup: Date.now()
      }
    });
  } catch (error) {
    console.error('[AI Translator] Failed to clear cache:', error);
  }
}

/**
 * 获取缓存统计
 * @returns Promise<CacheStats>
 */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const entries = await getAllCacheEntries();
    
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }
    
    // 计算总大小（近似值）
    let totalSize = 0;
    let totalHits = 0;
    let oldestEntry = entries[0].timestamp;
    let newestEntry = entries[0].timestamp;
    
    for (const entry of entries) {
      totalSize += JSON.stringify(entry).length * 2; // 近似字节数
      totalHits += entry.hitCount || 0;
      
      if (entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }
    
    // 计算命中率（总命中次数 / (总命中次数 + 条目数)）
    const hitRate = totalHits / (totalHits + entries.length);
    
    return {
      totalEntries: entries.length,
      totalSize,
      hitRate,
      oldestEntry,
      newestEntry
    };
  } catch (error) {
    console.error('[AI Translator] Failed to get cache stats:', error);
    return {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      oldestEntry: 0,
      newestEntry: 0
    };
  }
}

/**
 * 获取所有缓存条目
 * @returns Promise<CacheEntry[]>
 */
async function getAllCacheEntries(): Promise<CacheEntry[]> {
  try {
    const allData = await chrome.storage.local.get(null);
    const entries: CacheEntry[] = [];
    
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        entries.push(value as CacheEntry);
      }
    }
    
    return entries;
  } catch (error) {
    console.error('[AI Translator] Failed to get all cache entries:', error);
    return [];
  }
}

/**
 * 检查缓存是否过期
 * @param timestamp 缓存时间戳
 * @param maxAge 最大存活时间（毫秒）
 * @returns boolean
 */
function isExpired(timestamp: number, maxAge: number): boolean {
  return Date.now() - timestamp > maxAge;
}

/**
 * 清理最旧的缓存条目
 * @param count 要清理的条目数
 */
async function cleanupOldestEntries(count: number): Promise<void> {
  const entries = await getAllCacheEntries();
  
  // 按时间戳排序（最旧的在前）
  entries.sort((a, b) => a.timestamp - b.timestamp);
  
  // 获取要删除的键
  const keysToRemove = entries.slice(0, count).map(e => e.key);
  
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

/**
 * 获取缓存配置
 * @returns Promise<CacheConfig>
 */
async function getCacheConfig(): Promise<{ maxAge: number; maxEntries: number; enabled: boolean }> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.CONFIG);
    const config = result[STORAGE_KEYS.CONFIG] as { cache?: { maxAge?: number; maxEntries?: number; enabled?: boolean } } | undefined;
    
    return {
      maxAge: config?.cache?.maxAge || 7 * 24 * 60 * 60 * 1000,
      maxEntries: config?.cache?.maxEntries || 1000,
      enabled: config?.cache?.enabled !== false
    };
  } catch {
    return {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      maxEntries: 1000,
      enabled: true
    };
  }
}

/**
 * 执行缓存维护（清理过期条目）
 */
export async function maintainCache(): Promise<void> {
  try {
    const config = await getCacheConfig();
    const entries = await getAllCacheEntries();
    const keysToRemove: string[] = [];
    
    for (const entry of entries) {
      if (isExpired(entry.timestamp, config.maxAge)) {
        keysToRemove.push(entry.key);
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`[AI Translator] Cleaned up ${keysToRemove.length} expired cache entries`);
    }
    
    // 更新元数据
    await chrome.storage.local.set({
      [STORAGE_KEYS.CACHE_METADATA]: {
        version: CACHE_VERSION,
        lastCleanup: Date.now()
      }
    });
  } catch (error) {
    console.error('[AI Translator] Failed to maintain cache:', error);
  }
}

/**
 * 检查缓存是否启用
 * @returns Promise<boolean>
 */
export async function isCacheEnabled(): Promise<boolean> {
  const config = await getCacheConfig();
  return config.enabled;
}

/**
 * 清理所有缓存
 */
export async function clearAllCache(): Promise<void> {
  try {
    const entries = await getAllCacheEntries();
    const keysToRemove = entries.map(e => e.key);
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    
    console.log(`[AI Translator] Cleared ${keysToRemove.length} cache entries`);
  } catch (error) {
    console.error('[AI Translator] Failed to clear cache:', error);
    throw error;
  }
}