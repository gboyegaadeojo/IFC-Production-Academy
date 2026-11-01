import { describe, expect, it } from "vitest";
import { draftNames, needsYou, pipelineSegments } from "./dashboard";

describe("needsYou", () => {
  it("keeps zero counts so people can see it's all clear, and hides what they can't see", () => {
    const items = needsYou({
      awaitingAssessment: 0,
      pendingRequests: null,
      awaitingReview: 0,
      drafts: { count: 1, titles: ["Focus"] },
    });
    expect(items.map((i) => [i.key, i.count])).toEqual([
      ["assessments", 0],
      ["drafts", 1],
    ]);
    expect(items[0]?.detail).toMatch(/Nobody has asked/);
    expect(items[1]?.detail).toBe("“Focus”. Volunteers can't see it until it's published.");
  });

  it("only shows curriculum review when something is waiting", () => {
    const items = needsYou({
      awaitingAssessment: null,
      pendingRequests: 2,
      awaitingReview: 1,
      drafts: null,
    });
    expect(items.map((i) => i.key)).toEqual(["requests", "review"]);
    expect(items[0]?.detail).toBe("2 people are waiting to join.");
  });
});

describe("onboarding follow-ups", () => {
  it("comes first, and only for people who look after onboarding", () => {
    const base = {
      awaitingAssessment: 0,
      pendingRequests: null,
      awaitingReview: null,
      drafts: null,
    };
    expect(needsYou({ ...base, followUps: 2 })[0]).toMatchObject({
      key: "follow_ups",
      count: 2,
      detail: "2 new people are waiting for a leader to reach out.",
    });
    expect(needsYou({ ...base, followUps: null }).map((i) => i.key)).toEqual(["assessments"]);
  });
});

describe("draftNames", () => {
  it("names up to two drafts and counts the rest", () => {
    expect(draftNames(["Focus"], 1)).toBe("“Focus”");
    expect(draftNames(["Focus", "Lenses"], 2)).toBe("“Focus” and “Lenses”");
    expect(draftNames(["Focus", "Lenses"], 5)).toBe("“Focus”, “Lenses” and 3 more");
    expect(draftNames([], 3)).toBe("3 drafts");
  });
});

describe("pipelineSegments", () => {
  it("splits members by their furthest stage", () => {
    expect(
      pipelineSegments({
        activeMembers: 10,
        approvedToServe: 2,
        awaitingAssessment: 1,
        inProgress: 3,
      }),
    ).toEqual({ approved: 20, waiting: 10, learning: 30, joined: 40 });
  });

  it("never passes 100% when people count in more than one stage", () => {
    const s = pipelineSegments({
      activeMembers: 2,
      approvedToServe: 2,
      awaitingAssessment: 1,
      inProgress: 2,
    });
    expect(s).toEqual({ approved: 100, waiting: 0, learning: 0, joined: 0 });
  });

  it("is empty with no members", () => {
    expect(
      pipelineSegments({
        activeMembers: 0,
        approvedToServe: 0,
        awaitingAssessment: 0,
        inProgress: 0,
      }),
    ).toEqual({ approved: 0, waiting: 0, learning: 0, joined: 0 });
  });
});
