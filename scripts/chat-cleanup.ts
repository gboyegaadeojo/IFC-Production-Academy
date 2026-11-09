/**
 * Chat cleanup (ADD-MSG-05; docs/decisions/2026-11-08-team-messaging.md). Daily, from
 * chat-cleanup.yml: removes chat photos and documents older than the limit set on Admin -> Features
 * (90 days unless changed), and those of deleted messages, then message text older than its limit
 * (3 years). The message stays, saying the file is no longer available.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Actions secrets). Logs counts only, never file
 * names, chats, or words.
 */
import { supabaseKeyHeaders } from "../lib/domain/supabase-keys.ts";

const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.log("Chat cleanup: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY isn't set, so nothing ran.");
  process.exit(0);
}
const headers = { ...supabaseKeyHeaders(key), "Content-Type": "application/json" };
const BATCH = 500;

async function rpc<T>(name: string, body: object): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${name} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function removeFiles(paths: string[]): Promise<void> {
  const response = await fetch(`${url}/storage/v1/object/chat-files`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) {
    throw new Error(`Removing chat files failed with HTTP ${response.status}`);
  }
}

async function main(): Promise<void> {
  let files = 0;
  for (let round = 0; round < 40; round += 1) {
    const due = await rpc<{ id: string; full_path: string | null; thumb_path: string | null }[]>(
      "chat_files_to_delete",
      { p_limit: BATCH },
    );
    if (due.length === 0) {
      break;
    }
    const paths = due.flatMap((item) =>
      [item.full_path, item.thumb_path].filter((path): path is string => Boolean(path)),
    );
    if (paths.length > 0) {
      await removeFiles(paths);
    }
    files += await rpc<number>("mark_chat_files_deleted", { p_ids: due.map((item) => item.id) });
    if (due.length < BATCH) {
      break;
    }
  }
  let messages = 0;
  for (let round = 0; round < 40; round += 1) {
    const removed = await rpc<number>("purge_old_messages", { p_limit: 1000 });
    messages += removed;
    if (removed < 1000) {
      break;
    }
  }
  console.log(`Chat cleanup: ${files} files removed, ${messages} old messages removed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Chat cleanup failed");
  process.exit(1);
});
