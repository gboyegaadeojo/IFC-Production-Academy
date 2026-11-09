import type { Metadata } from "next";
import { Suspense } from "react";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getMessagingPeople } from "@/lib/data/messages";
import { hasCapabilityAnywhere } from "@/lib/domain/capabilities";
import { PeoplePicker } from "./people-picker";

export const metadata: Metadata = { title: "New message" };

export default function NewMessagePage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <NewMessage />
    </Suspense>
  );
}

/** Start a direct message with anyone active (G, 2026-11-08), or, for leaders, a group chat. */
async function NewMessage() {
  const [people, grants] = await Promise.all([getMessagingPeople(), getMyCapabilities()]);
  return (
    <PeoplePicker
      people={people}
      canCreateGroup={hasCapabilityAnywhere(grants, "message.group_create")}
    />
  );
}
