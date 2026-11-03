/**
 * What may leave the app for Sentry (errors) and PostHog (usage): nothing that names a person or
 * opens a door. Addresses lose their query strings and any invite token, certificate reference or
 * ID, and error text loses email addresses and quoted values. See docs/runbooks/monitoring.md.
 */

/** Sentry's dataCollection option: it collects all of these unless told not to. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
};

const PRIVATE_PATHS: readonly [RegExp, string][] = [
  [/^\/invite\/[^/]+/, "/invite/[token]"],
  [/^\/verify\/[^/]+/, "/verify/[reference]"],
  [/^\/certificates\/[^/]+/, "/certificates/[reference]"],
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A page's path with nothing private in it. Admin and course IDs become "[id]". */
export function scrubPath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? "";
  for (const [pattern, replacement] of PRIVATE_PATHS) {
    if (pattern.test(bare)) {
      return bare.replace(pattern, replacement).replace(UUID, "[id]");
    }
  }
  return bare.replace(UUID, "[id]");
}

/** A full address, scrubbed. Anything that doesn't parse is dropped rather than sent as it is. */
export function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${scrubPath(parsed.pathname)}`;
  } catch {
    return url.startsWith("/") ? scrubPath(url) : "";
  }
}

/** Error text without email addresses, quoted values (names, in database errors) or IDs. */
export function scrubText(text: string): string {
  return text
    .replace(/[^\s"'<>(),;:]+@[^\s"'<>(),;:]+\.[^\s"'<>(),;:]+/g, "[email]")
    .replace(/"[^"]*"|'[^']*'/g, '"…"')
    .replace(UUID, "[id]")
    .replace(/https?:\/\/[^\s"'<>]+/g, (url) => scrubUrl(url) || "[address]");
}

type ScrubbableEvent = {
  message?: string;
  user?: unknown;
  extra?: unknown;
  breadcrumbs?: unknown;
  server_name?: string;
  request?: {
    url?: string;
    cookies?: unknown;
    headers?: unknown;
    query_string?: unknown;
    data?: unknown;
  };
  exception?: { values?: { value?: string }[] };
};

/** Sentry's beforeSend: keeps what went wrong and where in the code, and drops who and what. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  delete event.server_name;
  if (event.message) {
    event.message = scrubText(event.message);
  }
  if (event.request) {
    event.request = event.request.url ? { url: scrubUrl(event.request.url) } : {};
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrubText(exception.value);
    }
  }
  return event;
}

const POSTHOG_URL_PROPERTIES = [
  "$current_url",
  "$referrer",
  "$initial_current_url",
  "$initial_referrer",
  "$session_entry_url",
  "$session_entry_referrer",
] as const;
const POSTHOG_PATH_PROPERTIES = [
  "$pathname",
  "$initial_pathname",
  "$session_entry_pathname",
] as const;

/** PostHog's before_send: the same rule for every address on a usage event. */
export function scrubUsageProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const scrubbed = { ...properties };
  for (const key of POSTHOG_URL_PROPERTIES) {
    if (typeof scrubbed[key] === "string") {
      scrubbed[key] = scrubUrl(scrubbed[key]);
    }
  }
  for (const key of POSTHOG_PATH_PROPERTIES) {
    if (typeof scrubbed[key] === "string") {
      scrubbed[key] = scrubPath(scrubbed[key]);
    }
  }
  return scrubbed;
}
