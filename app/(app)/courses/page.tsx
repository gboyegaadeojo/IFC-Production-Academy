import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";
import { requireActiveUser } from "@/lib/data/auth";
import { listDepartmentCards } from "@/lib/data/departments";
import { getCourseLibrary } from "@/lib/data/library";
import { LibraryBrowser } from "./library-browser";

export const metadata: Metadata = { title: "All courses" };

export default function AllCoursesPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <AllCourses />
    </Suspense>
  );
}

/** Every published course, with search and filters (SRS-CUR-017). Anyone can open any of them. */
async function AllCourses() {
  const user = await requireActiveUser();
  const categories = await listDepartmentCards(user.id);
  const courses = await getCourseLibrary(user.id, categories);
  return (
    <div className="page-container flex flex-col gap-6 py-6 sm:py-8 lg:py-10">
      <h1 className="text-title font-semibold">All courses</h1>
      <LibraryBrowser
        courses={courses}
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
