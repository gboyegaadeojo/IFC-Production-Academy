import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache binding yet: pages are per-user and dynamic, and R2 is not needed at $0.
// Add r2IncrementalCache here if static or ISR content appears later.
export default defineCloudflareConfig({});
