import { describe, expect, it } from "vitest";
import {
  assignedMessage,
  assigneeNote,
  dueDateChoices,
  formatDueDate,
  winnipegToday,
} from "./course-assignments";

describe("winnipegToday", () => {
  it("uses the day in Winnipeg, not UTC", () => {
    // 02:00 UTC on Nov 8 is still the evening of Nov 7 in Winnipeg.
    expect(winnipegToday(new Date("2026-11-08T02:00:00Z"))).toBe("2026-11-07");
    expect(winnipegToday(new Date("2026-11-08T12:00:00Z"))).toBe("2026-11-08");
  });
});

describe("dueDateChoices", () => {
  it("offers the coming Sunday and two weeks out", () => {
    expect(dueDateChoices("2026-11-07")).toEqual({
      thisSunday: "2026-11-08",
      inTwoWeeks: "2026-11-21",
    });
  });

  it("means next Sunday when it's Sunday already", () => {
    expect(dueDateChoices("2026-11-08").thisSunday).toBe("2026-11-15");
  });

  it("crosses months and years", () => {
    expect(dueDateChoices("2026-12-29")).toEqual({
      thisSunday: "2027-01-03",
      inTwoWeeks: "2027-01-12",
    });
  });
});

describe("formatDueDate", () => {
  it("shows the calendar day without moving it", () => {
    expect(formatDueDate("2026-11-08")).toBe("Sun, Nov 8");
  });
});

describe("assigneeNote", () => {
  const base = { assigned: false, dueOn: null, lessonsDone: 0, totalLessons: 17 };

  it("says nothing for someone who hasn't started", () => {
    expect(assigneeNote(base)).toBeNull();
  });

  it("shows how far through they are", () => {
    expect(assigneeNote({ ...base, lessonsDone: 4 })).toBe("4 of 17 lessons");
    expect(assigneeNote({ ...base, lessonsDone: 17 })).toBe("All lessons done");
  });

  it("shows an assignment and its due date first", () => {
    expect(assigneeNote({ ...base, assigned: true, lessonsDone: 4 })).toBe("Already assigned");
    expect(assigneeNote({ ...base, assigned: true, dueOn: "2026-11-15" })).toBe(
      "Already assigned · due Sun, Nov 15",
    );
  });
});

describe("assignedMessage", () => {
  it("tells the leader what happened", () => {
    expect(assignedMessage("assigned", "Jordan Lee", null)).toBe(
      "Assigned to Jordan Lee. They'll see it on Training.",
    );
    expect(assignedMessage("assigned", "Jordan Lee", "2026-11-08")).toBe(
      "Assigned to Jordan Lee, due Sun, Nov 8. They'll see it on Training.",
    );
    expect(assignedMessage("updated", "Jordan Lee", "2026-11-08")).toBe(
      "Jordan Lee was already assigned. The due date is now Sun, Nov 8.",
    );
    expect(assignedMessage("updated", "Jordan Lee", null)).toBe(
      "Jordan Lee was already assigned. There's no due date now.",
    );
    expect(assignedMessage("unchanged", "Jordan Lee", null)).toBe(
      "Jordan Lee is already assigned.",
    );
  });
});
