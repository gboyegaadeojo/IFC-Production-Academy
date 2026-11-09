import type { CSSProperties } from "react";
import { DepartmentIcon } from "@/components/department-icon";
import { UsersIcon } from "@/components/ui/icons";
import { departmentHueVar } from "@/lib/domain/departments";
import { avatarInitials, type ConversationKind } from "@/lib/domain/messages";

/**
 * A chat's picture (option C, approved 2026-11-08): a department's icon on a tile in its colour, a
 * group's people on a purple tile, or a person's initials in a ring of their department's colour.
 * Decorative: the name next to it carries the meaning.
 */
export function ChatAvatar({
  kind,
  name,
  hue,
  icon,
  size = "md",
}: {
  kind: ConversationKind | "person";
  name: string;
  hue: string | null;
  icon?: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-8 text-[0.6875rem]" : "size-11 text-small";
  const style = { "--dept": departmentHueVar(hue ?? "") } as CSSProperties;
  if (kind === "department") {
    return (
      <span
        aria-hidden="true"
        style={style}
        className={`${box} flex shrink-0 items-center justify-center rounded-[0.75rem] bg-[color-mix(in_srgb,var(--dept)_16%,var(--surface))] text-[var(--dept)]`}
      >
        <DepartmentIcon icon={icon ?? "people"} className="size-5" />
      </span>
    );
  }
  if (kind === "group") {
    return (
      <span
        aria-hidden="true"
        className={`${box} flex shrink-0 items-center justify-center rounded-[0.75rem] bg-accent-soft text-accent-light`}
      >
        <UsersIcon className="size-5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`${box} flex shrink-0 items-center justify-center rounded-pill bg-card font-bold text-text shadow-[inset_0_0_0_2px_var(--dept)]`}
    >
      {avatarInitials(name)}
    </span>
  );
}
