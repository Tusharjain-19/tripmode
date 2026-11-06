/** Storage accepted by Supabase's `auth.storage` option; `localStorage` satisfies it in the browser. */
export interface PreviewAuthStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

const memoryStore = new Map<string, string>();

/**
 * Standard browser session storage using localStorage with safe in-memory fallback.
 */
export function brokeredPreviewStorage(): PreviewAuthStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    if (window.localStorage && typeof window.localStorage.getItem === 'function') {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    }
  } catch {
    // In-memory fallback if localStorage is blocked (incognito / strict sandbox)
  }
  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
  };
}
