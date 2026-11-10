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

/**
 * How server errors reach Sentry without the app bundling Sentry a second time: the Worker
 * (workers/entry.ts), which already has it, puts a reporter on globalThis under this name, and
 * instrumentation.ts calls it. Each extra copy of Sentry in the app's own code was about 1.6 MB.
 */
export const SERVER_ERROR_REPORTER = "__academyReportServerError";
export type ServerErrorReporter = (error: unknown, tags: Record<string, string>) => void;

/** The page's error screen asks the browser's Sentry to report through this event. */
export const CLIENT_ERROR_EVENT = "academy:report-error";

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

/**
 * Scrubs every address however deep it sits, because both libraries repeat the page's address in
 * fields of their own (PostHog's web vitals, Sentry's transaction). Other values stay as they are.
 */
export function scrubAddresses<T>(value: T): T {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) {
      return scrubUrl(value) as T;
    }
    return (value.startsWith("/") ? scrubPath(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrubAddresses(item)) as T;
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubAddresses(item)]),
    ) as T;
  }
  return value;
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
  return scrubAddresses(event);
}

/**
 * PostHog's before_send: page views only, whatever else the library or its remote settings try to
 * send. A page's title can name a person or course, so it goes too.
 */
export function scrubUsageEvent<T extends { event: string; properties: object }>(
  event: T,
): T | null {
  if (event.event !== "$pageview") {
    return null;
  }
  const scrubbed = scrubAddresses(event);
  delete (scrubbed.properties as { title?: unknown }).title;
  return scrubbed;
}
