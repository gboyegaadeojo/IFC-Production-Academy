/**
 * Single videos on Explore (SRS-CUR-019): lessons with a video, found by search, level, category, and topic.
 * A video is a lesson in its course, not a second copy. Pure rules.
 */
import type { LibraryCourse } from "./library";

export type LibraryVideo = {
  /** The lesson's stable key. */
  key: string;
  courseId: string;
  title: string;
  href: string;
  thumbnailUrl: string | null;
  minutes: number | null;
  courseTitle: string;
  category: LibraryCourse["category"];
  level: number | null;
  topicIds: string[];
};

export type VideoFilter = {
  search: string;
  categoryId: string;
  level: string;
  /** Any of these. Empty means every topic. */
  topicIds: readonly string[];
};

export function filterVideos(videos: readonly LibraryVideo[], filter: VideoFilter): LibraryVideo[] {
  const words = filter.search.trim().toLowerCase();
  return videos.filter(
    (video) =>
      (!words ||
        video.title.toLowerCase().includes(words) ||
        video.courseTitle.toLowerCase().includes(words)) &&
      (!filter.categoryId || video.category.id === filter.categoryId) &&
      (!filter.level || String(video.level) === filter.level) &&
      (filter.topicIds.length === 0 || filter.topicIds.some((id) => video.topicIds.includes(id))),
  );
}

export function videoCountLabel(count: number): string {
  return count === 1 ? "1 video" : `${count} videos`;
}
