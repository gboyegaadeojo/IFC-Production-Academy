import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";
import { signOutAction } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { adminSections } from "@/lib/domain/admin";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/home" className="rounded-button py-2">
            <Wordmark />
          </Link>
          <Suspense fallback={null}>
            <AccountMenu />
          </Suspense>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        {children}
      </main>
    </>
  );
}

async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  // Only areas a person may use are shown (SPEC §8); each admin page checks again on the server.
  const showAdmin = user.status === "active" && adminSections(await getMyCapabilities()).length > 0;
  return (
    <div className="flex items-center gap-3">
      {showAdmin ? (
        <Link
          href="/admin"
          className="flex min-h-11 items-center rounded-button px-3 text-small font-medium text-accent-light underline-offset-4 hover:underline"
        >
          Admin
        </Link>
      ) : null}
      <span className="hidden text-small text-text-secondary sm:inline">{user.displayName}</span>
      <form action={signOutAction}>
        <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 text-small")}>
          Sign out
        </button>
      </form>
    </div>
  );
}
