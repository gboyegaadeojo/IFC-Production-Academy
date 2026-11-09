import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/data/database.types";

/**
 * Live updates for the open chat (ADD-MSG-03): Supabase Realtime, as the signed-in person, so
 * row-level security decides what arrives. Only the chat on screen is subscribed, and the caller
 * unsubscribes when it leaves or the tab is hidden, to stay well inside the free plan's 200
 * connections. Events only say something changed; the page fetches the messages itself.
 */
type Client = ReturnType<typeof createBrowserClient<Database>>;
let client: Client | null = null;

function browserClient(url: string, key: string): Client {
  client ??= createBrowserClient<Database>(url, key);
  return client;
}

export type LiveStatus = "connecting" | "live" | "offline";

export function subscribeToConversation({
  url,
  publishableKey,
  conversationId,
  onChange,
  onStatus,
}: {
  url: string;
  publishableKey: string;
  conversationId: string;
  onChange: () => void;
  onStatus: (status: LiveStatus) => void;
}): () => void {
  const supabase = browserClient(url, publishableKey);
  onStatus("connecting");
  const channel = supabase
    .channel(`chat:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus("live");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onStatus("offline");
      }
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
