"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Pages reached from the phone tab bar fade in and settle as you move between them (phone bar A,
 * G 2026-11-09; only on phones, see .page-enter). Pages with a bar of their own fixed to the
 * bottom (a lesson, a chat, a department's Continue bar) appear at once, so that bar never moves.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={`flex min-w-0 flex-1 flex-col ${animates(pathname) ? "page-enter" : ""}`}>
      {children}
    </div>
  );
}

const STILL = [/^\/courses\/[^/]+\/lessons\//, /^\/messages\/./, /^\/departments\//, /^\/admin/];

function animates(pathname: string): boolean {
  return !STILL.some((pattern) => pattern.test(pathname));
}
