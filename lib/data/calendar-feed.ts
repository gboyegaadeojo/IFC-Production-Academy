import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";

// The calendar link (plan "Academy scheduling", PR 10). Only a hash of the link is stored; the
// link itself is shown once, when it's made.

export async function getMyCalendarFeedSince(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_calendar_feed_since");
  if (error) {
    throw new Error("Could not load your calendar link", { cause: error.code });
  }
  return data;
}

/** A new link, which stops any old one. Returns its token, or null if it couldn't be made. */
export async function resetMyCalendarFeed(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reset_my_calendar_feed");
  return error ? null : data;
}

export async function stopMyCalendarFeed(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("stop_my_calendar_feed");
  return !error;
}

export type FeedEntry = {
  assignmentId: string;
  roleName: string;
  departmentName: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  confirmed: boolean;
};

/** What a calendar app reads with a link. Empty for a link that isn't (or is no longer) valid. */
export async function readCalendarFeed(token: string): Promise<FeedEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error) {
    throw new Error("Could not read the calendar", { cause: error.code });
  }
  return data.map((row) => ({
    assignmentId: row.assignment_id,
    roleName: row.role_name,
    departmentName: row.department_name,
    title: row.title,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    confirmed: row.confirmed,
  }));
}
