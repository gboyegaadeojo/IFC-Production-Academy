import type { Metadata } from "next";
import { Suspense } from "react";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { getMessagingPeople } from "@/lib/data/messages";
import { hasCapabilityAnywhere } from "@/lib/domain/capabilities";
import { GroupForm } from "./group-form";

export const metadata: Metadata = { title: "New group chat" };

export default function NewGroupPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <NewGroup />
    </Suspense>
  );
}

/**
 * Make a group chat (ADD-MSG-07; screen 9 of the mock). Department Leaders, the Production
 * Director and Platform Admins. The database checks message.group_create too.
 */
async function NewGroup() {
  const grants = await getMyCapabilities();
  if (!hasCapabilityAnywhere(grants, "message.group_create")) {
    return (
      <div className="flex flex-col gap-2 p-6">
        <h1 className="text-[1.375rem] font-bold">New group chat</h1>
        <p className="text-text-secondary">
          Department Leaders, the Production Director and Platform Admins can make group chats.
        </p>
      </div>
    );
  }
  return <GroupForm people={await getMessagingPeople()} />;
}
