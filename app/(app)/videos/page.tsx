import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards } from "@/lib/data/departments";
import { getVideoLibrary, listTopics } from "@/lib/data/topics";
import { VideoBrowser } from "./video-browser";

export const metadata: Metadata = { title: "Videos" };

export default function VideosPage({ searchParams }: PageProps<"/videos">) {
  return (
    <Suspense fallback={<VideosSkeleton />}>
      <Videos searchParams={searchParams} />
    </Suspense>
  );
}

/** Find a lesson's video by search and filters (SRS-CUR-019). Anyone can open any of them. */
async function Videos({ searchParams }: Pick<PageProps<"/videos">, "searchParams">) {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  const [videos, topics, params] = await Promise.all([
    getVideoLibrary(categories),
    listTopics(),
    searchParams,
  ]);
  const chosen = topics.find((topic) => topic.id === params.topic);
  return (
    <div className="page-container flex flex-col gap-5 py-6 sm:py-8 lg:py-10">
      <h1 className="text-title font-semibold">Videos</h1>
      <VideoBrowser
        videos={videos}
        topics={topics}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        initialTopicIds={chosen ? [chosen.id] : []}
      />
    </div>
  );
}

function VideosSkeleton() {
  return (
    <div className="page-container flex flex-col gap-5 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the videos…" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 max-w-xl" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="aspect-video" />
        ))}
      </div>
    </div>
  );
}
