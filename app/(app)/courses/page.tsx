import type { Metadata } from "next";
import { Suspense } from "react";
import { LibrarySwitch } from "@/components/shell/library-switch";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards } from "@/lib/data/departments";
import { getCourseLibrary } from "@/lib/data/library";
import { listTopics } from "@/lib/data/topics";
import { LibraryBrowser } from "./library-browser";

export const metadata: Metadata = { title: "Courses" };

export default function AllCoursesPage({ searchParams }: PageProps<"/courses">) {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <AllCourses searchParams={searchParams} />
    </Suspense>
  );
}

/** Every published course, with search and filters (SRS-CUR-017). Anyone can open any of them. */
async function AllCourses({ searchParams }: Pick<PageProps<"/courses">, "searchParams">) {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  const [courses, topics, params] = await Promise.all([
    getCourseLibrary(user.id, categories),
    listTopics(),
    searchParams,
  ]);
  const chosen = topics.find((topic) => topic.id === params.topic);
  return (
    <div className="page-container flex flex-col gap-6 py-6 sm:py-8 lg:py-10">
      <LibrarySwitch current="courses" />
      <h1 className="text-title font-semibold">Courses</h1>
      <LibraryBrowser
        courses={courses}
        topics={topics}
        initialTopicIds={chosen ? [chosen.id] : []}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          sortOrder: c.sortOrder,
        }))}
      />
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="page-container flex flex-col gap-6 py-8 lg:py-10" aria-busy="true">
      <LoadingStatus label="Loading the courses…" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 max-w-xl" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="aspect-[3/4]" />
        ))}
      </div>
    </div>
  );
}
