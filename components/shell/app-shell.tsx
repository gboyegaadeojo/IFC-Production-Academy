import type { ReactNode } from "react";
import { Suspense } from "react";
import { AcademyHeader, AcademySidebar } from "@/components/shell/academy-header";
import { AlertsSetupBanner } from "@/components/shell/alerts-setup-banner";
import { AppIconBadge } from "@/components/shell/app-icon-badge";
import { AppOpenRecorder } from "@/components/pwa/app-open-recorder";
import { AcademyTabBar } from "@/components/shell/academy-nav";
import { HideOnAdmin } from "@/components/shell/hide-on-admin";
import { MessagesAwareTabBar, MessagesLiveUpdates } from "@/components/shell/messages-nav";
import { getCurrentUser } from "@/lib/data/auth";
import { getAlertsSetupNeeded } from "@/lib/data/push";

/**
 * Signed-in shell (DESIGN §3): the learner side bar from 768px, or the slim bar and tab bar on
 * phones, and each page chooses its own width. Learner pages use page-container; the admin
 * workspace replaces all of it with its own sidebar (admin/layout.tsx). Only for signed-in pages:
 * its links lead to screens that need an account.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <HideOnAdmin>
        <AcademyHeader />
      </HideOnAdmin>
      {/* Clip, not hidden: nothing too wide can slide the page sideways on a phone, and the
          sticky side bar still sticks. Rows meant to scroll sideways scroll inside their own box. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip md:flex-row">
        <HideOnAdmin>
          <AcademySidebar />
        </HideOnAdmin>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <HideOnAdmin>
            <Suspense fallback={null}>
              <AlertsSetup />
            </Suspense>
          </HideOnAdmin>
          {children}
        </main>
      </div>
      <Suspense fallback={<AcademyTabBar />}>
        <MessagesAwareTabBar />
      </Suspense>
      <AppIconBadge />
      <Suspense fallback={null}>
        <MessagesLiveUpdates />
      </Suspense>
      <AppOpenRecorder />
    </>
  );
}

/** Only people on a team without a phone set up are asked. It never blocks the page. */
async function AlertsSetup() {
  const user = await getCurrentUser();
  return user?.status === "active" && (await getAlertsSetupNeeded()) ? <AlertsSetupBanner /> : null;
}
