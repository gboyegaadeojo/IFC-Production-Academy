import type { CSSProperties } from "react";
import { Literata } from "next/font/google";
import { IfcMark } from "@/components/brand";
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
  levelNumber: number;
  versionNumber: number;
  issuedAt: string;
  reference: string;
  departmentHue: string;
  /** The public check page the QR code opens. */
  checkUrl: string;
  revoked: boolean;
};

/**
 * The certificate (SRS-CERT-002..004, decision 8): a light, landscape sheet that reads the same on
 * screen and on paper. The IFC mark, the recipient in Literata, the course, department, and level,
 * the issue date in Winnipeg time, a signature line, and a QR code to the public check. It says
 * plainly that completing training is not approval to serve (SPEC §3).
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
      {/* The department's colour band, down the left edge. */}
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-2 bg-[var(--dept)] sm:w-3" />
      {/* A hairline frame inside the edge, like a printed certificate. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-3 rounded-[6px] border border-paper-rule sm:inset-5"
      />

      <div className="relative flex h-full flex-col items-center gap-5 px-8 py-10 text-center sm:gap-4 sm:px-16 sm:py-12">
        <div className="flex flex-col items-center gap-2">
          <IfcMark tone="black" height={52} />
          <p className="font-mono text-[0.75rem] font-medium tracking-[0.22em] text-paper-muted uppercase">
            Production Academy
          </p>
        </div>

        <p className="font-mono text-[0.8125rem] font-medium tracking-[0.18em] uppercase">
          Certificate of completion
        </p>

        <div className="flex flex-col items-center gap-2">
          <p className="text-paper-muted">This certifies that</p>
          <h1
            id="certificate-heading"
            className="font-serif text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-medium tracking-[-0.01em] text-balance"
          >
            {props.recipientName}
          </h1>
          <p className="text-paper-muted">has completed</p>
          <p className="text-[clamp(1.25rem,1.1rem+0.7vw,1.625rem)] leading-snug font-semibold text-balance">
            {props.courseTitle}
          </p>
          <p className="flex items-center gap-2 text-paper-muted">
            <LevelBadge level={props.levelNumber} />
            <span>
              {props.departmentName} · Level {props.levelNumber}
            </span>
          </p>
        </div>

        <div className="mt-auto grid w-full grid-cols-1 items-end gap-6 pt-2 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-1 sm:items-start sm:text-left">
            <p className="font-mono text-[0.75rem] tracking-[0.12em] text-paper-muted uppercase">
              Issued
            </p>
            <p className="font-medium">{formatLongDate(props.issuedAt)}</p>
            <p className="text-[0.8125rem] text-paper-muted">
              Course version {props.versionNumber}
            </p>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div aria-hidden="true" className="h-px w-48 bg-paper-ink" />
            <p className="text-[0.8125rem] font-medium">Production Director</p>
            <p className="text-[0.8125rem] text-paper-muted">Immanuel Fellowship Church</p>
          </div>

          <div className="flex items-center justify-center gap-3 sm:justify-end sm:text-right">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[0.75rem] font-medium tabular-nums">{props.reference}</p>
              <p className="text-[0.8125rem] text-paper-muted">
                Check it at
                <br />
                {checkHost}/verify
              </p>
            </div>
            <QrCode
              value={props.checkUrl}
              label={`QR code to check certificate ${props.reference}`}
              size={84}
            />
          </div>
        </div>

        <p className="max-w-xl text-[0.8125rem] text-paper-muted">
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
      className="inline-flex size-7 items-center justify-center rounded-pill border-2 border-[var(--dept)] font-mono text-[0.8125rem] font-medium text-paper-ink tabular-nums"
    >
      {level}
    </span>
  );
}
