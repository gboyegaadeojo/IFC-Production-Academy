import type { Metadata } from "next";
import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { StatusBadge } from "@/components/ui/status-badge";
import { checkCertificate } from "@/lib/data/certificates";
import { normaliseReference } from "@/lib/domain/certificates";
import { formatDate } from "@/lib/domain/dates";

export const metadata: Metadata = {
  title: "Check a certificate",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The public certificate check a printed certificate's QR code opens (SRS-CERT-004, decision 8).
 * Works signed out. Shows whether it's valid, what it's for, and the recipient's initials only,
 * so a reference on a piece of paper exposes nobody's name.
 */
export default function VerifyCertificatePage({ params }: PageProps<"/verify/[reference]">) {
  return (
    <main id="main" className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-border bg-card p-8">
        <Wordmark />
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="h-40 rounded-button bg-hover motion-safe:animate-pulse"
            >
              <p role="status" className="sr-only">
                Checking the certificate…
              </p>
            </div>
          }
        >
          <CheckResult params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function CheckResult({ params }: Pick<PageProps<"/verify/[reference]">, "params">) {
  const reference = normaliseReference((await params).reference);
  const certificate = reference ? await checkCertificate(reference) : null;

  if (!certificate) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-heading font-semibold">We couldn&apos;t find that certificate</h1>
        <p className="text-text-secondary">
          Check the reference printed on it. It looks like IFC-1A2B-3C4D-5E6F. A certificate that
          isn&apos;t found here wasn&apos;t issued by the IFC Production Academy.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <StatusBadge tone={certificate.revoked ? "neutral" : "success"}>
        {certificate.revoked ? "Withdrawn: no longer valid" : "Valid certificate"}
      </StatusBadge>
      <div className="flex flex-col gap-1">
        <h1 className="text-heading font-semibold text-balance">{certificate.courseTitle}</h1>
        <p className="text-text-secondary">
          {certificate.departmentName} · Level {certificate.levelNumber}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-text-muted">Issued to</dt>
        <dd>{certificate.recipientInitials}</dd>
        <dt className="text-text-muted">Issued</dt>
        <dd>{formatDate(certificate.issuedAt)}</dd>
        <dt className="text-text-muted">Reference</dt>
        <dd className="font-mono tabular-nums">{certificate.reference}</dd>
      </dl>
      <p className="text-small text-text-muted">
        Only initials are shown, to protect the volunteer&apos;s privacy. This certificate records
        completed training at Immanuel Fellowship Church; approval to serve is given separately.
      </p>
    </div>
  );
}
