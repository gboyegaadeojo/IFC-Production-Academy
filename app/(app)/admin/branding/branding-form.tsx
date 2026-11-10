"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { fieldClasses } from "@/components/ui/field-classes";
import { Button } from "@/components/ui/button";
import {
  BRAND_ICON_SIZE,
  DEFAULT_BRANDING,
  ICON_BACKGROUNDS,
  iconInitials,
  SHORT_NAME_FITS,
} from "@/lib/domain/branding";
import { saveBrandingAction } from "./actions";

type IconPick = "keep" | "original" | "mark" | "cross" | "initials" | "upload";

const SIZE = BRAND_ICON_SIZE;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** Draws the chosen logo at full size: the same picture is previewed and uploaded. */
async function drawIcon(
  canvas: HTMLCanvasElement,
  pick: IconPick,
  background: string,
  shortName: string,
  upload: string | null,
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const ink = background === "#ffffff" ? "#16141f" : "#ffffff";
  if (pick === "upload" && upload) {
    const image = await loadImage(upload);
    const scale = Math.max(SIZE / image.width, SIZE / image.height);
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(
      image,
      (SIZE - image.width * scale) / 2,
      (SIZE - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    return;
  }
  // Keep the mark inside Android's safe area: the middle 80% of the icon.
  if (pick === "mark") {
    const image = await loadImage(
      `/brand/ifc-mark-${background === "#ffffff" ? "black" : "white"}.png`,
    );
    const width = SIZE * 0.62;
    const height = width * (image.height / image.width);
    context.fillStyle = background;
    context.fillRect(0, 0, SIZE, SIZE);
    context.drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
    return;
  }
  context.fillStyle = background;
  context.fillRect(0, 0, SIZE, SIZE);
  context.fillStyle = ink;
  context.strokeStyle = ink;
  if (pick === "cross") {
    context.lineWidth = SIZE * 0.075;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(SIZE / 2, SIZE * 0.22);
    context.lineTo(SIZE / 2, SIZE * 0.78);
    context.moveTo(SIZE * 0.31, SIZE * 0.4);
    context.lineTo(SIZE * 0.69, SIZE * 0.4);
    context.stroke();
    return;
  }
  const initials = iconInitials(shortName);
  context.font = `700 ${initials.length > 2 ? SIZE * 0.28 : SIZE * 0.36}px Inter, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(initials, SIZE / 2, SIZE / 2);
}

const PICKS: { key: IconPick; label: string }[] = [
  { key: "mark", label: "IFC mark" },
  { key: "cross", label: "Cross" },
  { key: "initials", label: "Initials" },
];

/** Names, a logo made here or uploaded, and previews of how a phone shows them. */
export function BrandingForm({
  initialName,
  initialShortName,
  currentIconUrl,
}: {
  initialName: string;
  initialShortName: string;
  currentIconUrl: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [shortName, setShortName] = useState(initialShortName);
  const [pick, setPick] = useState<IconPick>(currentIconUrl ? "keep" : "original");
  const [background, setBackground] = useState<string>(ICON_BACKGROUNDS[0]);
  const [upload, setUpload] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [saving, startSaving] = useTransition();
  const canvas = useRef<HTMLCanvasElement>(null);

  const original = pick === "original";
  const keep = pick === "keep";

  useEffect(() => {
    if (original || keep || !canvas.current) {
      return;
    }
    const target = canvas.current;
    let stale = false;
    void drawIcon(target, pick, background, shortName, upload)
      .then(() => {
        if (!stale) {
          setPreview(target.toDataURL("image/png"));
        }
      })
      .catch(() => {
        setMessage({ text: "That logo couldn't be read. Try a PNG or JPEG file.", failed: true });
      });
    return () => {
      stale = true;
    };
  }, [pick, background, shortName, upload, original, keep]);

  const shownIcon = original ? "/icons/icon-512.png" : keep ? currentIconUrl : preview;

  function onFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setUpload(URL.createObjectURL(file));
    setPick("upload");
    setMessage(null);
  }

  function save() {
    startSaving(async () => {
      const form = new FormData();
      form.set("name", name);
      form.set("shortName", shortName);
      if (original) {
        form.set("iconChoice", "original");
      } else if (keep) {
        form.set("iconChoice", "keep");
      } else {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.current?.toBlob(resolve, "image/png"),
        );
        if (!blob) {
          setMessage({ text: "That logo couldn't be read. Try a PNG or JPEG file.", failed: true });
          return;
        }
        form.set("iconChoice", "new");
        form.set("icon", new File([blob], "icon.png", { type: "image/png" }));
      }
      const result = await saveBrandingAction(form);
      setMessage({ text: result.message, failed: !result.ok });
    });
  }

  function reset() {
    setName(DEFAULT_BRANDING.name);
    setShortName(DEFAULT_BRANDING.shortName);
    setPick("original");
    setUpload(null);
    setMessage({ text: "Back to the original name and logo. Save to keep it.", failed: false });
  }

  const tooLong = shortName.trim().length > SHORT_NAME_FITS;
  const pickClasses = (active: boolean) =>
    `flex min-w-20 flex-col items-center gap-1 rounded-card border-2 p-2 text-small ${
      active ? "border-accent-light font-medium" : "border-border"
    }`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="brand-name" className="text-small font-medium text-text-secondary">
            App name
          </label>
          <input
            id="brand-name"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            className={fieldClasses}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="brand-short" className="text-small font-medium text-text-secondary">
            Short name, under the home screen icon
          </label>
          <input
            id="brand-short"
            value={shortName}
            maxLength={24}
            aria-describedby="brand-short-hint"
            onChange={(event) => setShortName(event.target.value)}
            className={fieldClasses}
          />
          <p
            id="brand-short-hint"
            className={`text-small ${tooLong ? "font-medium text-warning" : "text-text-muted"}`}
          >
            {tooLong
              ? `Phones may cut this off. Try ${SHORT_NAME_FITS} characters or fewer.`
              : `${SHORT_NAME_FITS} characters or fewer fits best.`}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium text-text-secondary">Logo</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={original}
              onClick={() => setPick("original")}
              className={pickClasses(original)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/icon-192.png"
                alt=""
                width={44}
                height={44}
                className="rounded-button"
              />
              Original
            </button>
            {currentIconUrl ? (
              <button
                type="button"
                aria-pressed={keep}
                onClick={() => setPick("keep")}
                className={pickClasses(keep)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentIconUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="rounded-button"
                />
                Current
              </button>
            ) : null}
            {PICKS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={pick === option.key}
                onClick={() => setPick(option.key)}
                className={pickClasses(pick === option.key)}
              >
                {option.label}
              </button>
            ))}
            {upload ? (
              <button
                type="button"
                aria-pressed={pick === "upload"}
                onClick={() => setPick("upload")}
                className={pickClasses(pick === "upload")}
              >
                Your file
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="brand-file" className="text-small font-medium text-text-secondary">
              Or upload a square PNG or JPEG
            </label>
            <input
              id="brand-file"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => onFile(event.target.files?.[0])}
              className="text-small"
            />
          </div>
        </fieldset>

        {pick === "mark" || pick === "cross" || pick === "initials" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-small font-medium text-text-secondary">Icon background</legend>
            <div className="flex flex-wrap gap-2">
              {ICON_BACKGROUNDS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={`Icon background ${colour}`}
                  aria-pressed={background === colour}
                  onClick={() => setBackground(colour)}
                  style={{ background: colour }}
                  className={`size-8 rounded-pill border-2 border-border-strong ${
                    background === colour ? "outline-2 outline-offset-2 outline-accent-light" : ""
                  }`}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <canvas ref={canvas} width={SIZE} height={SIZE} hidden />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={reset}>
            Reset
          </Button>
        </div>
        <p
          role="status"
          className={`min-h-5 text-small ${message?.failed ? "text-error" : "text-text-secondary"}`}
        >
          {message?.text}
        </p>
        <p className="text-small text-text-muted">
          Certificates already issued keep the name they were issued under, so history isn&apos;t
          rewritten. Every save is written to the Audit log.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-center gap-6">
          <PhonePreview
            label="iPhone"
            icon={shownIcon}
            shortName={shortName}
            iconClass="rounded-[22%]"
          />
          <PhonePreview
            label="Android"
            icon={shownIcon}
            shortName={shortName}
            iconClass="rounded-full"
          />
        </div>
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 text-small text-text-secondary">
          <p>
            <strong className="text-text">Browser tab: </strong>
            {name}
          </p>
          <p>
            <strong className="text-text">iPhone: </strong>
            People who already installed the app will most likely need to remove it and add it again
            to see the new icon and name.
          </p>
          <p>
            <strong className="text-text">Android: </strong>
            Chrome picks up changes by itself after the app is closed and the phone is charging on
            Wi-Fi, which can take days. The name may not change in every case.
          </p>
          <p>
            <strong className="text-text">No app stores: </strong>
            The app installs from the browser, so this needs no App Store or Google Play update.
          </p>
        </div>
      </div>
    </div>
  );
}

function PhonePreview({
  label,
  icon,
  shortName,
  iconClass,
}: {
  label: string;
  icon: string | null;
  shortName: string;
  iconClass: string;
}) {
  const blanks = Array.from({ length: 7 }, (_, index) => index);
  return (
    <figure className="flex flex-col items-center gap-1">
      <figcaption className="text-small font-medium">{label}</figcaption>
      <div className="grid h-64 w-44 grid-cols-4 content-start gap-x-1.5 gap-y-3 rounded-[1.75rem] border-4 border-border-strong bg-card p-3">
        <div className="col-span-1 flex min-w-0 flex-col items-center gap-0.5">
          {icon ? (
            // A preview made in this browser, or the file in storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" width={32} height={32} className={`size-8 ${iconClass}`} />
          ) : (
            <span className={`size-8 bg-hover ${iconClass}`} />
          )}
          <span className="w-full truncate text-center text-[0.5625rem] text-text">
            {shortName}
          </span>
        </div>
        {blanks.map((blank) => (
          <span
            key={blank}
            aria-hidden="true"
            className={`size-8 justify-self-center bg-hover ${iconClass}`}
          />
        ))}
      </div>
    </figure>
  );
}
