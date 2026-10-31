import { AcademyHeader } from "@/components/shell/academy-header";

/**
 * Signed-in shell (DESIGN §3): the shared header, then each page chooses its own width. Learner
 * pages use page-container; the admin workspace adds its sidebar in admin/layout.tsx.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AcademyHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
