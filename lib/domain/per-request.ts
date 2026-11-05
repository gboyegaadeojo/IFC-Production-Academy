/**
 * Reads things by key, at most once each while a page is built, so sections of a page that want the
 * same rows share one call. `store` must be fresh for each request (React's cache() in lib/data).
 */
export function perRequestBatch<V>(
  store: () => Map<string, Promise<V | undefined>>,
  load: (keys: string[]) => Promise<ReadonlyMap<string, V>>,
): (keys: readonly string[]) => Promise<Map<string, V>> {
  return async (keys) => {
    const held = store();
    const unique = [...new Set(keys)];
    const missing = unique.filter((key) => !held.has(key));
    if (missing.length > 0) {
      const batch = load(missing);
      for (const key of missing) {
        held.set(
          key,
          batch.then((found) => found.get(key)),
        );
      }
    }
    const values = await Promise.all(unique.map((key) => held.get(key)));
    const out = new Map<string, V>();
    unique.forEach((key, index) => {
      const value = values[index];
      if (value !== undefined) {
        out.set(key, value);
      }
    });
    return out;
  };
}
