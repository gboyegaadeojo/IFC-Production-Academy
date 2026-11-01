import { AcademyHeader } from "@/components/shell/academy-header";
import { HideOnAdmin } from "@/components/shell/hide-on-admin";

/**
 * Signed-in shell (DESIGN §3): the shared header, then each page chooses its own width. Learner
 * pages use page-container; the admin workspace replaces the header with its sidebar
 * (admin/layout.tsx).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <HideOnAdmin>
        <AcademyHeader />
      </HideOnAdmin>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
