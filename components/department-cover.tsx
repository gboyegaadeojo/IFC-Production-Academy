import type { CSSProperties } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { departmentHueVar } from "@/lib/domain/departments";

/**
 * Department cover (DESIGN §2, §6.2). Until IFC's own photography exists, this is an intentional
 * placeholder, not a fake photo: a camera-viewfinder frame with rule-of-thirds guides and the
 * department's line icon in its identity hue. Decorative, so hidden from assistive technology.
 */
export function DepartmentCover({
  hue,
  icon,
  label,
  className = "",
}: {
  hue: string;
  icon: string;
  label: string;
  className?: string;
}) {
  const style = { "--dept": departmentHueVar(hue) } as CSSProperties;
  const corner = "absolute size-4 border-[var(--dept)]";
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`relative aspect-[16/9] overflow-hidden bg-surface ${className}`}
    >
      {/* Rule-of-thirds guides. */}
      <span className="absolute inset-y-0 left-1/3 w-px bg-border/60" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-border/60" />
      <span className="absolute inset-x-0 top-1/3 h-px bg-border/60" />
      <span className="absolute inset-x-0 top-2/3 h-px bg-border/60" />
      {/* Viewfinder corners in the department hue. */}
      <span className={`${corner} top-3 left-3 border-t-2 border-l-2`} />
      <span className={`${corner} top-3 right-3 border-t-2 border-r-2`} />
      <span className={`${corner} bottom-3 left-3 border-b-2 border-l-2`} />
      <span className={`${corner} right-3 bottom-3 border-r-2 border-b-2`} />
      <span className="absolute inset-0 flex items-center justify-center text-[var(--dept)]">
        <DepartmentIcon icon={icon} className="size-12 sm:size-14" />
      </span>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[0.6875rem] tracking-[0.14em] whitespace-nowrap text-text-muted uppercase">
        {label}
      </span>
    </div>
  );
}
