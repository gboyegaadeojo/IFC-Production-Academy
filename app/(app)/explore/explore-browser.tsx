"use client";

import { useMemo, useState } from "react";
import { CoursePoster } from "@/components/course-poster";
import { TopicFilter } from "@/components/topic-filter";
import { compactFieldClasses } from "@/components/ui/field-classes";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { VideoCard } from "@/components/video-card";
import { filterLibrary, type LibraryCourse } from "@/lib/domain/library";
import { filterVideos, videoCountLabel, type LibraryVideo } from "@/lib/domain/videos";

type Category = { id: string; name: string; kind: string };
type Topic = { id: string; name: string };

/**
 * Courses first, then single videos (G, 2026-11-04). The page opens on its filters, and results only
 * show once someone searches or chooses one, so it never reads as every course lesson by lesson.
 * Filters run in the browser, since everything the person can see is already here.
 */
export function ExploreBrowser({
  courses,
  videos,
  topics,
  categories,
  initialTopicIds,
}: {
  courses: LibraryCourse[];
  videos: LibraryVideo[];
  topics: Topic[];
  categories: Category[];
  initialTopicIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [level, setLevel] = useState("");
  const [topicIds, setTopicIds] = useState(initialTopicIds);
  const filter = { search, categoryId, level, topicIds };
  const shownVideos = useMemo(
    () => filterVideos(videos, { search, categoryId, level, topicIds }),
    [videos, search, categoryId, level, topicIds],
  );
  const shownCourses = useMemo(
    () => filterLibrary(courses, { search, categoryId, level, topicIds }),
    [courses, search, categoryId, level, topicIds],
  );
  const levels = [...new Set(courses.flatMap((course) => course.level ?? []))].toSorted();
  const filtered = Boolean(filter.search || categoryId || level || topicIds.length);
  const withCourses = categories.filter((category) =>
    courses.some((course) => course.category.id === category.id),
  );
  const options = (kind: string) =>
    withCourses
      .filter((category) => category.kind === kind)
      .map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ));
  /** How many of a course's videos are in these results, for its poster. */
  const matchNote = (courseId: string) => {
    const count = shownVideos.filter((video) => video.courseId === courseId).length;
    return count === 0 ? undefined : `${count} matching ${count === 1 ? "video" : "videos"}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search courses and videos"
          aria-label="Search courses and videos"
          className={`${compactFieldClasses} max-w-md min-w-44 flex-1`}
        />
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className={`${compactFieldClasses} w-auto`}
        >
          <option value="">All levels</option>
          {levels.map((number) => (
            <option key={number} value={number}>
              Level {number}
            </option>
          ))}
        </select>
        <select
          aria-label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={`${compactFieldClasses} w-auto`}
        >
          <option value="">All categories</option>
          <optgroup label="General">{options("topic")}</optgroup>
          <optgroup label="Departments">{options("team")}</optgroup>
        </select>
        <TopicFilter topics={topics} selected={topicIds} onChange={setTopicIds} />
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryId("");
              setLevel("");
              setTopicIds([]);
            }}
            className={`${buttonClasses("tertiary", "", "sm")} order-2`}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {!filtered ? (
        courses.length === 0 ? (
          <EmptyState title="Nothing here yet">
            Courses and videos appear here when they&apos;re published.
          </EmptyState>
        ) : (
          <section
            aria-labelledby="choose-heading"
            className="flex max-w-[40rem] flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <h2 id="choose-heading" className="font-semibold">
              Search, or choose a filter to find courses and videos
            </h2>
            {topics.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {topics.map((topic) => (
                  <li key={topic.id}>
                    <button
                      type="button"
                      onClick={() => setTopicIds([topic.id])}
                      className="min-h-control rounded-pill border border-border-strong bg-surface px-3 text-small font-medium text-text-secondary transition-surface hover:bg-hover"
                    >
                      {topic.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )
      ) : shownCourses.length === 0 && shownVideos.length === 0 ? (
        <EmptyState title="Nothing matches">Try a different word, or clear the filters.</EmptyState>
      ) : (
        <>
          <p role="status" className="sr-only">
            {shownCourses.length === 1 ? "1 course" : `${shownCourses.length} courses`} and{" "}
            {videoCountLabel(shownVideos.length)}
          </p>
          {shownCourses.length > 0 ? (
            <section aria-labelledby="explore-courses" className="flex flex-col gap-3">
              <h2
                id="explore-courses"
                className="flex items-baseline gap-2 text-heading font-semibold"
              >
                Courses
                <span className="tabular text-small font-normal text-text-muted">
                  {shownCourses.length}
                </span>
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {shownCourses.map((course) => (
                  <li key={course.id}>
                    <CoursePoster course={course} showCategory note={matchNote(course.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {shownVideos.length > 0 ? (
            <section aria-labelledby="explore-videos" className="mt-2 flex flex-col gap-3">
              <h2
                id="explore-videos"
                className="flex items-baseline gap-2 text-heading font-semibold"
              >
                Single videos
                <span className="tabular text-small font-normal text-text-muted">
                  {shownVideos.length}
                </span>
              </h2>
              <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {shownVideos.map((video) => (
                  <li key={video.key}>
                    <VideoCard video={video} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
