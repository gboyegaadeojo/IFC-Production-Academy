import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";

// Pages opened from private email links, with no sign-in (ADD-COPY-04, -05, -10). Never indexed,
// and never sending the link on to another site.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PrivateLinkLayout({ children }: LayoutProps<"/copyright">) {
  return (
    <main id="main" className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        <Wordmark />
        {children}
      </div>
    </main>
  );
}
