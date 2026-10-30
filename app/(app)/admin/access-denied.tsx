import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

/** The permission-denied state every admin screen needs (SPEC §8). */
export function AccessDenied() {
  return (
    <section
      aria-labelledby="access-denied-heading"
      className="flex max-w-xl flex-col gap-4 rounded-card border border-border bg-card p-8"
    >
      <h1 id="access-denied-heading" className="text-heading font-semibold">
        This area isn&apos;t open to you
      </h1>
      <p className="text-text-secondary">
        Your role doesn&apos;t include this. If you think it should, talk to the Production Director
        or a Platform Admin.
      </p>
      <Link href="/home" className={buttonClasses("secondary", "self-start")}>
        Back to home
      </Link>
    </section>
  );
}
