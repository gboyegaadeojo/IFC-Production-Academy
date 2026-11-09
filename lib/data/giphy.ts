import "server-only";
import { parseGiphy, type GifResult } from "@/lib/domain/chat-files";

/**
 * GIF search for chats (ADD-MSG-08), through the server so the GIPHY key stays a Cloudflare
 * secret. Always rated G. Results are kept for five minutes in this Worker, so a team searching
 * the same words doesn't use up the free plan's searches.
 */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; results: GifResult[] }>();

export type GifSearch = { configured: false } | { configured: true; results: GifResult[] };

export async function searchGifs(query: string): Promise<GifSearch> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    return { configured: false };
  }
  const words = query.trim().toLowerCase().slice(0, 50);
  const hit = cache.get(words);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { configured: true, results: hit.results };
  }
  const endpoint = words
    ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(words)}&`
    : "https://api.giphy.com/v1/gifs/trending?";
  try {
    const response = await fetch(
      `${endpoint}api_key=${encodeURIComponent(key)}&limit=18&rating=g&lang=en&bundle=messaging_non_clips`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) {
      return { configured: true, results: [] };
    }
    const results = parseGiphy(await response.json());
    cache.set(words, { at: Date.now(), results });
    if (cache.size > 200) {
      cache.delete(cache.keys().next().value ?? "");
    }
    return { configured: true, results };
  } catch {
    return { configured: true, results: [] };
  }
}
