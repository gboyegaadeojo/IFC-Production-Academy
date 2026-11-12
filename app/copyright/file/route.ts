import { NextResponse, type NextRequest } from "next/server";
import { fileLinkFor, type FileAccess } from "@/lib/data/copyright";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Opens a request's uploaded graphic (ADD-COPY-10). The database first says whether this caller may
 * see that request, by private link or by being signed in; only then does the server sign a
 * one-minute link and send the browser to it. Never cached.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const via = query.get("via");
  const token = query.get("t") ?? "";
  const requestId = query.get("r") ?? "";
  let access: FileAccess | null = null;
  if (via === "quality_control" && token && UUID.test(requestId)) {
    access = { via, token, requestId };
  } else if (via === "review" && token) {
    access = { via, token };
  } else if (via === "member" && UUID.test(requestId)) {
    access = { via, requestId };
  }
  const url = access ? await fileLinkFor(access) : null;
  if (!url) {
    return new NextResponse("This file isn't available.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  return NextResponse.redirect(url, {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
