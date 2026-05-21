const API_URL = (import.meta as any).env?.VITE_API_URL || '';

// In-memory cache for API GET requests
const apiCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 30000; // 30 seconds cache TTL

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const isGet = !init || !init.method || init.method.toUpperCase() === 'GET';
  const originalUrl = input;
  let targetUrl = input;

  if (API_URL && input.startsWith('/api')) {
    targetUrl = `${API_URL}${input}`;
  }

  // Try returning from cache if GET
  if (isGet) {
    const cached = apiCache[originalUrl];
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      // Return a custom clone response of the cached data
      return new Response(JSON.stringify(cached.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-from-cache': 'true' }
      });
    }

    // Try localStorage fallback cache for quick layout paint
    const localCached = localStorage.getItem(`api_cache_${originalUrl}`);
    if (localCached) {
      try {
        const parsed = JSON.parse(localCached);
        // Serve immediately if network is sluggish
        return new Response(JSON.stringify(parsed), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'x-from-cache-local': 'true' }
        });
      } catch (e) {}
    }
  }

  const response = await fetch(targetUrl, init);

  // Cache successful GET requests for JSON content
  if (isGet && response.ok) {
    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const clone = response.clone();
        const json = await clone.json();
        apiCache[originalUrl] = {
          data: json,
          timestamp: Date.now()
        };
        
        // Persist key layout lists for instant cold starts
        if (
          originalUrl === '/api/me' || 
          originalUrl === '/api/chats' || 
          originalUrl === '/api/statuses' || 
          originalUrl === '/api/users'
        ) {
          localStorage.setItem(`api_cache_${originalUrl}`, JSON.stringify(json));
        }
      } catch (e) {
        // Failed to parse or clone response
      }
    }
  }

  return response;
}

export function clearApiCache() {
  for (const key in apiCache) {
    delete apiCache[key];
  }
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('api_cache_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
