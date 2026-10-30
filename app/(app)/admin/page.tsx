import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/data/auth";
import { getMyCapabilities } from "@/lib/data/capabilities";
import { adminSections } from "@/lib/domain/admin";
import { AccessDenied } from "./access-denied";

/** Opens the first section the person may use. */
export default async function AdminIndexPage() {
  await requireActiveUser();
  const [first] = adminSections(await getMyCapabilities());
  if (first) {
    redirect(first.href);
  }
  return <AccessDenied />;
}
