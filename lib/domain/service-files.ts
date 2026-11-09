/**
 * Files on a service and the calendar link (plan "Academy scheduling", PR 10). Pure checks; the
 * database and storage policies decide who may add or open what.
 */

export const SERVICE_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const SERVICE_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "Image",
  "image/jpeg": "Image",
  "image/webp": "Image",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "text/plain": "Text",
};

export type FileCheck = { ok: true } | { ok: false; message: string };

export function checkServiceFile(file: { name: string; size: number; type: string }): FileCheck {
  if (file.size === 0) {
    return { ok: false, message: "Choose a file." };
  }
  if (file.size > SERVICE_FILE_MAX_BYTES) {
    return { ok: false, message: "Files can be up to 10 MB." };
  }
  if (!(file.type in SERVICE_FILE_TYPES)) {
    return {
      ok: false,
      message: "Add a PDF, an image, a Word, Excel, or PowerPoint file, or plain text.",
    };
  }
  return { ok: true };
}

/** A storage-safe name that keeps the extension: "Stage plot (Nov).pdf" to "stage-plot-nov.pdf". */
export function safeFileName(name: string): string {
  const own = name.split(/[\\/]/).pop() ?? "";
  const dot = own.lastIndexOf(".");
  const base = dot > 0 ? own.slice(0, dot) : own;
  const extension =
    dot > 0
      ? own
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "";
  const slug =
    base
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60) || "file";
  return extension ? `${slug}.${extension.slice(0, 8)}` : slug;
}

/** "412 KB", "1.2 MB". */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FEED_TOKEN = /^[0-9a-f]{48}$/;

/** The token from a feed address's last part, with or without ".ics". */
export function feedToken(segment: string): string | null {
  const token = segment.replace(/\.ics$/i, "");
  return FEED_TOKEN.test(token) ? token : null;
}

/** The link a calendar app subscribes to. */
export function feedUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/feeds/serving/${token}.ics`;
}
