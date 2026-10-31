import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import { getSop, getSopFileUrl } from "@/lib/data/sops";

// Opens an SOP's file (SRS-SOP-006). The storage policies decide: members open the current version
// of a live SOP, curriculum staff any version. The answer is a redirect to a link that lasts a
// minute, never a permanent or public address. Logs carry status only.

const id = z.uuid();

function noStore(status: number, location?: string): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store", ...(location ? { Location: location } : {}) },
  });
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/sops/[sopId]/file">,
): Promise<Response> {
  const sopId = id.safeParse((await params).sopId);
  if (!sopId.success) {
    return noStore(404);
  }
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return noStore(303, `/sign-in?next=${encodeURIComponent(`/sops/${sopId.data}`)}`);
  }
  const sop = await getSop(sopId.data);
  if (!sop) {
    return noStore(404);
  }
  const requested = new URL(request.url).searchParams.get("version");
  const versionId = requested === null ? sop.current?.id : id.safeParse(requested).data;
  const version = sop.versions.find((v) => v.id === versionId);
  const url = version ? await getSopFileUrl(version.id) : null;
  if (!url) {
    return noStore(303, `/sops/${sop.id}?file=unavailable`);
  }
  return noStore(303, url);
}
