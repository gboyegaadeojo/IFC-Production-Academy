import { redirect } from "next/navigation";

/** This page is now Explore (G, 2026-11-04). Old links keep working, with their topic. */
export default async function VideosPage({ searchParams }: PageProps<"/videos">) {
  const { topic } = await searchParams;
  redirect(typeof topic === "string" ? `/explore?topic=${encodeURIComponent(topic)}` : "/explore");
}
