import { fitWithin, PHOTO_MAX_SIDE, PHOTO_QUALITY, THUMB_MAX_SIDE } from "@/lib/domain/chat-files";
import { browserClient } from "@/lib/data/messages-live";

/**
 * Photos and documents for chats, in the browser (ADD-MSG-04, 09). Photos are made smaller here
 * before they leave the phone: at most 1,600 px, WebP at about 80% (JPEG where the browser can't
 * make WebP), plus a 320 px thumbnail. Redrawing drops location and camera details. Files go
 * straight to the private chat-files bucket as the signed-in person, so storage's own rules
 * decide, and they never pass through the Worker.
 */

export type ShrunkPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  extension: "webp" | "jpg";
};

async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function encode(source: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.resolve(null);
  }
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") {
          resolve(webp);
          return;
        }
        // Older Safari can't make WebP.
        canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", PHOTO_QUALITY);
      },
      "image/webp",
      PHOTO_QUALITY,
    );
  });
}

/** Null if the browser can't read the picture (some HEIC photos outside Safari). */
export async function shrinkPhoto(file: File): Promise<ShrunkPhoto | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return null;
  }
  const size = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
  const small = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_SIDE);
  const [full, thumb] = await Promise.all([
    encode(bitmap, size.width, size.height),
    encode(bitmap, small.width, small.height),
  ]);
  bitmap.close();
  if (!full || !thumb) {
    return null;
  }
  return {
    full,
    thumb,
    width: size.width,
    height: size.height,
    extension: full.type === "image/webp" ? "webp" : "jpg",
  };
}

/** Uploads one file to the chat's folder. False if storage refused it or the connection failed. */
export async function uploadChatFile({
  url,
  publishableKey,
  path,
  file,
  contentType,
}: {
  url: string;
  publishableKey: string;
  path: string;
  file: Blob;
  contentType: string;
}): Promise<boolean> {
  const { error } = await browserClient(url, publishableKey)
    .storage.from("chat-files")
    .upload(path, file, { contentType, upsert: false, cacheControl: "3600" });
  return !error;
}

/** The first bytes of a file, to check it's what its name says before uploading. */
export async function firstBytes(file: Blob, count = 1024): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, count).arrayBuffer());
}
