import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/certificate/print-button";
import { Wordmark } from "@/components/brand";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { InfoIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { verifyCertificate } from "@/lib/data/certificates";
import { normaliseReference } from "@/lib/domain/certificates";
import { formatDate } from "@/lib/domain/dates";
import { revokeCertificateAction } from "./actions";

export const metadata: Metadata = { title: "Certificate" };

type Props = PageProps<"/certificates/[reference]">;

export default function CertificatePage({ params }: Props) {
  return (
    <Suspense fallback={<CertificateSkeleton />}>
      <CertificateContent params={params} />
    </Suspense>
  );
}

/**
 * A certificate and its verification (SRS-CERT-002..005). Anyone signed in with the reference can
 * check it's genuine and still valid; it shows only what's printed on it. The design is a simple
 * placeholder until IFC's certificate template is decided (SPEC §9 open decisions).
 */
async function CertificateContent({ params }: Pick<Props, "params">) {
  await requireActiveUser();
  const reference = normaliseReference((await params).reference);
  if (!reference) {
    notFound();
  }
  const certificate = await verifyCertificate(reference);
  if (!certificate) {
    notFound();
  }

  return (
    <div className="page-container flex flex-col gap-6 py-8 lg:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <StatusBadge tone={certificate.revoked ? "neutral" : "success"}>
          {certificate.revoked ? "Withdrawn: no longer valid" : "Valid certificate"}
        </StatusBadge>
        {certificate.isMine && !certificate.revoked ? <PrintButton /> : null}
      </div>

      <article
        aria-labelledby="certificate-heading"
        className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 rounded-card border border-border-strong bg-card px-6 py-12 text-center sm:px-12 print:border-0 print:bg-transparent"
      >
        <Wordmark />
        <p className="eyebrow">Certificate of completion</p>
        <div className="flex flex-col gap-2">
          <p className="text-text-secondary">This certifies that</p>
          <h1 id="certificate-heading" className="text-display font-semibold text-balance">
            {certificate.recipientName}
          </h1>
          <p className="text-text-secondary">completed</p>
          <p className="text-title font-semibold text-balance">{certificate.courseTitle}</p>
          <p className="text-text-secondary">
            {certificate.departmentName} · Level {certificate.levelNumber} · course version{" "}
            {certificate.versionNumber}
          </p>
        </div>
        <p>Issued {formatDate(certificate.issuedAt)}</p>
        <p className="font-mono text-small text-text-muted">Reference {certificate.reference}</p>
        <p className="reading-width text-small text-text-muted">
          A course certificate shows the training was finished. Serving in a role is approved
          separately, through practical assessments.
        </p>
      </article>

      {certificate.revoked ? (
        <p className="mx-auto flex max-w-3xl gap-2 text-text-secondary">
          <InfoIcon className="mt-0.5 size-5 shrink-0" />
          This certificate was withdrawn by a leader and is no longer valid.
        </p>
      ) : null}

      {certificate.canRevoke && !certificate.revoked ? (
        <details className="mx-auto w-full max-w-3xl rounded-card border border-border p-5 print:hidden">
          <summary className="flex min-h-control cursor-pointer items-center font-medium">
            Withdraw this certificate
          </summary>
          <p className="mt-2 text-text-secondary">
            Only if it was issued by mistake. The record is kept and marked withdrawn.
          </p>
          <div className="mt-3">
            <ActionForm
              action={revokeCertificateAction}
              submitLabel="Withdraw certificate"
              pendingLabel="Withdrawing…"
              variant="destructive"
              hidden={{ reference: certificate.reference }}
            >
              <Field id="revoke-reason" label="Reason">
                <input
                  id="revoke-reason"
                  name="reason"
                  required
                  maxLength={300}
                  className={fieldClasses}
                />
              </Field>
            </ActionForm>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function CertificateSkeleton() {
  return (
    <div className="page-container flex flex-col gap-6 py-8 lg:py-12" aria-busy="true">
      <LoadingStatus label="Loading the certificate…" />
      <Skeleton className="mx-auto h-96 w-full max-w-3xl" />
    </div>
  );
}
