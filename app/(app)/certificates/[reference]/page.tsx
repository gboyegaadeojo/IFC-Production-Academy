import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/certificate/print-button";
import { CertificateSheet } from "@/components/certificate/certificate-sheet";
import { ActionForm, Field, fieldClasses } from "@/components/ui/action-form";
import { InfoIcon } from "@/components/ui/icons";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireActiveUser } from "@/lib/data/auth";
import { verifyCertificate } from "@/lib/data/certificates";
import { certificateCheckUrl, normaliseReference } from "@/lib/domain/certificates";
import { publicEnv } from "@/lib/env";
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
 * check it's genuine and still valid; it shows only what's printed on it. The printed sheet's QR code
 * opens the public check at /verify, which shows initials only (decision 8).
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
    <div className="page-container flex flex-col gap-6 py-8 lg:py-12 print:p-0">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
        <StatusBadge tone={certificate.revoked ? "neutral" : "success"}>
          {certificate.revoked ? "Withdrawn: no longer valid" : "Valid certificate"}
        </StatusBadge>
        {certificate.isMine && !certificate.revoked ? <PrintButton /> : null}
      </div>

      <CertificateSheet
        recipientName={certificate.recipientName}
        courseTitle={certificate.courseTitle}
        departmentName={certificate.departmentName}
        levelNumber={certificate.levelNumber}
        versionNumber={certificate.versionNumber}
        issuedAt={certificate.issuedAt}
        reference={certificate.reference}
        departmentHue={certificate.departmentHue}
        checkUrl={certificateCheckUrl(publicEnv().NEXT_PUBLIC_SITE_URL, certificate.reference)}
        revoked={certificate.revoked}
      />

      {certificate.revoked ? (
        <p className="mx-auto flex max-w-4xl gap-2 text-text-secondary print:hidden">
          <InfoIcon className="mt-0.5 size-5 shrink-0" />
          This certificate was withdrawn by a leader and is no longer valid.
        </p>
      ) : null}

      {certificate.canRevoke && !certificate.revoked ? (
        <details className="mx-auto w-full max-w-4xl rounded-card border border-border p-5 print:hidden">
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
      <Skeleton className="mx-auto aspect-[11/8.5] w-full max-w-4xl" />
    </div>
  );
}
