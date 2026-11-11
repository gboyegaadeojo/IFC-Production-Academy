import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";
import { getAppearance } from "@/lib/data/appearance";
import { getCurrentUser } from "@/lib/data/auth";
import { pcoSignInEnabled } from "@/lib/data/planning-center-auth";
import { safeNextPath, signInErrorMessage } from "@/lib/domain/auth";
import { EmailOption } from "./email-option";
import { PlanningCenterButton } from "./planning-center-button";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/** The department hues, as a quiet row above the headline. Decorative. */
const HUES = ["--dept-blue", "--dept-teal", "--dept-coral", "--dept-violet", "--dept-amber"];

/**
 * Sign-in, option A "Focus" (approved 2026-11-06, replacing the photo layout of 2026-11-01): the
 * brand and light or dark at the top, a large headline, then one Planning Center button with the
 * email link as a second, quieter button. Centred on wide screens; on a phone the buttons sit low,
 * within reach of a thumb. Sign-in itself is unchanged.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const planningCenter = pcoSignInEnabled();
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-1 flex-col bg-bg px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-12 sm:py-8"
    >
      <div className="auth-rise flex items-center justify-between gap-4">
        {/* The full Signal Line logo at 52px, the smallest size it's used at (decision 2026-11-10). */}
        <BrandLogo size={52} />

        <Suspense fallback={null}>
          <SignInAppearance />
        </Suspense>
      </div>

      <div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col justify-end gap-10 py-10 sm:justify-center sm:text-center">
        <div className="flex flex-col gap-5 sm:items-center">
          <div aria-hidden="true" className="auth-rise flex gap-1.5 [animation-delay:40ms]">
            {HUES.map((hue) => (
              <span
                key={hue}
                className="h-1.5 w-7 rounded-pill sm:w-8"
                style={{ background: `var(${hue})` }}
              />
            ))}
          </div>
          <h1 className="auth-rise text-[clamp(2.75rem,8vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance [animation-delay:80ms]">
            Learn it. Serve it.
          </h1>
          <p className="auth-rise text-body leading-relaxed text-text-secondary [animation-delay:140ms] sm:text-lead">
            Training for the IFC production team. Your lessons, your Sunday checklist, and your
            schedule, in one place.
          </p>
        </div>
        <div className="auth-rise text-left [animation-delay:220ms]">
          {/* A non-interactive placeholder, so nobody types into a form that is about to be replaced. */}
          <Suspense fallback={<SignInSkeleton />}>
            <SignInContent searchParams={searchParams} planningCenter={planningCenter} />
          </Suspense>
        </div>
      </div>

      <div className="auth-rise flex flex-col gap-2 border-t border-border pt-4 text-small text-text-secondary [animation-delay:300ms] sm:flex-row sm:items-center sm:justify-between sm:border-t-0 sm:pt-0">
        <p className="hidden text-text-muted sm:block">
          Immanuel Fellowship Church · Production Ministry
        </p>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {/* For people who aren't on the team yet. The form needs no account. */}
          <span>
            New here?{" "}
            <Link
              href="/serve-with-us"
              className="font-medium text-accent-light underline underline-offset-4"
            >
              Join the production team
            </Link>
          </span>
          <Link href="/help" className="underline underline-offset-4">
            Help and guides
          </Link>
        </p>
      </div>
    </main>
  );
}

async function SignInAppearance() {
  return <ThemeToggle initial={await getAppearance()} />;
}

function SignInSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading sign-in…
      </p>
      <div className="h-[54px] rounded-pill bg-hover motion-safe:animate-pulse" />
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
          className="mb-5 rounded-button border border-error px-4 py-3 text-small text-text"
        >
          {error}
        </p>
      ) : null}
      {user ? (
        // Signed in but suspended or deactivated: let them leave this device cleanly.
        <form action="/auth/sign-out" method="post">
          <button type="submit" className={buttonClasses("secondary", "w-full")}>
            Sign out
          </button>
        </form>
      ) : planningCenter ? (
        // Planning Center governs sign-in (G, 2026-11-01); an email link stays for training only.
        <div className="flex flex-col gap-3">
          <PlanningCenterButton href={`/auth/planning-center?next=${encodeURIComponent(next)}`} />
          <EmailOption initiallyOpen={error !== null} />
          <p className="text-center text-small text-text-muted">
            Use Planning Center if you&apos;re on a production team.
          </p>
        </div>
      ) : (
        <SignInForm />
      )}
    </>
  );
}
