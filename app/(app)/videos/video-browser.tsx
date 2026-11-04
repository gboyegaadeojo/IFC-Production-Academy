"use client";

import { useMemo, useState } from "react";
import { fieldClasses } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronDownIcon } from "@/components/ui/icons";
import { VideoCard } from "@/components/video-card";
import { filterVideos, videoCountLabel, type LibraryVideo } from "@/lib/domain/videos";

type Category = { id: string; name: string; kind: string };
type Topic = { id: string; name: string };

/**
 * Topic is an extra filter (G, 2026-11-04): the page opens on its filters, and lessons only show once
 * someone searches or chooses one, so it never reads as every course laid out lesson by lesson.
 * Filters run in the browser, since every video the person can see is already here.
 */
export function VideoBrowser({
  videos,
  topics,
  categories,
  initialTopicIds,
}: {
  videos: LibraryVideo[];
  topics: Topic[];
  categories: Category[];
  initialTopicIds: string[];
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [level, setLevel] = useState("");
  const [topicIds, setTopicIds] = useState(initialTopicIds);
  const [panelOpen, setPanelOpen] = useState(false);
  const shown = useMemo(
    () => filterVideos(videos, { search, categoryId, level, topicIds }),
    [videos, search, categoryId, level, topicIds],
  );
  const levels = [...new Set(videos.flatMap((video) => video.level ?? []))].toSorted();
  const filtered = Boolean(search || categoryId || level || topicIds.length);
  const withVideos = categories.filter((category) =>
    videos.some((video) => video.category.id === category.id),
  );
  const options = (kind: string) =>
    withVideos
      .filter((category) => category.kind === kind)
      .map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search videos"
          aria-label="Search videos"
          className={`${fieldClasses} min-h-8 max-w-md min-w-44 flex-1 px-2.5 py-0 text-small pointer-coarse:min-h-11 pointer-coarse:text-field`}
        />
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className={`${fieldClasses} min-h-8 w-auto px-2.5 py-0 text-small pointer-coarse:min-h-11 pointer-coarse:text-field`}
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
          className={`${fieldClasses} min-h-8 w-auto px-2.5 py-0 text-small pointer-coarse:min-h-11 pointer-coarse:text-field`}
        >
          <option value="">All categories</option>
          <optgroup label="General">{options("topic")}</optgroup>
          <optgroup label="Departments">{options("team")}</optgroup>
        </select>
        {topics.length > 0 ? (
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls="topic-filter"
            onClick={() => setPanelOpen(!panelOpen)}
            className={buttonClasses("secondary", "gap-1.5", "sm")}
          >
            Topic{topicIds.length > 0 ? ` (${topicIds.length})` : ""}
            <ChevronDownIcon
              className={`size-4 transition-surface ${panelOpen ? "rotate-180" : ""}`}
            />
          </button>
        ) : null}
        {filtered ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryId("");
              setLevel("");
              setTopicIds([]);
            }}
            className={buttonClasses("tertiary", "", "sm")}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {panelOpen ? (
        <fieldset
          id="topic-filter"
          className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-1 rounded-card border border-border bg-surface px-4 py-3"
        >
          <legend className="px-1 text-small text-text-muted">Choose any topics</legend>
          {topics.map((topic) => (
            <label
              key={topic.id}
              className="flex min-h-touch items-center gap-2 pointer-fine:min-h-8"
            >
              <input
                type="checkbox"
                checked={topicIds.includes(topic.id)}
                onChange={(event) =>
                  setTopicIds(
                    event.target.checked
                      ? [...topicIds, topic.id]
                      : topicIds.filter((id) => id !== topic.id),
                  )
                }
              />
              {topic.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      {filtered ? (
        <p role="status" className="text-small text-text-muted">
          {videoCountLabel(shown.length)}
        </p>
      ) : null}
      {!filtered ? (
        videos.length === 0 ? (
          <EmptyState title="No videos yet">
            Videos appear here when a course with videos is published.
          </EmptyState>
        ) : (
          <section
            aria-labelledby="choose-heading"
            className="flex max-w-[40rem] flex-col gap-3 rounded-card border border-border bg-surface p-4"
          >
            <h2 id="choose-heading" className="font-semibold">
              Search, or choose a filter to find videos
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
      ) : shown.length === 0 ? (
        <EmptyState title="No videos match">Try a different word, or clear the filters.</EmptyState>
      ) : (
        <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((video) => (
            <li key={video.key}>
              <VideoCard video={video} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
