import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CertificateSheet } from "@/components/certificate/certificate-sheet";

export const metadata: Metadata = { title: "Certificate preview" };

/** Development only: the certificate template with fake data, for design review and printing. */
export default async function CertificatePreviewPage({
  searchParams,
}: PageProps<"/dev/certificate">) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  const { revoked } = await searchParams;

  return (
    <main id="main" className="page-container flex flex-col gap-6 py-8 print:p-0">
      <CertificateSheet
        recipientName="Jordan Example Rivers"
        courseTitle="Camera Operations: Foundations"
        departmentName="Camera Operations"
        levelNumber={1}
        versionNumber={2}
        issuedAt="2027-02-07T18:30:00Z"
        reference="IFC-1A2B-3C4D-5E6F"
        departmentHue="blue"
        checkUrl="https://academy.example.org/verify/IFC-1A2B-3C4D-5E6F"
        revoked={revoked === "1"}
      />
    </main>
  );
}
