import { PageSkeleton } from "./page-skeleton";

/** Shows the moment an Admin link is clicked, inside the sidebar, before the server answers. */
export default function AdminLoading() {
  return <PageSkeleton label="Loading…" />;
}
