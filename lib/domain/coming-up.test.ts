import { describe, expect, it } from "vitest";
import {
  comingUp,
  courseSuggestions,
  gettingStarted,
  servingTitle,
  type PlanContinue,
  type PlanCourse,
} from "./coming-up";

const course = (id: string, state = "not_started", minutes: number | null = null): PlanCourse => ({
  id,
  title: `Course ${id}`,
  href: `/courses/${id}/open`,
  state,
  estimatedMinutes: minutes,
});

const started = (id: string, practical = false): PlanContinue => ({
  courseId: id,
  courseTitle: `Course ${id}`,
  nextTitle: `Lesson of ${id}`,
  nextHref: `/courses/${id}/lessons/l`,
  nextLesson: { number: 3, total: 7, minutes: 8, thumbnailUrl: "still.jpg" },
  practical: practical
    ? { title: "Direct a rehearsal", href: `/courses/${id}/practicals/p` }
    : null,
});

// A Thursday. Sunday, Nov 8 is three days on.
const now = new Date("2026-11-05T18:00:00Z");
const serving = (startsAt: string, status = "confirmed", id = "s") => ({
  id,
  status,
  startsAt,
  endsAt: startsAt,
  roleName: "Camera 2",
});
const empty = { continuing: [], assigned: [], startHere: [], servings: [], now };

describe("what's coming up", () => {
  it("puts the course in progress next, with where it's up to", () => {
    const { next } = comingUp({ ...empty, continuing: [started("a")] });
    expect(next).toMatchObject({
      title: "Lesson of a",
      note: "Course a · Lesson 3 of 7 · 8 min",
      button: "Continue",
      thumbnailUrl: "still.jpg",
      showThumbnail: true,
    });
  });

  it("shows no picture when the next step is a quiz", () => {
    const { next } = comingUp({
      ...empty,
      continuing: [{ ...started("a"), nextLesson: null }],
    });
    expect(next).toMatchObject({ note: "Course a", showThumbnail: false });
  });

  it("falls back to an assigned course, then a Start here course", () => {
    expect(comingUp({ ...empty, assigned: [course("x")] }).next?.title).toBe("Course x");
    expect(comingUp({ ...empty, startHere: [course("y")] }).next?.title).toBe("Course y");
    expect(comingUp(empty).next).toBeNull();
  });

  it("doesn't list the next course twice", () => {
    const plan = comingUp({ ...empty, assigned: [course("x"), course("z")] });
    expect(plan.next?.title).toBe("Course x");
    expect(plan.thisWeek.map((item) => item.title)).toEqual(["Course z"]);
  });

  it("lists an assigned course once, even if it's also a Start here course", () => {
    const plan = comingUp({
      ...empty,
      continuing: [started("a")],
      assigned: [course("x")],
      startHere: [course("x"), course("y")],
    });
    expect(plan.thisWeek.map((item) => item.title)).toEqual(["Course x"]);
    expect(plan.whenReady.map((item) => item.title)).toEqual(["Course y"]);
  });

  it("shows serving in the coming week, and leaves out declined or later dates", () => {
    const plan = comingUp({
      ...empty,
      servings: [
        serving("2026-11-08T15:00:00Z", "confirmed", "yes"),
        serving("2026-11-08T15:00:00Z", "declined", "declined"),
        serving("2026-11-22T15:00:00Z", "confirmed", "later"),
      ],
    });
    expect(plan.thisWeek.map((item) => item.key)).toEqual(["serving-yes"]);
    expect(plan.thisWeek[0]?.title).toBe("Serving this Sunday");
    expect(plan.thisWeek[0]?.note).toContain("Camera 2");
  });

  it("asks for a reply when serving isn't confirmed yet", () => {
    const plan = comingUp({ ...empty, servings: [serving("2026-11-08T15:00:00Z", "pending")] });
    expect(plan.thisWeek[0]?.note).toContain("Please reply");
  });

  it("keeps practicals and other courses for when they're ready", () => {
    const plan = comingUp({ ...empty, continuing: [started("a", true), started("b")] });
    expect(plan.whenReady.map((item) => [item.mark, item.title])).toEqual([
      ["P", "Direct a rehearsal"],
      ["C", "Course b"],
    ]);
  });

  it("leaves finished Start here courses out", () => {
    const plan = comingUp({ ...empty, startHere: [course("y", "completed")] });
    expect(plan.next).toBeNull();
    expect(plan.whenReady).toEqual([]);
  });
});

describe("the day of a serving", () => {
  it("says today on the day, in Winnipeg", () => {
    expect(servingTitle("2026-11-05T22:00:00Z", now)).toBe("Serving today");
    expect(servingTitle("2026-11-08T15:00:00Z", now)).toBe("Serving this Sunday");
  });
});

describe("getting started", () => {
  it("starts with the name when it's missing", () => {
    const plan = gettingStarted({ hasName: false, department: "none", startHere: [course("y")] });
    expect(plan.doneCount).toBe(0);
    expect(plan.next?.title).toBe("Add your name");
    expect(plan.later.map((step) => step.key)).toEqual(["course", "department", "app"]);
  });

  it("moves on to the Start here course", () => {
    const plan = gettingStarted({
      hasName: true,
      department: "none",
      startHere: [course("y", "not_started", 25)],
    });
    expect(plan.doneCount).toBe(1);
    expect(plan.done.map((step) => step.key)).toEqual(["name"]);
    expect(plan.next).toMatchObject({
      title: "Course y",
      note: "Everyone starts here. About 25 min.",
      isCourse: true,
    });
  });

  it("offers any course when there's no Start here course", () => {
    const plan = gettingStarted({ hasName: true, department: "none", startHere: [] });
    expect(plan.next).toMatchObject({ title: "Choose a course", href: "/courses" });
  });

  it("counts a request as done, and says who it's waiting for", () => {
    const plan = gettingStarted({
      hasName: true,
      department: "requested",
      startHere: [course("y", "completed")],
    });
    expect(plan.doneCount).toBe(3);
    expect(plan.done.at(-1)?.note).toBe("Request sent. Waiting for a leader.");
    expect(plan.next?.key).toBe("app");
  });
});

describe("courses to try", () => {
  it("offers three not started, leaving out what's already in the plan", () => {
    const courses = ["a", "b", "c", "d", "e"].map((id) => course(id));
    expect(courseSuggestions(courses, new Set(["a"])).map((c) => c.id)).toEqual(["b", "c", "d"]);
  });

  it("skips courses already begun", () => {
    const list = [course("a", "in_progress"), course("b", "completed"), course("c")];
    expect(courseSuggestions(list, new Set()).map((c) => c.id)).toEqual(["c"]);
  });
});
