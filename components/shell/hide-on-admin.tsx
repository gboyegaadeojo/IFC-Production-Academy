"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The Academy's top header, except in Admin, whose sidebar has the brand and account. */
export function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/") ? null : children;
}
