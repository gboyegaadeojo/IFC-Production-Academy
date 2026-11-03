import { Tabs } from "@/components/ui/tabs";
import type { CapabilityGrant } from "@/lib/domain/capabilities";
import { hasCapability } from "@/lib/domain/capabilities";

export type SetupTab = "layout" | "channels" | "editors" | "connections" | "screens";

/** Service Dashboard setup's parts. Each shows only to people who can use it. */
export function SetupTabs({ current, grants }: { current: SetupTab; grants: CapabilityGrant[] }) {
  return (
    <Tabs
      label="Service Dashboard setup"
      tabs={[
        { href: "/admin/service-dashboard", label: "Layout", current: current === "layout" },
        {
          href: "/admin/service-dashboard/channels",
          label: "Mixer channels",
          current: current === "channels",
        },
        ...(hasCapability(grants, "dashboard.manage")
          ? [
              {
                href: "/admin/service-dashboard/editors",
                label: "Editors",
                current: current === "editors",
              },
              {
                href: "/admin/service-dashboard/connections",
                label: "Connections",
                current: current === "connections",
              },
            ]
          : []),
        {
          href: "/admin/service-dashboard/screens",
          label: "Screens",
          current: current === "screens",
        },
      ]}
    />
  );
}
