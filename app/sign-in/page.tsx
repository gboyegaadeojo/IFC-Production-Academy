import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppearancePicker } from "@/components/appearance-picker";
import { Wordmark } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";
import { signOutAction } from "@/app/auth/actions";
import { getAppearance } from "@/lib/data/appearance";
import { getCurrentUser } from "@/lib/data/auth";
import { pcoSignInEnabled } from "@/lib/data/planning-center-auth";
import { safeNextPath, signInErrorMessage } from "@/lib/domain/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const planningCenter = pcoSignInEnabled();
  return (
    <main
      id="main"
      className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12"
    >
      {/* Placeholder for the full-bleed team photo (SPEC §8) until IFC photography is ready. */}
      <div className="relative w-full max-w-md rounded-card border border-border bg-card p-8">
        <Wordmark />
        <h1 className="mt-6 text-heading font-semibold">Sign in to keep learning</h1>
        <p className="mt-2 text-text-secondary">
          {planningCenter
            ? "The production team signs in with Planning Center. No password to remember here."
            : "Enter your email and we'll send you a link. No password needed."}
        </p>
        <div className="mt-8">
          {/* A non-interactive placeholder, so nobody types into a form that is about to be replaced. */}
          <Suspense fallback={<SignInSkeleton />}>
            <SignInContent searchParams={searchParams} planningCenter={planningCenter} />
          </Suspense>
        </div>
        <div className="mt-8 border-t border-border pt-6">
          <Suspense fallback={null}>
            <SignInAppearance />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function SignInAppearance() {
  return <AppearancePicker initial={await getAppearance()} />;
}

function SignInSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading sign-in…
      </p>
      <div className="h-[7.5rem] rounded-button bg-hover motion-safe:animate-pulse" />
    </div>
  );
}

async function SignInContent({
  searchParams,
  planningCenter,
}: Pick<PageProps<"/sign-in">, "searchParams"> & { planningCenter: boolean }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const error = signInErrorMessage(typeof params.error === "string" ? params.error : null);

  // Already signed in and active: go straight to where they were heading.
  const user = await getCurrentUser();
  if (user?.status === "active") {
    redirect(next);
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mb-6 rounded-button border border-error px-4 py-3 text-small text-text"
        >
          {error}
        </p>
      ) : null}
      {user ? (
        // Signed in but suspended or deactivated: let them leave this device cleanly.
        <form action={signOutAction}>
          <button type="submit" className={buttonClasses("secondary", "w-full")}>
            Sign out
          </button>
        </form>
      ) : planningCenter ? (
        // Planning Center governs sign-in (G, 2026-11-01); an email link stays for training only.
        <div className="flex flex-col gap-6">
          <a
            href={`/auth/planning-center?next=${encodeURIComponent(next)}`}
            className={buttonClasses("primary", "w-full")}
          >
            Sign in with Planning Center
          </a>
          <details open={error !== null} className="group">
            <summary className="flex min-h-control cursor-pointer items-center text-small text-text-secondary hover:text-text">
              Not on a production team? Use an email link instead
            </summary>
            <div className="mt-4">
              <SignInForm />
            </div>
          </details>
        </div>
      ) : (
        <SignInForm />
      )}
    </>
  );
}
