/**
 * Certificates (SRS-CERT-001..005). A certificate says someone finished a course; the database
 * issues it only when the course's requirements are met. It is never a competency or Approved to
 * Serve (SPEC §3).
 */

/** IFC-1A2B-3C4D-5E6F, as printed on the certificate. */
export const CERTIFICATE_REFERENCE = /^IFC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export function normaliseReference(input: string): string | null {
  const value = input.trim().toUpperCase();
  return CERTIFICATE_REFERENCE.test(value) ? value : null;
}

/** The public check page a certificate's QR code opens (decision 8). */
export function certificateCheckUrl(siteUrl: string, reference: string): string {
  return new URL(`/verify/${encodeURIComponent(reference)}`, siteUrl).toString();
}

export type CertificateError =
  "not_authorized" | "requirements_not_met" | "certificate_revoked" | "reason_required" | "unknown";

export function toCertificateError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): CertificateError {
  if (
    error?.message === "requirements_not_met" ||
    error?.message === "certificate_revoked" ||
    error?.message === "reason_required" ||
    error?.message === "not_authorized"
  ) {
    return error.message;
  }
  return error?.code === "42501" ? "not_authorized" : "unknown";
}

export function certificateErrorMessage(error: CertificateError): string {
  switch (error) {
    case "not_authorized":
      return "Certificates are for members of the department who have finished the course.";
    case "requirements_not_met":
      return "Not yet: finish every required lesson, quiz, and practical assessment first.";
    case "certificate_revoked":
      return "Your certificate for this course was withdrawn. Talk to your department leader.";
    case "reason_required":
      return "Say why, so the record makes sense later.";
    case "unknown":
      return "That didn't go through. Check your connection and try again.";
  }
}
