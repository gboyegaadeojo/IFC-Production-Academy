import { Tabs } from "@/components/ui/tabs";
import type { CapabilityGrant } from "@/lib/domain/capabilities";
import { hasCapability } from "@/lib/domain/capabilities";

export type SetupTab = "layout" | "editors";

/** Service Dashboard setup's parts. Each shows only to people who can use it. */
export function SetupTabs({ current, grants }: { current: SetupTab; grants: CapabilityGrant[] }) {
  return (
    <Tabs
      label="Service Dashboard setup"
      tabs={[
        { href: "/admin/service-dashboard", label: "Layout", current: current === "layout" },
        ...(hasCapability(grants, "dashboard.manage")
          ? [
              {
                href: "/admin/service-dashboard/editors",
                label: "Editors",
                current: current === "editors",
              },
            ]
          : []),
      ]}
    />
  );
}
