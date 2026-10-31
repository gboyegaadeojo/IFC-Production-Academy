/**
 * Request headers for calling the Supabase API with a server key.
 *
 * Legacy keys (`service_role`, `anon`) are JWTs and go in both `apikey` and `Authorization`.
 * The newer keys (`sb_secret_…`, `sb_publishable_…`) are not JWTs: Supabase rejects them in
 * `Authorization` with HTTP 401, so they go in `apikey` only.
 */
export function supabaseKeyHeaders(key: string): Record<string, string> {
  return isJwt(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

function isJwt(key: string): boolean {
  return key.split(".").length === 3 && key.startsWith("eyJ");
}
