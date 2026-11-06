import { describe, expect, it } from "vitest";
import {
  recentlyWatched,
  servingSpotlight,
  timeOfDayGreeting,
  type ServingInput,
  type WatchedLesson,
  type WatchedRow,
} from "./training-home";

// Friday, Nov 6 2026, 7 pm in Winnipeg (UTC-5 from Nov 1).
const now = new Date("2026-11-07T00:00:00Z");

describe("timeOfDayGreeting", () => {
  it("follows Winnipeg's clock", () => {
    expect(timeOfDayGreeting(new Date("2026-11-06T14:00:00Z"))).toBe("Good morning");
    expect(timeOfDayGreeting(new Date("2026-11-06T18:00:00Z"))).toBe("Good afternoon");
    expect(timeOfDayGreeting(now)).toBe("Good evening");
    expect(timeOfDayGreeting(new Date("2026-11-06T08:00:00Z"))).toBe("Good evening");
  });
});

const serving = (over: Partial<ServingInput> = {}): ServingInput => ({
  id: "a1",
  status: "confirmed",
  readiness: "approved",
  // Sunday, Nov 8, 9:00 am in Winnipeg.
  startsAt: "2026-11-08T14:00:00Z",
  endsAt: "2026-11-08T16:30:00Z",
  roleName: "Camera 2",
  eventTitle: "Sunday Service",
  ...over,
});

describe("servingSpotlight", () => {
  it("names the day, the role, the start time, and the training", () => {
    const spot = servingSpotlight([serving()], now);
    expect(spot).toMatchObject({
      id: "a1",
      eyebrow: "You're serving Sunday",
      detail: "Sunday Service · Trained",
      needsReply: false,
    });
    // 9:00 with Manitoba's permanent daylight time; older time zone data still says 8:00.
    expect(spot?.title).toMatch(/^Camera 2 · [89]:00 a\.m\.$/);
  });

  it("picks the soonest, skips declined ones, and asks for a reply when pending", () => {
    const spot = servingSpotlight(
      [
        serving({ id: "later", startsAt: "2026-11-22T14:00:00Z", endsAt: "2026-11-22T16:00:00Z" }),
        serving({ id: "declined", status: "declined", startsAt: "2026-11-07T15:00:00Z" }),
        serving({ id: "soon", status: "pending", readiness: "learning" }),
      ],
      now,
    );
    expect(spot?.id).toBe("soon");
    expect(spot?.needsReply).toBe(true);
    expect(spot?.detail).toBe("Sunday Service · Please reply");
  });

  it("says today, tomorrow, or the date when it's further out", () => {
    expect(
      servingSpotlight(
        [serving({ startsAt: "2026-11-07T01:00:00Z", endsAt: "2026-11-07T03:00:00Z" })],
        now,
      )?.eyebrow,
    ).toBe("You're serving today");
    expect(
      servingSpotlight(
        [serving({ startsAt: "2026-11-07T15:00:00Z", endsAt: "2026-11-07T17:00:00Z" })],
        now,
      )?.eyebrow,
    ).toBe("You're serving tomorrow");
    expect(
      servingSpotlight(
        [serving({ startsAt: "2026-11-22T15:00:00Z", endsAt: "2026-11-22T17:00:00Z" })],
        now,
      )?.eyebrow,
    ).toMatch(/^You're serving on Sun\.?, Nov\.? 22$/);
  });

  it("is empty when nothing is coming up", () => {
    expect(servingSpotlight([], now)).toBeNull();
    expect(servingSpotlight([serving({ status: "declined" })], now)).toBeNull();
  });
});

const row = (over: Partial<WatchedRow>): WatchedRow => ({
  courseId: "c1",
  lessonKey: "l1",
  status: "in_progress",
  positionSeconds: 0,
  lastViewedAt: "2026-11-05T12:00:00Z",
  completedAt: null,
  ...over,
});

const lesson = (title: string, minutes: number | null = 9): WatchedLesson => ({
  title,
  courseTitle: "Video Directing Concepts",
  href: `/courses/c1/lessons/${title}`,
  minutes,
  thumbnailUrl: null,
});

describe("recentlyWatched", () => {
  const lessons = new Map([
    ["c1:l1", lesson("Calling shots")],
    ["c1:l2", lesson("What a director does")],
    ["c1:l3", lesson("No length", null)],
  ]);

  it("lists the newest first, with time watched as a hint, never more than the video", () => {
    const items = recentlyWatched(
      [
        row({ lessonKey: "l1", positionSeconds: 200, lastViewedAt: "2026-11-06T10:00:00Z" }),
        row({ lessonKey: "l3", positionSeconds: 400, lastViewedAt: "2026-11-04T10:00:00Z" }),
        row({ lessonKey: "l2", positionSeconds: 9000, lastViewedAt: "2026-11-05T10:00:00Z" }),
      ],
      lessons,
    );
    expect(items.map((item) => [item.title, item.status, item.percent])).toEqual([
      ["Calling shots", "About 3 min of 9 min watched", 37],
      ["What a director does", "About 9 min of 9 min watched", 99],
      ["No length", "About 7 min watched", null],
    ]);
  });

  it("marks a lesson completed only when the learner completed it, on any version", () => {
    const [item] = recentlyWatched(
      [
        row({ lessonKey: "l2", positionSeconds: 30, lastViewedAt: "2026-11-06T10:00:00Z" }),
        row({
          lessonKey: "l2",
          status: "completed",
          completedAt: "2026-11-04T15:00:00Z",
          lastViewedAt: "2026-11-04T15:00:00Z",
        }),
      ],
      lessons,
    );
    expect(item).toMatchObject({ completed: true, percent: null });
    expect(item?.status).toMatch(/^Completed Nov\.? 4$/);
  });

  it("leaves out lessons it can't open, says Opened for a glance, and keeps to the limit", () => {
    const items = recentlyWatched(
      [
        row({ lessonKey: "gone" }),
        row({ lessonKey: "l1", positionSeconds: 10 }),
        row({ lessonKey: "l2", lastViewedAt: "2026-11-01T00:00:00Z" }),
      ],
      lessons,
      1,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("Opened");
  });
});
