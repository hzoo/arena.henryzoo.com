// Arena Search Cache - Accumulated results with deduplication
// Uses localStorage with stale-while-revalidate pattern

const CACHE_KEY_PREFIX = 'arena_search_v2_';

// Block stored in cache (minimal data needed for display)
export interface CachedBlock {
  id: string;                     // extracted from href
  typename: string;
  href: string;
  title?: string;
  sourceUrl?: string;
  imageUrl?: string;
  connections: any[];
  // Keep full result for compatibility
  raw: any;
}

// Cache entry for a search URL
export interface SearchCache {
  url: string;                    // normalized search URL
  totalFromAPI: number;           // API's reported total
  lastPage: number;               // highest page fetched
  perPage: number;
  blocks: Map<string, CachedBlock>;  // blockId -> block (deduplicated)
  timestamp: number;              // for "cached X ago" display
}

// JSON-serializable format for localStorage
interface StoredSearchCache {
  url: string;
  totalFromAPI: number;
  lastPage: number;
  perPage: number;
  blocks: [string, CachedBlock][];  // Map serialized as entries
  timestamp: number;
}

// Normalize search URL for consistent cache keys
export function normalizeSearchUrl(url: string): string {
  return url.toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
}

// Extract block ID from href (e.g., /blocks/123 -> "123")
export function extractBlockId(href: string): string {
  if (!href) return '';
  const match = href.match(/\/blocks\/(\d+)/);
  return match ? match[1] : '';
}

// Get cache for a search URL
export function getSearchCache(url: string): SearchCache | null {
  const key = CACHE_KEY_PREFIX + normalizeSearchUrl(url);

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsed: StoredSearchCache = JSON.parse(stored);

    return {
      ...parsed,
      blocks: new Map(parsed.blocks)
    };
  } catch (e) {
    console.warn('Error reading search cache:', e);
    return null;
  }
}

// Add a page of results to cache (accumulates and dedupes)
export function addPageToCache(
  url: string,
  page: number,
  perPage: number,
  apiResponse: { total: number; results: any[] }
): SearchCache {
  const normalizedUrl = normalizeSearchUrl(url);
  const key = CACHE_KEY_PREFIX + normalizedUrl;

  // Get existing cache or create new
  let cache = getSearchCache(url);

  if (!cache) {
    cache = {
      url: normalizedUrl,
      totalFromAPI: apiResponse.total,
      lastPage: 0,
      perPage: perPage,
      blocks: new Map(),
      timestamp: Date.now()
    };
  }

  // Update total (API may return updated count)
  cache.totalFromAPI = apiResponse.total;

  // Process and dedupe new results
  for (const result of apiResponse.results) {
    // For channels, use channel ID/slug as key
    let blockId: string;
    if (result.__typename === 'Channel') {
      blockId = `channel:${result.id || result.slug}`;
    } else {
      blockId = extractBlockId(result.href);
      if (!blockId) {
        // Fallback for blocks without proper href
        blockId = `${result.__typename}:${result.id || Math.random()}`;
      }
    }

    // Skip if already cached (dedup)
    if (cache.blocks.has(blockId)) continue;

    // Store block
    cache.blocks.set(blockId, {
      id: blockId,
      typename: result.__typename,
      href: result.href || '',
      title: result.title,
      sourceUrl: result.source_url || result.source?.url,
      imageUrl: result.image_url,
      connections: result.connections || [],
      raw: result  // keep full result for compatibility
    });
  }

  // Update metadata
  cache.lastPage = Math.max(cache.lastPage, page);
  cache.timestamp = Date.now();

  // Serialize and store
  const toStore: StoredSearchCache = {
    url: cache.url,
    totalFromAPI: cache.totalFromAPI,
    lastPage: cache.lastPage,
    perPage: cache.perPage,
    blocks: Array.from(cache.blocks.entries()),
    timestamp: cache.timestamp
  };

  try {
    localStorage.setItem(key, JSON.stringify(toStore));
  } catch (e) {
    console.warn('Error saving to cache, pruning old caches:', e);
    pruneOldestCaches();
    try {
      localStorage.setItem(key, JSON.stringify(toStore));
    } catch (e2) {
      console.error('Still unable to save cache after pruning:', e2);
    }
  }

  return cache;
}

// Get all cached blocks as array (for display)
export function getCachedBlocks(url: string): any[] {
  const cache = getSearchCache(url);
  if (!cache) return [];

  // Return raw results for compatibility with existing rendering
  return Array.from(cache.blocks.values()).map(block => block.raw);
}

// Check if more pages are available
export function hasMorePages(cache: SearchCache): boolean {
  const loadedBlocks = cache.blocks.size;
  return loadedBlocks < cache.totalFromAPI;
}

// Get human-readable cache age
export function getCacheAge(cache: SearchCache): string {
  const now = Date.now();
  const diffMs = now - cache.timestamp;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// Clear cache for a specific URL
export function clearSearchCache(url: string): void {
  const key = CACHE_KEY_PREFIX + normalizeSearchUrl(url);
  localStorage.removeItem(key);
}

// Prune oldest caches when storage is full
function pruneOldestCaches(): void {
  const cacheKeys: { key: string; timestamp: number }[] = [];

  // Find all arena search cache keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_KEY_PREFIX)) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          cacheKeys.push({ key, timestamp: parsed.timestamp || 0 });
        }
      } catch (e) {
        // Invalid cache entry, remove it
        if (key) localStorage.removeItem(key);
      }
    }
  }

  // Sort by timestamp (oldest first)
  cacheKeys.sort((a, b) => a.timestamp - b.timestamp);

  // Remove oldest half
  const toRemove = Math.ceil(cacheKeys.length / 2);
  for (let i = 0; i < toRemove; i++) {
    localStorage.removeItem(cacheKeys[i].key);
  }

  console.log(`Pruned ${toRemove} old caches`);
}

// Migrate from old cache format (arena_search_cache_*)
export function migrateOldCache(): void {
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('arena_search_cache_') && !key.startsWith(CACHE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    console.log(`Migrating ${keysToRemove.length} old cache entries`);
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

// Run migration on module load
migrateOldCache();
