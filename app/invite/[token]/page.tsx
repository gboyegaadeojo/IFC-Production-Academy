import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { DepartmentIcon } from "@/components/department-icon";
import { buttonClasses } from "@/components/ui/button";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { getCurrentUser } from "@/lib/data/auth";
import { previewInvitation } from "@/lib/data/invitations";
import { departmentHueVar } from "@/lib/domain/departments";
import { isInvitationToken, unusableInvitationMessage } from "@/lib/domain/invitations";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Your invitation",
  // Invitation links are shareable secrets: keep them out of search engines and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main
      id="main"
      className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_60%)]"
      />
      <div className="relative flex w-full max-w-md flex-col gap-6 rounded-card border border-border bg-card p-8">
        <Wordmark />
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="h-40 rounded-button bg-hover motion-safe:animate-pulse"
            >
              <p role="status" className="sr-only">
                Loading your invitation…
              </p>
            </div>
          }
        >
          <InviteContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function InviteContent({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  if (!isInvitationToken(token)) {
    return <Unusable message={unusableInvitationMessage("not_found")} />;
  }

  const user = await getCurrentUser();
  if (!user) {
    // Details stay hidden until sign-in, so a leaked link reveals nothing on its own.
    return (
      <>
        <div className="flex flex-col gap-2">
          <h1 className="text-heading font-semibold">You&apos;re invited</h1>
          <p className="text-text-secondary">
            Someone on the IFC production team invited you to the Academy. Enter your email and
            we&apos;ll send you a link to sign in and accept. No password needed.
          </p>
        </div>
        <SignInForm invite={token} />
      </>
    );
  }
  if (user.status !== "active") {
    return (
      <Unusable message="Your account isn't active right now. Talk to your department leader or the Production Director." />
    );
  }

  const preview = await previewInvitation(token);
  const departmentName = preview.departmentName;

  switch (preview.status) {
    case "valid":
      return (
        <>
          <Heading
            preview={preview}
            title={departmentName ? `Join ${departmentName}` : "Join the Academy"}
          />
          <p className="text-text-secondary">
            {departmentName
              ? `You've been invited to ${departmentName}. Accepting gives you its training straight away. Approval to serve comes later, after a practical assessment.`
              : "You've been invited to the IFC Production Academy."}
          </p>
          <AcceptForm
            token={token}
            label={departmentName ? `Accept and join ${departmentName}` : "Accept invitation"}
          />
        </>
      );
    case "accepted":
    case "already_member":
      return (
        <>
          <Heading preview={preview} title="You're already in" />
          <p className="text-text-secondary">
            {departmentName
              ? `You're a member of ${departmentName}.`
              : "You've already accepted this invitation."}
          </p>
          <Link href="/home" className={buttonClasses("primary", "w-full")}>
            Go to your home page
          </Link>
        </>
      );
    default:
      return <Unusable message={unusableInvitationMessage(preview.status)} />;
  }
}

function Heading({
  preview,
  title,
}: {
  preview: { departmentHue: string | null; departmentIcon: string | null };
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {preview.departmentHue && preview.departmentIcon ? (
        <span
          className="flex size-12 items-center justify-center rounded-card border border-[var(--dept)] text-[var(--dept)]"
          style={{ "--dept": departmentHueVar(preview.departmentHue) } as CSSProperties}
        >
          <DepartmentIcon icon={preview.departmentIcon} />
        </span>
      ) : null}
      <h1 className="text-heading font-semibold">{title}</h1>
    </div>
  );
}

function Unusable({ message }: { message: string }) {
  return (
    <>
      <h1 className="text-heading font-semibold">This invitation can&apos;t be used</h1>
      <p className="text-text-secondary">{message}</p>
      <Link href="/home" className={buttonClasses("secondary", "w-full")}>
        Go to your home page
      </Link>
    </>
  );
}
