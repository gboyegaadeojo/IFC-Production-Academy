import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppearancePicker } from "@/components/appearance-picker";
import { IfcMark } from "@/components/brand";
import { buttonClasses } from "@/components/ui/button";
import { signOutAction } from "@/app/auth/actions";
import { getAppearance } from "@/lib/data/appearance";
import { getCurrentUser } from "@/lib/data/auth";
import { pcoSignInEnabled } from "@/lib/data/planning-center-auth";
import { safeNextPath, signInErrorMessage } from "@/lib/domain/auth";
import { PlanningCenterButton } from "./planning-center-button";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in (redesigned 2026-11-01 from G's approved mock): the brand, an editorial welcome and
 * Planning Center sign-in on the left, a cinematic production photo on the right. On phones the
 * photo becomes a short banner above. The photo is a licensed stock image for now (docs/assets.md);
 * replacing public/sign-in/hero-*.webp swaps in IFC's own shoot. Sign-in itself is unchanged.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const planningCenter = pcoSignInEnabled();
  return (
    <main id="main" className="grid min-h-dvh flex-1 bg-bg lg:grid-cols-[42fr_58fr]">
      <Hero />
      <div className="flex flex-col justify-between gap-12 px-5 pt-8 pb-8 sm:px-10 lg:min-h-dvh lg:px-[clamp(2.5rem,5vw,4.5rem)] lg:py-11">
        <p className="auth-rise hidden items-center gap-3 text-small font-semibold tracking-[0.16em] text-text lg:flex">
          <IfcMark className="mark-on-theme" height={18} />
          IFC PRODUCTION ACADEMY
        </p>

        <div className="flex w-full max-w-[27.5rem] flex-col gap-5">
          <h1 className="auth-rise text-[clamp(2.25rem,4vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.035em] text-balance [animation-delay:70ms]">
            Built to serve.
            <br />
            Trained to excel.
          </h1>
          <p className="auth-rise max-w-[40ch] text-body leading-relaxed text-text-secondary [animation-delay:140ms]">
            Develop your skills, grow your confidence, and serve with excellence. Your production
            journey starts here.
          </p>
          <div className="auth-rise mt-3 [animation-delay:220ms]">
            {/* A non-interactive placeholder, so nobody types into a form that is about to be replaced. */}
            <Suspense fallback={<SignInSkeleton />}>
              <SignInContent searchParams={searchParams} planningCenter={planningCenter} />
            </Suspense>
          </div>
        </div>

        <div className="auth-rise flex flex-wrap items-end justify-between gap-4 [animation-delay:300ms]">
          <div>
            <p className="text-small tracking-[0.04em] text-text-secondary">
              Learn. Practice. Grow.
            </p>
            <p className="mt-1.5 text-small text-text-muted">
              Immanuel Fellowship Church · Production Ministry
            </p>
          </div>
          <Suspense fallback={null}>
            <SignInAppearance />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/** The photo: a full-height panel from 1024px, a short banner above the form on phones. */
function Hero() {
  return (
    <div className="relative h-56 overflow-hidden bg-[var(--photo-bg)] sm:h-64 lg:order-last lg:h-auto lg:min-h-dvh">
      <picture>
        <source media="(min-width: 1024px)" srcSet="/sign-in/hero-1600.webp" type="image/webp" />
        {/* Decorative: the page says everything the photo does. */}
        <img
          src="/sign-in/hero-900.webp"
          alt=""
          width={1600}
          height={1020}
          fetchPriority="high"
          className="auth-settle absolute inset-0 size-full object-cover object-[30%_50%]"
        />
      </picture>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_60%_40%,transparent_50%,rgb(0_0_0/0.55)_100%),linear-gradient(to_top,rgb(0_0_0/0.65),transparent_45%)]"
      />
      <p className="text-white absolute top-4 left-4 flex items-center gap-2.5 text-[0.7rem] font-semibold tracking-[0.16em] lg:hidden">
        <IfcMark height={14} />
        IFC PRODUCTION ACADEMY
      </p>
      <div className="absolute bottom-[clamp(1.5rem,4vw,3.25rem)] left-[clamp(1.5rem,4vw,3.5rem)] hidden max-w-[32ch] lg:block">
        <p className="mb-2 text-small font-semibold tracking-[0.2em] text-[var(--photo-accent)]">
          EVERY ROLE MATTERS.
        </p>
        <p className="text-body leading-relaxed text-[var(--photo-text)]">
          Behind every great production is a team committed to excellence.
        </p>
      </div>
    </div>
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
      <div className="h-[54px] rounded-[11px] bg-hover motion-safe:animate-pulse" />
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
        <form action={signOutAction}>
          <button type="submit" className={buttonClasses("secondary", "w-full")}>
            Sign out
          </button>
        </form>
      ) : planningCenter ? (
        // Planning Center governs sign-in (G, 2026-11-01); an email link stays for training only.
        <div className="flex flex-col gap-5">
          <PlanningCenterButton href={`/auth/planning-center?next=${encodeURIComponent(next)}`} />
          <details open={error !== null} className="group">
            <summary className="flex min-h-control w-fit cursor-pointer items-center text-small text-text-secondary underline decoration-border-strong underline-offset-4 hover:text-text">
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
