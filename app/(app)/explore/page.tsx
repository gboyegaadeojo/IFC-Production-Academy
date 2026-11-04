import type { Metadata } from "next";
import { Suspense } from "react";
import { LibrarySwitch } from "@/components/shell/library-switch";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards } from "@/lib/data/departments";
import { getCourseLibrary } from "@/lib/data/library";
import { getVideoLibrary, listTopics } from "@/lib/data/topics";
import { ExploreBrowser } from "./explore-browser";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <Explore searchParams={searchParams} />
    </Suspense>
  );
}

/** Find courses and single videos by search and filters (SRS-CUR-019). Anyone can open any of them. */
async function Explore({ searchParams }: Pick<PageProps<"/explore">, "searchParams">) {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  const [courses, videos, topics, params] = await Promise.all([
    getCourseLibrary(user.id, categories),
    getVideoLibrary(categories),
    listTopics(),
    searchParams,
  ]);
  const chosen = topics.find((topic) => topic.id === params.topic);
  return (
    <div className="page-container flex flex-col gap-5 py-6 sm:py-8 lg:py-10">
      <LibrarySwitch current="explore" />
      <h1 className="text-title font-semibold">Explore</h1>
      <ExploreBrowser
        courses={courses}
        videos={videos}
        topics={topics}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        initialTopicIds={chosen ? [chosen.id] : []}
      />
    </div>
  );
}

function ExploreSkeleton() {
  return (
    <div className="page-container flex flex-col gap-5 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading…" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 max-w-xl" />
      <Skeleton className="h-40 max-w-[40rem]" />
    </div>
  );
}
