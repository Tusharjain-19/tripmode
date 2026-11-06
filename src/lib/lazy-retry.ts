import { lazy, type ComponentType } from "react";

/**
 * React.lazy that survives a stale module URL (e.g. after the app was updated while open):
 * retries once, then reloads the page a single time instead of showing a blank screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(async () => {
    const flag = `lazy-reloaded:${key}`;
    try {
      const m = await load();
      sessionStorage.removeItem(flag);
      return m;
    } catch {
      await new Promise((r) => setTimeout(r, 800));
      try {
        return await load();
      } catch (err) {
        if (!sessionStorage.getItem(flag)) {
          sessionStorage.setItem(flag, "1");
          window.location.reload();
          return new Promise<never>(() => undefined);
        }
        throw err;
      }
    }
  });
}
