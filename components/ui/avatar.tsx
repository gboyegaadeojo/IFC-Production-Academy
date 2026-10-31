import { initials } from "@/lib/domain/people";

/** Initials avatar. Decorative: the person's name is always shown next to it. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-7 text-[0.6875rem]", md: "size-9 text-small", lg: "size-12 text-body" };
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-pill border border-border-strong bg-card font-medium text-text ${sizes[size]}`}
    >
      {initials(name)}
    </span>
  );
}
