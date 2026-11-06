import { AppShell } from "@/components/shell/app-shell";

/** Every signed-in page sits in the app shell; each page checks the person is signed in. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
