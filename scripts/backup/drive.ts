/**
 * A small Google Drive client for the backup jobs, using Node built-ins only. It signs in with a
 * short-lived token from GitHub's keyless Workload Identity Federation (GDRIVE_ACCESS_TOKEN), or,
 * where key files are allowed, a service-account key (GDRIVE_SERVICE_ACCOUNT_JSON). Works in a Shared Drive folder (supportsAllDrives). Never logs names of people or file
 * contents; callers log counts, sizes, and timings.
 */
import { createSign } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** An OAuth access token for the service account (JWT bearer grant). */
export async function accessToken(serviceAccountJson: string): Promise<string> {
  const account = JSON.parse(serviceAccountJson) as ServiceAccount;
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(account.private_key).toString("base64url");
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google sign-in failed with HTTP ${response.status}`);
  }
  return ((await response.json()) as { access_token: string }).access_token;
}

/** Whether the job has a way to sign in to Google Drive. */
export function driveConfigured(): boolean {
  return Boolean(process.env.GDRIVE_ACCESS_TOKEN || process.env.GDRIVE_SERVICE_ACCOUNT_JSON);
}

/** A Drive token: the keyless one GitHub got from Google, else one from a key file. */
export async function driveToken(): Promise<string> {
  const keyless = process.env.GDRIVE_ACCESS_TOKEN;
  if (keyless) {
    return keyless;
  }
  const account = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  if (!account) {
    throw new Error("No Google sign-in: GDRIVE_ACCESS_TOKEN or GDRIVE_SERVICE_ACCOUNT_JSON");
  }
  return accessToken(account);
}

export type DriveFile = { id: string; name: string; size: number };

export async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, size)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const response = await fetch(`${API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Listing the backup folder failed with HTTP ${response.status}`);
    }
    const page = (await response.json()) as {
      nextPageToken?: string;
      files: { id: string; name: string; size?: string }[];
    };
    files.push(...page.files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size ?? 0) })));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

/** Uploads a local file into the folder with a resumable upload. Returns the Drive file id. */
export async function uploadFile(
  token: string,
  folderId: string,
  path: string,
  name: string,
): Promise<string> {
  const size = statSync(path).size;
  const start = await fetch(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const location = start.headers.get("location");
  if (!start.ok || !location) {
    throw new Error(`Starting an upload failed with HTTP ${start.status}`);
  }
  const done = await fetch(location, {
    method: "PUT",
    headers: { "Content-Length": String(size), "Content-Type": "application/octet-stream" },
    body: Readable.toWeb(createReadStream(path)) as ReadableStream,
    duplex: "half",
  } as RequestInit);
  if (!done.ok) {
    throw new Error(`An upload failed with HTTP ${done.status}`);
  }
  return ((await done.json()) as { id: string }).id;
}

export async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  const response = await fetch(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`A download failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  const response = await fetch(`${API}/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Deleting an old backup failed with HTTP ${response.status}`);
  }
}
