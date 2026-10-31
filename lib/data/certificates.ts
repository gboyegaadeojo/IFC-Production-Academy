import "server-only";
import { createSupabaseServerClient } from "@/lib/data/supabase/server";
import { toCertificateError, type CertificateError } from "@/lib/domain/certificates";

// Certificates (SRS-CERT-001..005). The database issues them only when a course's requirements
// are met, and revokes them only for leaders with competency.approve.

export type CertificateSummary = {
  reference: string;
  courseId: string;
  courseTitle: string;
  departmentName: string;
  levelNumber: number;
  versionNumber: number;
  issuedAt: string;
  revoked: boolean;
};

export async function getMyCertificates(userId: string): Promise<CertificateSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("certificates")
    .select(
      "reference, course_id, course_title, department_name, level_number, version_number, issued_at, revoked_at",
    )
    .eq("user_id", userId)
    .order("issued_at", { ascending: false });
  if (error) {
    throw new Error("Could not load certificates", { cause: error.code });
  }
  return data.map((row) => ({
    reference: row.reference,
    courseId: row.course_id,
    courseTitle: row.course_title,
    departmentName: row.department_name,
    levelNumber: row.level_number,
    versionNumber: row.version_number,
    issuedAt: row.issued_at,
    revoked: row.revoked_at !== null,
  }));
}

export async function getMyCertificateForCourse(
  userId: string,
  courseId: string,
): Promise<CertificateSummary | null> {
  return (await getMyCertificates(userId)).find((c) => c.courseId === courseId) ?? null;
}

export type IssueResult = { ok: true; reference: string } | { ok: false; error: CertificateError };

export async function issueCertificate(courseId: string): Promise<IssueResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("issue_certificate", { p_course_id: courseId });
  return error ? { ok: false, error: toCertificateError(error) } : { ok: true, reference: data };
}

export type VerifiedCertificate = {
  reference: string;
  recipientName: string;
  courseTitle: string;
  departmentName: string;
  levelNumber: number;
  versionNumber: number;
  issuedAt: string;
  revoked: boolean;
  isMine: boolean;
  canRevoke: boolean;
  departmentHue: string;
};

export async function verifyCertificate(reference: string): Promise<VerifiedCertificate | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_certificate", { p_reference: reference });
  if (error) {
    throw new Error("Could not check the certificate", { cause: error.code });
  }
  const row = data[0];
  return row
    ? {
        reference: row.reference,
        recipientName: row.recipient_name,
        courseTitle: row.course_title,
        departmentName: row.department_name,
        levelNumber: row.level_number,
        versionNumber: row.version_number,
        issuedAt: row.issued_at,
        revoked: row.revoked,
        isMine: row.is_mine,
        canRevoke: row.can_revoke,
        departmentHue: row.department_hue,
      }
    : null;
}

export type CheckedCertificate = {
  reference: string;
  recipientInitials: string;
  courseTitle: string;
  departmentName: string;
  levelNumber: number;
  issuedAt: string;
  revoked: boolean;
};

/**
 * The public check behind a certificate's QR code (SRS-CERT-004, decision 8). Works signed out and
 * shows initials only, never the recipient's full name.
 */
export async function checkCertificate(reference: string): Promise<CheckedCertificate | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_certificate", { p_reference: reference });
  if (error) {
    throw new Error("Could not check the certificate", { cause: error.code });
  }
  const row = data[0];
  return row
    ? {
        reference: row.reference,
        recipientInitials: row.recipient_initials,
        courseTitle: row.course_title,
        departmentName: row.department_name,
        levelNumber: row.level_number,
        issuedAt: row.issued_at,
        revoked: row.revoked,
      }
    : null;
}

export async function revokeCertificate(
  reference: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: CertificateError }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_certificate", {
    p_reference: reference,
    p_reason: reason,
  });
  return error ? { ok: false, error: toCertificateError(error) } : { ok: true };
}
