"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/ui/action-form";
import { getAdminAccess } from "@/lib/data/admin/access";
import { kickApprovalEmails } from "@/lib/data/copyright";
import {
  addCopyrightContact,
  removeCopyrightContact,
  saveCopyrightSettings,
  saveCopyrightTemplate,
  sendCopyrightTestEmail,
  type AdminResult,
} from "@/lib/data/copyright-admin";
import { DEADLINE_COUNTING, LATE_POLICIES, TEMPLATE_KEYS } from "@/lib/domain/copyright";

// Admin → Copyright (ADD-COPY-09). The database checks copyright.manage again and audits changes.

const DENIED: FormState = { status: "error", message: "This isn't open to you." };

async function allowed(): Promise<boolean> {
  return (await getAdminAccess("copyright")).allowed;
}

function toState(result: AdminResult, done: string): FormState {
  if (!result.ok) {
    return { status: "error", message: result.error };
  }
  refresh();
  return { status: "done", message: done };
}

const settingsSchema = z.object({
  deadlineDays: z.coerce.number().int().min(0).max(60),
  deadlineCounting: z.enum(DEADLINE_COUNTING),
  latePolicy: z.enum(LATE_POLICIES),
  introText: z.string().max(1000),
  mediaInboxEmail: z.union([z.email(), z.literal("")]),
  mediaInboxOn: z.boolean(),
  emailOnDuty: z.boolean(),
  checks: z.string().max(2200),
});

export async function saveSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = settingsSchema.safeParse({
    deadlineDays: formData.get("deadlineDays"),
    deadlineCounting: formData.get("deadlineCounting"),
    latePolicy: formData.get("latePolicy"),
    introText: formData.get("introText") ?? "",
    mediaInboxEmail: String(formData.get("mediaInboxEmail") ?? "").trim(),
    mediaInboxOn: formData.get("mediaInboxOn") === "on",
    emailOnDuty: formData.get("emailOnDuty") === "on",
    checks: formData.get("checks") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the settings: the deadline is 0 to 60 days, and the email must be valid.",
    };
  }
  if (!(await allowed())) {
    return DENIED;
  }
  const checks = parsed.data.checks
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 10);
  return toState(await saveCopyrightSettings({ ...parsed.data, checks }), "Saved.");
}

const contactSchema = z.object({
  kind: z.enum(["quality_control", "reviewer"]),
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
});

export async function addContactAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Enter a name and a valid email address." };
  }
  if (!(await allowed())) {
    return DENIED;
  }
  return toState(await addCopyrightContact(parsed.data), `${parsed.data.name} is on the list.`);
}

export async function removeContactAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ id: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "That didn't work. Refresh the page and try again." };
  }
  if (!(await allowed())) {
    return DENIED;
  }
  return toState(
    await removeCopyrightContact(parsed.data.id),
    "Removed. Their links have stopped.",
  );
}

const templateSchema = z.object({
  key: z.enum(TEMPLATE_KEYS),
  intent: z.enum(["save", "reset", "test"]),
  subject: z.string().max(200),
  body: z.string().max(4000),
});

/** Saves an email, puts back the original, or sends the admin a test of the saved one. */
export async function templateAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "An email needs a subject and a message." };
  }
  if (!(await allowed())) {
    return DENIED;
  }
  const { key, intent, subject, body } = parsed.data;
  if (intent === "test") {
    after(kickApprovalEmails);
    return toState(
      await sendCopyrightTestEmail(key),
      "A test of the saved version is on its way to your email, within a couple of minutes.",
    );
  }
  if (intent === "reset") {
    return toState(await saveCopyrightTemplate(key, null), "The original is back.");
  }
  if (subject.trim() === "" || body.trim() === "") {
    return { status: "error", message: "An email needs a subject and a message." };
  }
  return toState(await saveCopyrightTemplate(key, { subject, body }), "Saved.");
}
