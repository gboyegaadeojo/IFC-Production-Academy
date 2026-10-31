/**
 * Downloads every object in every Supabase Storage bucket into a folder, for the nightly backup.
 * Usage: node scripts/backup/download-storage.ts <out-dir>
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Logs counts and total size only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const out = process.argv[2] ?? "";
if (!url || !key || !out) {
  console.error(
    "download-storage: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and an output folder are needed",
  );
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function json<T>(response: Response, step: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${step} failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Every object path in a bucket, walking folders. */
async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const entries = await json<{ name: string; id: string | null }[]>(
      await fetch(`${url}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      }),
      "Listing storage",
    );
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have no id.
      if (entry.id === null) {
        paths.push(...(await listAll(bucket, path)));
      } else {
        paths.push(path);
      }
    }
    if (entries.length < 1000) {
      return paths;
    }
  }
}

async function main(): Promise<void> {
  const buckets = await json<{ id: string }[]>(
    await fetch(`${url}/storage/v1/bucket`, { headers }),
    "Listing buckets",
  );
  let files = 0;
  let bytes = 0;
  for (const bucket of buckets) {
    for (const path of await listAll(bucket.id)) {
      const response = await fetch(
        `${url}/storage/v1/object/${bucket.id}/${path.split("/").map(encodeURIComponent).join("/")}`,
        { headers },
      );
      if (!response.ok) {
        throw new Error(`Downloading a stored file failed with HTTP ${response.status}`);
      }
      const data = Buffer.from(await response.arrayBuffer());
      const target = join(out, bucket.id, ...path.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data);
      files += 1;
      bytes += data.length;
    }
  }
  console.log(`Storage: ${buckets.length} buckets, ${files} files, ${bytes} bytes.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Storage download failed");
  process.exit(1);
});
