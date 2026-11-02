import { z } from "zod";
import { dispatchNotification } from "@/lib/data/push";

const Body = z.object({ id: z.uuid(), token: z.string().min(20).max(200) });

/**
 * The database calls this through pg_net when a notification is written
 * (supabase/migrations/20261210120000_push_alerts.sql). The token is checked by the database when
 * the notification is claimed, and a notification can only be claimed once, so a repeat or a
 * forged call sends nothing. Responds with counts only.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }
  const result = await dispatchNotification(parsed.data.id, parsed.data.token);
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
