// Text wordmark until IFC brand assets are confirmed (SPEC §9 open decision 4).
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span className="rounded-[4px] border border-text/80 px-1.5 py-px font-mono text-[0.75rem] font-medium tracking-[0.08em] text-text">
        IFC
      </span>{" "}
      <span className="text-body font-medium tracking-tight text-text">
        Production <span className="text-text-secondary">Academy</span>
      </span>
    </span>
  );
}
