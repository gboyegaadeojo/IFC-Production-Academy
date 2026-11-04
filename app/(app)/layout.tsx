import { AcademyHeader, AcademySidebar } from "@/components/shell/academy-header";
import { AcademyTabBar } from "@/components/shell/academy-nav";
import { HideOnAdmin } from "@/components/shell/hide-on-admin";

/**
 * Signed-in shell (DESIGN §3): the learner side bar from 768px, or the slim bar and tab bar on
 * phones, and each page chooses its own width. Learner pages use page-container; the admin
 * workspace replaces all of it with its own sidebar (admin/layout.tsx).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <HideOnAdmin>
        <AcademyHeader />
      </HideOnAdmin>
      <div className="flex min-w-0 flex-1 flex-col md:flex-row">
        <HideOnAdmin>
          <AcademySidebar />
        </HideOnAdmin>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
      <AcademyTabBar />
    </>
  );
}
