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
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/home" className="rounded-button py-2">
            <Wordmark />
          </Link>
          <Suspense fallback={null}>
            <AccountMenu />
          </Suspense>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
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
          className="flex min-h-control items-center rounded-button px-2 text-small text-text-secondary underline-offset-4 hover:text-text hover:underline"
        >
          Admin
        </Link>
      ) : null}
      <Link
        href="/profile"
        aria-label={`Your profile: ${user.displayName}`}
        className="flex min-h-control max-w-40 items-center truncate rounded-button px-2 text-small text-text-secondary underline-offset-4 hover:text-text hover:underline"
      >
        <span className="truncate">{user.displayName}</span>
      </Link>
      <form action={signOutAction}>
        <button type="submit" className={buttonClasses("secondary", "px-3 text-small")}>
          Sign out
        </button>
      </form>
    </div>
  );
}
