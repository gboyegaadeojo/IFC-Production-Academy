/**
 * Photos, GIFs and documents in chats (ADD-MSG-04, 08, 09; docs/decisions/2026-11-08-team-messaging.md).
 * Pure rules: which documents are allowed, checking a file is what its name says, sizes, and the
 * words shown for each. The database and the storage bucket check again.
 */

export const MAX_PHOTOS = 4;
/** The longest side of a photo after it's made smaller in the browser. */
export const PHOTO_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 320;
export const PHOTO_QUALITY = 0.8;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentKind = "photo" | "document" | "gif";

export type DocumentType = { mime: string; label: string; extension: string };

const DOCUMENTS: readonly DocumentType[] = [
  { extension: "pdf", mime: "application/pdf", label: "PDF" },
  { extension: "doc", mime: "application/msword", label: "Word" },
  {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
  },
  { extension: "xls", mime: "application/vnd.ms-excel", label: "Excel" },
  {
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
  },
  { extension: "ppt", mime: "application/vnd.ms-powerpoint", label: "PowerPoint" },
  {
    extension: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    label: "PowerPoint",
  },
  { extension: "txt", mime: "text/plain", label: "Text" },
];

/** What the file picker offers. */
export const DOCUMENT_ACCEPT = DOCUMENTS.map((type) => `.${type.extension}`).join(",");

/** The allowed type for a file name, or null. The name decides, not what the browser guesses. */
export function documentTypeFor(fileName: string): DocumentType | null {
  const extension = fileName.toLowerCase().split(".").at(-1) ?? "";
  return DOCUMENTS.find((type) => type.extension === extension) ?? null;
}

export function documentLabel(mime: string | null): string {
  return DOCUMENTS.find((type) => type.mime === mime)?.label ?? "File";
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Whether a file's first bytes match its type, so a program renamed to .pdf is refused. Office
 * files from 2007 on are zip files; older ones share one signature.
 */
export function matchesSignature(bytes: Uint8Array, mime: string): boolean {
  switch (mime) {
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // PK
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text/plain":
      return bytes.length > 0 && !bytes.slice(0, 1024).includes(0);
    default:
      return false;
  }
}

/** A photo's size after making it fit within `max` on its longest side, never larger. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** "240 KB" or "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** What a chat list row says for a message that's only an attachment. */
export function attachmentPreview(kind: string | null, count: number): string | null {
  switch (kind) {
    case "photo":
      return count > 1 ? `${count} photos` : "Photo";
    case "gif":
      return "GIF";
    case "document":
      return "Document";
    default:
      return null;
  }
}

/** Where a file goes: the chat first, so storage can check who may open it. */
export function chatFilePath(conversationId: string, uploadId: string, name: string): string {
  return `${conversationId}/${uploadId}/${name}`;
}

/** An attachment as the chat shows it. Links are short-lived and made when the page is loaded. */
export type ChatAttachment = {
  id: string;
  kind: AttachmentKind;
  removed: boolean;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  fileName: string | null;
  mimeType: string | null;
  bytes: number | null;
  gifUrl: string | null;
};

/** What's sent with a message: files already uploaded to the chat's folder, or a GIF. */
export type OutgoingAttachment =
  | {
      kind: "photo";
      full_path: string;
      thumb_path: string;
      width: number;
      height: number;
      bytes: number;
    }
  | { kind: "document"; full_path: string; file_name: string; mime_type: string; bytes: number }
  | { kind: "gif"; gif_id: string; gif_url: string; width: number; height: number };

/** One GIF from GIPHY search, only from GIPHY's own servers. */
export type GifResult = { id: string; title: string; url: string; width: number; height: number };

const GIPHY_MEDIA = /^https:\/\/media[0-9]*\.giphy\.com\//;

type GiphyImage = { url?: unknown; width?: unknown; height?: unknown; webp?: unknown };
type GiphyItem = { id?: unknown; title?: unknown; images?: { fixed_width?: GiphyImage } };

/** Keeps only well-formed rated-G results from GIPHY's media servers, smallest useful size. */
export function parseGiphy(payload: unknown): GifResult[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return (data as GiphyItem[]).flatMap((item) => {
    const image = item.images?.fixed_width;
    const url = typeof image?.webp === "string" ? image.webp : image?.url;
    const width = Number(image?.width);
    const height = Number(image?.height);
    if (
      typeof item.id !== "string" ||
      !/^[A-Za-z0-9]{1,64}$/.test(item.id) ||
      typeof url !== "string" ||
      !GIPHY_MEDIA.test(url) ||
      !(width > 0 && width <= 1600 && height > 0 && height <= 1600)
    ) {
      return [];
    }
    return [
      {
        id: item.id,
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "GIF",
        url,
        width,
        height,
      },
    ];
  });
}
