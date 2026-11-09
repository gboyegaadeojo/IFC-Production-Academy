import type { Metadata } from "next";
import { MessageIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Messages" };

/** From 768px, the space beside the list before a chat is open. Phones show only the list. */
export default function MessagesPage() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center md:flex">
      <span className="flex size-16 items-center justify-center rounded-[1.25rem] bg-accent-soft text-accent-light">
        <MessageIcon className="size-7" />
      </span>
      <h2 className="mt-2 text-subheading font-semibold">Choose a chat</h2>
      <p className="max-w-xs text-text-secondary">
        Pick a chat on the left, or start a direct message with the pencil.
      </p>
    </div>
  );
}
