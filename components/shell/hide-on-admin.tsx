"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The Academy's side bar and phone bar, except in Admin, whose own sidebar has the brand and account. */
export function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/") ? null : children;
}
