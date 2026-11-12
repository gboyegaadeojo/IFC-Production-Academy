"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  memberReviewDecide,
  outsideReviewDecide,
  qualityControlDecide,
  qualityControlSendForReview,
  type ActionResult,
} from "@/lib/data/copyright";

// Decisions on video and graphics requests (ADD-COPY-04..07). The database checks every secret and
// permission; these check the shape of what was sent.

export type DecisionState = { status: "idle" } | ActionResult;

const decisionSchema = z.object({
  choice: z.enum(["approve", "decline", "review"]),
  note: z.string().trim().max(2000),
  planItem: z.string().max(100),
  question: z.string().trim().max(1000),
  reviewers: z.array(z.string().regex(/^(member|outside):[0-9a-f-]{36}$/)).max(20),
});

function read(formData: FormData) {
  return decisionSchema.safeParse({
    choice: formData.get("choice"),
    note: formData.get("note") ?? "",
    planItem: formData.get("planItem") ?? "",
    question: formData.get("question") ?? "",
    reviewers: formData.getAll("reviewers"),
  });
}

const INVALID: ActionResult = { ok: false, error: "Choose what happens next, then try again." };

/** Quality control, from its private link: approve, decline, or send for a copyright review. */
export async function qualityControlAction(
  token: string,
  requestId: string,
  _: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = read(formData);
  if (!parsed.success) {
    return INVALID;
  }
  const { choice, note, planItem, question, reviewers } = parsed.data;
  const planItemId = planItem || null;
  if (choice === "review") {
    if (question === "") {
      return { ok: false, error: "Say what the reviewer should check." };
    }
    const pick = (kind: string) =>
      reviewers.filter((r) => r.startsWith(`${kind}:`)).map((r) => r.slice(kind.length + 1));
    const result = await qualityControlSendForReview({
      token,
      requestId,
      members: pick("member"),
      outside: pick("outside"),
      question,
      planItemId,
    });
    revalidatePath(`/copyright/qc/${token}`);
    return result;
  }
  const result = await qualityControlDecide({
    token,
    requestId,
    approve: choice === "approve",
    note,
    planItemId,
  });
  revalidatePath(`/copyright/qc/${token}`);
  return result;
}

/** An outside reviewer, from the private link to the one request. */
export async function outsideReviewAction(
  token: string,
  _: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = read(formData);
  if (!parsed.success || parsed.data.choice === "review") {
    return INVALID;
  }
  return outsideReviewDecide({
    token,
    approve: parsed.data.choice === "approve",
    note: parsed.data.note,
  });
}

/** An Academy reviewer, signed in, from Copyright in the side bar. */
export async function memberReviewAction(
  requestId: string,
  _: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = read(formData);
  if (!parsed.success || parsed.data.choice === "review") {
    return INVALID;
  }
  const result = await memberReviewDecide({
    requestId,
    approve: parsed.data.choice === "approve",
    note: parsed.data.note,
  });
  revalidatePath("/copyright");
  return result;
}
