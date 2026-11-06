import { MonitorIcon } from "@/components/ui/icons";
import { getCurrentUser } from "@/lib/data/auth";
import { canViewServiceDashboard } from "@/lib/data/service-dashboard";
import { AcademyNavLink } from "./academy-nav";

/**
 * The side bar link to the Service Dashboard, for people who may open it, on computers only
 * (ADD-DASH-02). Offering it here is a convenience: the page checks access on the server too.
 */
export async function ServiceDashboardNavLink() {
  const user = await getCurrentUser();
  if (user?.status !== "active" || !(await canViewServiceDashboard())) {
    return null;
  }
  return (
    <li className="only-on-computer">
      <AcademyNavLink
        href="/service-dashboard"
        label="Service Dashboard"
        icon={<MonitorIcon className="size-5" />}
      />
    </li>
  );
}
