import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/data/auth";

/**
 * Help is open to anyone (ADD-HELP-01). Signed in, it sits in the app shell like any other page.
 * Signed out, it gets a plain bar with the brand and Sign in instead: the app's navigation would
 * only lead back to sign-in (G, 2026-11-06).
 */
export default async function HelpLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (user?.status === "active") {
    return <AppShell>{children}</AppShell>;
  }
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)] print:hidden">
        <div className="page-container flex min-h-14 items-center justify-between gap-3">
          <Link href="/sign-in" className="flex min-h-touch items-center rounded-button">
            <Wordmark />
          </Link>
          <Link href="/sign-in" className={buttonClasses("secondary", "rounded-pill", "sm")}>
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
