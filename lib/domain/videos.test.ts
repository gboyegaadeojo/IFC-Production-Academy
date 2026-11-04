import { describe, expect, it } from "vitest";
import { videoThumbnailUrl } from "./video";
import { filterVideos, topicVideoCounts, videoCountLabel, type LibraryVideo } from "./videos";

const category = (id: string) => ({
  id,
  slug: id,
  name: id,
  kind: "team" as const,
  hue: "blue",
  icon: "camera",
  sortOrder: 1,
});
const video = (
  key: string,
  cat: string,
  level: number | null,
  topicIds: string[],
): LibraryVideo => ({
  key,
  title: key,
  href: `/${key}`,
  thumbnailUrl: null,
  minutes: null,
  courseTitle: "A course",
  category: category(cat),
  level,
  topicIds,
});
const all = [
  video("Shot types", "camera", 1, ["t1", "t2"]),
  video("Mixing", "audio", 2, ["t3"]),
  video("Welcome", "general", null, []),
];
const none = { search: "", categoryId: "", level: "", topicIds: [] };
const keys = (list: LibraryVideo[]) => list.map((v) => v.key);

describe("filterVideos", () => {
  it("shows everything with no filters", () => {
    expect(filterVideos(all, none)).toHaveLength(3);
  });
  it("searches the lesson and its course", () => {
    expect(keys(filterVideos(all, { ...none, search: "SHOT" }))).toEqual(["Shot types"]);
    expect(filterVideos(all, { ...none, search: "a course" })).toHaveLength(3);
  });
  it("matches any chosen topic", () => {
    expect(keys(filterVideos(all, { ...none, topicIds: ["t2", "t3"] }))).toEqual([
      "Shot types",
      "Mixing",
    ]);
  });
  it("combines filters", () => {
    expect(filterVideos(all, { ...none, level: "2", topicIds: ["t1"] })).toEqual([]);
    expect(keys(filterVideos(all, { ...none, categoryId: "audio", level: "2" }))).toEqual([
      "Mixing",
    ]);
  });
});

describe("topicVideoCounts", () => {
  it("counts each topic's videos", () => {
    expect(topicVideoCounts(all).get("t1")).toBe(1);
    expect(topicVideoCounts(all).get("missing")).toBeUndefined();
  });
});

describe("labels and thumbnails", () => {
  it("says one video or many", () => {
    expect(videoCountLabel(1)).toBe("1 video");
    expect(videoCountLabel(0)).toBe("0 videos");
  });
  it("has a still only for YouTube", () => {
    expect(videoThumbnailUrl({ provider: "youtube", id: "fakeVideoId" })).toContain("fakeVideoId");
    expect(videoThumbnailUrl({ provider: "nas", id: "camera/level-1/framing.mp4" })).toBeNull();
  });
});
