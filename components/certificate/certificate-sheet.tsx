import type { CSSProperties } from "react";
import { Literata } from "next/font/google";
import { Logo } from "@/components/brand/logo";
import { QrCode } from "@/components/qr-code";
import { formatLongDate } from "@/lib/domain/dates";
import { departmentHueVar } from "@/lib/domain/departments";

// The serif on ifcwpg.com, used only for the recipient's name (decision 4). Loaded here so only
// certificate pages download it.
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  display: "swap",
});

export type CertificateSheetProps = {
  recipientName: string;
  courseTitle: string;
  departmentName: string;
  levelNumber: number | null;
  versionNumber: number;
  issuedAt: string;
  reference: string;
  departmentHue: string;
  /** The public check page the QR code opens. */
  checkUrl: string;
  revoked: boolean;
};

/**
 * The certificate (SRS-CERT-002..004, decision 8; Design C, approved 2026-11-04): a light, landscape
 * sheet that reads the same on screen and on paper. The Signal Line mark, the recipient in Literata, the
 * course, a band of details (department and level, issue date in Winnipeg time, the reference and QR
 * code to the public check), and a signature line. It says plainly that completing training is not
 * approval to serve (SPEC §3).
 */
export function CertificateSheet(props: CertificateSheetProps) {
  const hue = { "--dept": departmentHueVar(props.departmentHue) } as CSSProperties;
  const checkHost = new URL(props.checkUrl).host;

  return (
    <article
      aria-labelledby="certificate-heading"
      style={{ ...hue, page: "certificate" } as CSSProperties}
      className={`${literata.variable} relative mx-auto w-full max-w-4xl overflow-hidden rounded-card bg-paper text-paper-ink sm:aspect-[11/8.5] print:aspect-auto print:h-[188mm] print:max-w-none print:rounded-none`}
    >
      {/* The department's colour, across the top edge. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-2.5 bg-[var(--dept)]" />

      <div className="relative flex h-full flex-col items-center justify-between gap-5 px-5 pt-9 pb-5 text-center sm:px-12 sm:pt-11 sm:pb-6">
        <div className="flex items-center gap-3.5">
          {/* Paper is always light, so the light colourway whatever the screen's theme. */}
          <Logo variant="mark" tone="light" size={46} label="" decorative />
          <div className="flex flex-col text-left">
            <p className="font-mono text-small font-medium tracking-[0.16em] uppercase">
              IFC Production Academy
            </p>
            <p className="font-mono text-small tracking-[0.16em] text-paper-muted uppercase">
              Certificate of completion
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <p className="text-paper-muted">This certifies that</p>
          <h1
            id="certificate-heading"
            className="pb-1 font-serif text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-medium tracking-[-0.01em] text-balance"
          >
            {props.recipientName}
          </h1>
          <p className="text-paper-muted">has completed</p>
          <p className="text-[clamp(1.25rem,1.1rem+0.7vw,1.625rem)] leading-snug font-semibold text-balance">
            {props.courseTitle}
          </p>
        </div>

        {/* The facts sit together under the course (Design C, approved 2026-11-04), so no space collects. */}
        <div className="grid w-full grid-cols-2 divide-paper-rule rounded-button border border-paper-rule bg-[color-mix(in_srgb,var(--dept)_6%,var(--paper))] text-left sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:divide-x">
          <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3">
            <p className="font-mono text-small tracking-[0.1em] text-paper-muted uppercase">
              {props.levelNumber === null ? "Category" : "Department"}
            </p>
            <p className="font-semibold">{props.departmentName}</p>
            {props.levelNumber === null ? null : (
              <p className="flex items-center gap-1.5 text-paper-muted">
                <LevelBadge level={props.levelNumber} />
                Level {props.levelNumber}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3">
            <p className="font-mono text-small tracking-[0.1em] text-paper-muted uppercase">
              Issued
            </p>
            <p className="font-semibold">{formatLongDate(props.issuedAt)}</p>
            <p className="text-paper-muted">Course version {props.versionNumber}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 border-t border-paper-rule px-3.5 py-3 sm:border-t-0">
            <p className="font-mono text-small tracking-[0.1em] text-paper-muted uppercase">
              Check it
            </p>
            <p className="font-mono text-small font-medium tabular-nums">{props.reference}</p>
            <p className="text-small break-all text-paper-muted">{checkHost}/verify</p>
          </div>
          <div className="flex items-center justify-center border-t border-paper-rule px-3 py-2.5 sm:border-t-0">
            <QrCode
              value={props.checkUrl}
              label={`QR code to check certificate ${props.reference}`}
              size={72}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div aria-hidden="true" className="h-px w-52 bg-paper-ink" />
          <p className="font-semibold">Production Director</p>
          <p className="text-paper-muted">Immanuel Fellowship Church</p>
        </div>

        <p className="max-w-2xl text-small text-balance text-paper-muted">
          This certificate records completed training. Approval to serve is given separately,
          through practical assessment.
        </p>
      </div>

      {props.revoked ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="-rotate-12 rounded-button border-4 border-paper-ink/70 px-6 py-2 font-mono text-[clamp(1.5rem,1rem+2vw,2.5rem)] font-medium tracking-[0.2em] text-paper-ink/70 uppercase">
            Withdrawn
          </span>
        </div>
      ) : null}
    </article>
  );
}

/** The level in a ring of the department's hue (ADD-CERT-01). */
function LevelBadge({ level }: { level: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-5 items-center justify-center rounded-pill border-[1.5px] border-[var(--dept)] font-mono text-small font-medium text-paper-ink tabular-nums"
    >
      {level}
    </span>
  );
}
