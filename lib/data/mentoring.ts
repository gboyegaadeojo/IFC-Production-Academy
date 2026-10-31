import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { hasCapability, type CapabilityGrant } from "@/lib/domain/capabilities";
import {
  toMentoringError,
  type GoalStatus,
  type MentoringError,
  type NoteVisibility,
} from "@/lib/domain/mentoring";

// Mentoring (SRS-MENTOR-001..005). Row-level security decides what each person reads: private
// notes come back only to their author (SRS-RBAC-006).

export type MentoringResult = { ok: true } | { ok: false; error: MentoringError };

function fail(error: { code?: string; message?: string } | null): {
  ok: false;
  error: MentoringError;
} {
  return { ok: false, error: toMentoringError(error) };
}

export type Pairing = {
  id: string;
  departmentId: string;
  departmentName: string;
  mentor: { id: string; name: string };
  mentee: { id: string; name: string };
  myPart: "mentor" | "mentee";
  startedAt: string;
  endedAt: string | null;
};

export async function getMyPairings(): Promise<Pairing[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_mentoring");
  if (error) {
    throw new Error("Could not load mentoring", { cause: error.code });
  }
  return data.map((row) => ({
    id: row.relationship_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    mentor: { id: row.mentor_id, name: row.mentor_name },
    mentee: { id: row.mentee_id, name: row.mentee_name },
    myPart: row.my_part === "mentor" ? "mentor" : "mentee",
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }));
}

export type Goal = {
  id: string;
  title: string;
  dueOn: string | null;
  status: GoalStatus;
  completedAt: string | null;
  createdBy: string;
};

export type Note = {
  id: string;
  authorId: string;
  visibility: NoteVisibility;
  body: string;
  createdAt: string;
};

export async function getPairingDetail(
  relationshipId: string,
): Promise<{ goals: Goal[]; notes: Note[] }> {
  const supabase = await createSupabaseServerClient();
  const [goals, notes] = await Promise.all([
    supabase
      .from("mentoring_goals")
      .select("id, title, due_on, status, completed_at, created_by, created_at")
      .eq("relationship_id", relationshipId)
      .order("created_at"),
    supabase
      .from("mentoring_notes")
      .select("id, author_id, visibility, body, created_at")
      .eq("relationship_id", relationshipId)
      .order("created_at", { ascending: false }),
  ]);
  if (goals.error || notes.error) {
    throw new Error("Could not load mentoring", { cause: (goals.error ?? notes.error)?.code });
  }
  return {
    goals: goals.data.map((g) => ({
      id: g.id,
      title: g.title,
      dueOn: g.due_on,
      status: g.status,
      completedAt: g.completed_at,
      createdBy: g.created_by,
    })),
    notes: notes.data.map((n) => ({
      id: n.id,
      authorId: n.author_id,
      visibility: n.visibility,
      body: n.body,
      createdAt: n.created_at,
    })),
  };
}

export async function addGoal(
  relationshipId: string,
  goal: { title: string; dueOn: string | null },
): Promise<MentoringResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("mentoring_goals")
    .insert({ relationship_id: relationshipId, title: goal.title, due_on: goal.dueOn });
  return error ? fail(error) : { ok: true };
}

export async function setGoalStatus(goalId: string, status: GoalStatus): Promise<MentoringResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("mentoring_goals")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", goalId)
    .select("id");
  if (error) {
    return fail(error);
  }
  return data.length > 0 ? { ok: true } : fail({ code: "42501" });
}

export async function addNote(
  relationshipId: string,
  note: { body: string; visibility: NoteVisibility },
): Promise<MentoringResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("mentoring_notes")
    .insert({ relationship_id: relationshipId, body: note.body, visibility: note.visibility });
  return error ? fail(error) : { ok: true };
}

// ---------------------------------------------------------------------------
// Leaders who pair mentors
// ---------------------------------------------------------------------------

export type MentoringDepartment = {
  id: string;
  name: string;
  people: { id: string; name: string; canMentor: boolean; isMember: boolean }[];
  pairings: {
    id: string;
    mentorName: string;
    menteeName: string;
    startedAt: string;
    endedAt: string | null;
  }[];
};

export async function getMentoringAdmin(
  grants: readonly CapabilityGrant[],
): Promise<MentoringDepartment[]> {
  const supabase = await createSupabaseServerClient();
  const departments = await supabase
    .from("departments")
    .select("id, name, sort_order")
    .order("sort_order");
  if (departments.error) {
    throw new Error("Could not load departments", { cause: departments.error.code });
  }
  const mine = departments.data.filter((d) => hasCapability(grants, "mentoring.assign", d.id));
  return Promise.all(
    mine.map(async (department) => {
      const [people, pairings] = await Promise.all([
        supabase.rpc("mentoring_people", { p_department_id: department.id }),
        supabase.rpc("department_mentoring", { p_department_id: department.id }),
      ]);
      if (people.error || pairings.error) {
        throw new Error("Could not load mentoring", {
          cause: (people.error ?? pairings.error)?.code,
        });
      }
      return {
        id: department.id,
        name: department.name,
        people: people.data.map((p) => ({
          id: p.user_id,
          name: p.display_name,
          canMentor: p.can_mentor,
          isMember: p.is_member,
        })),
        pairings: pairings.data.map((r) => ({
          id: r.relationship_id,
          mentorName: r.mentor_name,
          menteeName: r.mentee_name,
          startedAt: r.started_at,
          endedAt: r.ended_at,
        })),
      };
    }),
  );
}

export async function assignMentor(
  departmentId: string,
  mentorId: string,
  menteeId: string,
): Promise<MentoringResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_mentor", {
    p_department_id: departmentId,
    p_mentor_id: mentorId,
    p_mentee_id: menteeId,
  });
  return error ? fail(error) : { ok: true };
}

export async function endMentoring(
  relationshipId: string,
  reason: string,
): Promise<MentoringResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("end_mentoring", {
    p_relationship_id: relationshipId,
    p_reason: reason,
  });
  return error ? fail(error) : { ok: true };
}
