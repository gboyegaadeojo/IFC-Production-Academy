import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import type { AdminError } from "@/lib/domain/admin";

export type AdminResult = { ok: true } | { ok: false; error: AdminError };

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type PersonSummary = { id: string; displayName: string; email: string | null };

/**
 * Names and sign-in emails for a set of people. Row-level security and profile_emails() return only
 * people the caller may already see; anyone else comes back as "Unknown person".
 */
export async function peopleById(
  supabase: Client,
  ids: Iterable<string>,
): Promise<Map<string, PersonSummary>> {
  const unique = [...new Set(ids)];
  const people = new Map<string, PersonSummary>();
  if (unique.length === 0) {
    return people;
  }

  // profile_emails() caps each call at 500 ids.
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += 500) {
    chunks.push(unique.slice(index, index + 500));
  }

  const [profiles, ...emailResults] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", unique),
    ...chunks.map((chunk) => supabase.rpc("profile_emails", { p_user_ids: chunk })),
  ]);
  if (profiles.error) {
    throw new Error("Could not load people", { cause: profiles.error.code });
  }
  const emails = new Map<string, string | null>();
  for (const result of emailResults) {
    if (result.error) {
      throw new Error("Could not load emails", { cause: result.error.code });
    }
    for (const row of result.data) {
      emails.set(row.user_id, row.email);
    }
  }

  for (const row of profiles.data) {
    people.set(row.id, {
      id: row.id,
      displayName: row.display_name,
      email: emails.get(row.id) ?? null,
    });
  }
  return people;
}

export function personFor(people: Map<string, PersonSummary>, id: string): PersonSummary {
  return people.get(id) ?? { id, displayName: "Unknown person", email: null };
}
