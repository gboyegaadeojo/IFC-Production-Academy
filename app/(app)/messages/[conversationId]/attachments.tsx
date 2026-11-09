"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeftIcon, CloseIcon, FileTextIcon, PlusIcon } from "@/components/ui/icons";
import {
  documentLabel,
  formatBytes,
  type ChatAttachment,
  type GifResult,
} from "@/lib/domain/chat-files";
import { attachmentLinkAction, searchGifsAction } from "../actions";

/**
 * Photos, GIFs and documents in a message (ADD-MSG-04, 08, 09; mock screen 10). Thumbnails only in
 * the chat; the full photo or the document loads when tapped, through a one-minute link.
 */
export function MessageAttachments({
  attachments,
  onOpenPhoto,
}: {
  attachments: ChatAttachment[];
  onOpenPhoto: (photos: ChatAttachment[], index: number) => void;
}) {
  const photos = attachments.filter((item) => item.kind === "photo" && !item.removed);
  const gone = attachments.filter((item) => item.removed);
  return (
    <>
      {photos.length > 0 ? (
        <div
          className={`grid w-[min(15rem,70vw)] gap-1 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onOpenPhoto(photos, index)}
              aria-label={`Open photo ${index + 1} of ${photos.length}`}
              className={`overflow-hidden rounded-[0.75rem] bg-card ${
                photos.length === 3 && index === 0 ? "col-span-2 aspect-video" : "aspect-[4/3]"
              }`}
            >
              {photo.thumbUrl ? (
                // Signed, short-lived links from private storage, so a plain image is right.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.thumbUrl} alt="" className="size-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {attachments
        .filter((item) => item.kind === "gif" && !item.removed && item.gifUrl)
        .map((gif) => (
          <span
            key={gif.id}
            className="relative block w-[min(12.5rem,60vw)] overflow-hidden rounded-[0.875rem]"
          >
            {/* From GIPHY's servers (ADD-MSG-08). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={gif.gifUrl ?? ""}
              alt="GIF"
              width={gif.width ?? undefined}
              height={gif.height ?? undefined}
              className="block h-auto w-full"
            />
            <span
              aria-hidden="true"
              className="absolute bottom-2 left-2 rounded-[0.25rem] bg-[rgba(0,0,0,0.6)] px-1.5 text-[0.625rem] font-bold text-[#fff]"
            >
              GIF
            </span>
          </span>
        ))}
      {attachments
        .filter((item) => item.kind === "document" && !item.removed)
        .map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      {gone.map((item) => (
        <p
          key={item.id}
          className="rounded-[0.75rem] border border-dashed border-border-strong px-3 py-2 text-small text-text-muted italic"
        >
          {item.kind === "photo" ? "Photo no longer available" : "File no longer available"}
        </p>
      ))}
    </>
  );
}

function DocumentCard({ doc }: { doc: ChatAttachment }) {
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  async function open() {
    setState("opening");
    const link = await attachmentLinkAction(doc.id);
    if (link) {
      window.location.assign(link);
      setState("idle");
    } else {
      setState("failed");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      className="flex w-[min(16rem,70vw)] items-center gap-3 rounded-[0.875rem] border border-border bg-surface px-3 py-2.5 text-left transition-surface hover:bg-hover"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-[0.625rem] bg-[color-mix(in_srgb,var(--dept-coral)_14%,transparent)] text-[var(--dept-coral)]"
      >
        <FileTextIcon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-small font-semibold">{doc.fileName ?? "Document"}</span>
        <span className="text-[0.75rem] text-text-muted">
          {documentLabel(doc.mimeType)}
          {doc.bytes ? ` · ${formatBytes(doc.bytes)}` : ""} ·{" "}
          {state === "opening"
            ? "Opening…"
            : state === "failed"
              ? "Couldn't open. Try again"
              : "Download"}
        </span>
      </span>
    </button>
  );
}

/** The full-size photo, loaded only when opened (saves the free plan's monthly downloads). */
export function PhotoViewer({
  photos,
  start,
  onClose,
}: {
  photos: ChatAttachment[];
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [links, setLinks] = useState<Record<string, string | null>>({});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photo = photos[index];

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!photo || photo.id in links) {
      return;
    }
    let cancelled = false;
    void attachmentLinkAction(photo.id).then((link) => {
      if (!cancelled) {
        setLinks((current) => ({ ...current, [photo.id]: link }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photo, links]);

  const link = photo ? links[photo.id] : null;
  return (
    <dialog
      ref={dialogRef}
      aria-label={`Photo ${index + 1} of ${photos.length}`}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-[#000] p-0 text-[#fff] backdrop:bg-[#000]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between p-3">
          <span className="text-small">
            {index + 1} of {photos.length}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="flex size-11 items-center justify-center rounded-pill bg-[rgba(255,255,255,0.14)]"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {link ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link}
              alt={`Photo ${index + 1}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : photo?.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.thumbUrl}
              alt=""
              className="max-h-full max-w-full object-contain blur-sm"
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between p-3">
          <button
            type="button"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            className="flex size-11 items-center justify-center rounded-pill bg-[rgba(255,255,255,0.14)] disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <span className="text-small text-[#bbb]">
            {link === null ? "This photo is no longer available." : link ? "" : "Loading…"}
          </span>
          <button
            type="button"
            aria-label="Next photo"
            disabled={index === photos.length - 1}
            onClick={() => setIndex(index + 1)}
            className="flex size-11 rotate-180 items-center justify-center rounded-pill bg-[rgba(255,255,255,0.14)] disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** The "+" in the message box: Photo, GIF, Document. */
export function AttachMenu({
  disabled,
  onPhotos,
  onDocument,
  onGif,
}: {
  disabled: boolean;
  onPhotos: () => void;
  onDocument: () => void;
  onGif: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !rootRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Add a photo, GIF or document"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex size-11 shrink-0 items-center justify-center rounded-pill text-text-secondary transition-surface hover:bg-hover disabled:opacity-45"
      >
        <PlusIcon
          className={`size-5 transition-transform motion-reduce:transition-none ${open ? "rotate-45" : ""}`}
        />
      </button>
      <div
        id={menuId}
        hidden={!open}
        className="absolute bottom-full left-0 z-20 mb-2 flex w-[min(19rem,calc(100vw-2rem))] flex-col rounded-card border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)]"
      >
        <MenuChoice
          title="Photo"
          hint="Made smaller before it's sent, up to 4"
          onClick={choose(onPhotos)}
        />
        <MenuChoice title="GIF" hint="Search GIPHY, rated G only" onClick={choose(onGif)} />
        <MenuChoice
          title="Document"
          hint="PDF, Word, Excel, PowerPoint or text, up to 10 MB"
          onClick={choose(onDocument)}
        />
      </div>
    </div>
  );
}

function MenuChoice({
  title,
  hint,
  onClick,
}: {
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-touch flex-col items-start rounded-button px-3 py-2 text-left hover:bg-hover"
    >
      <span className="font-semibold">{title}</span>
      <span className="text-small text-text-muted">{hint}</span>
    </button>
  );
}

/** GIF search (ADD-MSG-08): waits until typing stops, so the free plan's searches last. */
export function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (gif: GifResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    { status: "loading" } | { status: "off" } | { status: "ready"; results: GifResult[] }
  >({ status: "loading" });
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchGifsAction(query).then((result) => {
        if (!cancelled) {
          setState(
            result.configured ? { status: "ready", results: result.results } : { status: "off" },
          );
        }
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div
      role="dialog"
      aria-label="Choose a GIF"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-2"
    >
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Search GIPHY
        </label>
        <input
          id={inputId}
          type="search"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setState({ status: "loading" });
          }}
          placeholder="Search GIPHY"
          autoComplete="off"
          maxLength={50}
          className="min-h-control flex-1 rounded-button border border-border bg-card px-3 text-field placeholder:text-text-muted"
        />
        <button
          type="button"
          aria-label="Close GIFs"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-pill hover:bg-hover"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      {state.status === "off" ? (
        <p className="px-1 py-3 text-small text-text-secondary">
          GIFs aren&apos;t set up yet. A Platform Admin adds the GIPHY key.
        </p>
      ) : state.status === "loading" ? (
        <p className="px-1 py-3 text-small text-text-muted" role="status">
          Searching…
        </p>
      ) : state.results.length === 0 ? (
        <p className="px-1 py-3 text-small text-text-secondary">
          No GIFs for that. Try other words.
        </p>
      ) : (
        <ul className="grid max-h-56 grid-cols-3 gap-1 overflow-y-auto">
          {state.results.map((gif) => (
            <li key={gif.id}>
              <button
                type="button"
                onClick={() => onPick(gif)}
                aria-label={`Send ${gif.title}`}
                className="block aspect-square w-full overflow-hidden rounded-[0.5rem] bg-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gif.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-[0.6875rem] text-text-muted">Powered by GIPHY · Rated G only</p>
    </div>
  );
}

export type DraftFile = {
  localId: string;
  kind: "photo" | "document";
  name: string;
  previewUrl: string | null;
  bytes: number;
  state: "working" | "ready" | "failed";
};

/** What's waiting to send with the next message, with a way to remove each. */
export function DraftFiles({
  files,
  onRemove,
}: {
  files: DraftFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Waiting to send">
      {files.map((file) => (
        <li
          key={file.localId}
          className="flex items-center gap-2 rounded-card border border-border bg-card py-1.5 pr-1 pl-1.5"
        >
          {file.previewUrl ? (
            // A local preview of the picked photo; nothing leaves the phone until it's uploaded.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.previewUrl} alt="" className="size-10 rounded-[0.5rem] object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-[0.5rem] bg-surface"
            >
              <FileTextIcon className="size-5" />
            </span>
          )}
          <span className="flex max-w-40 min-w-0 flex-col text-[0.75rem]">
            <span className="truncate font-semibold">{file.name}</span>
            <span className={file.state === "failed" ? "text-error" : "text-text-muted"}>
              {file.state === "working"
                ? file.kind === "photo"
                  ? "Making it smaller and uploading…"
                  : "Uploading…"
                : file.state === "failed"
                  ? "Couldn't upload"
                  : `Ready · ${formatBytes(file.bytes)}`}
            </span>
          </span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(file.localId)}
            className="flex size-8 items-center justify-center rounded-pill hover:bg-hover"
          >
            <CloseIcon className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
