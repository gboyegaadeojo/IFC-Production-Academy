import type { TeamRow } from "@/lib/domain/service-dashboard";

/** Who's serving, by position. "Trained" and "Still learning" are shown and never a gate. */
export function TeamTile({ team }: { team: TeamRow[] }) {
  if (team.length === 0) {
    return <p className="text-small text-text-secondary">Nobody is scheduled yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {team.map((row) => (
        <li
          key={row.positionId}
          className="flex items-baseline justify-between gap-2 py-1 text-small"
        >
          <span className="min-w-0">
            {row.name ?? "Open"}
            <span className="block text-[0.6875rem] text-text-muted">{row.roleName}</span>
          </span>
          {row.label ? (
            <span
              className={`shrink-0 text-[0.6875rem] font-medium ${
                row.label === "Trained" ? "text-success" : "text-warning"
              }`}
            >
              {row.label}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
