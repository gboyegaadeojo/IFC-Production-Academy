import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestSummary } from "@/components/copyright/request-summary";
import { getAdminAccess } from "@/lib/data/admin/access";
import { getCopyrightAdminRequest } from "@/lib/data/copyright-admin";
import { AccessDenied } from "../../../access-denied";

export const metadata: Metadata = { title: "Request" };

const UUID = /^[0-9a-f-]{36}$/;

/** One request and its history, read only, for admins (ADD-COPY-09). */
export default async function CopyrightAdminRequestPage({
  params,
}: PageProps<"/admin/copyright/requests/[id]">) {
  const { allowed } = await getAdminAccess("copyright");
  if (!allowed) {
    return <AccessDenied />;
  }
  const { id } = await params;
  if (!UUID.test(id)) {
    notFound();
  }
  const request = await getCopyrightAdminRequest(id);
  if (!request) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/copyright" className="self-start font-semibold underline">
        Video and graphics approvals
      </Link>
      <header className="flex flex-col gap-1">
        <p className="eyebrow">{request.reference}</p>
        <h1 className="text-title font-semibold">{request.description}</h1>
        {request.reviewers.length > 0 ? (
          <p className="text-text-secondary">Sent for review to {request.reviewers.join(", ")}</p>
        ) : null}
      </header>
      <RequestSummary
        request={request}
        fileHref={request.hasFile ? `/copyright/file?via=member&r=${request.id}` : null}
      />
    </div>
  );
}
