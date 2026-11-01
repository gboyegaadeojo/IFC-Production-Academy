/**
 * Admin dashboard (DESIGN §7.1; redesign approved 2026-11-01). Pure rules: what "Needs you" shows,
 * and how a department's training row reads from joining to serving. Real counts only.
 */

export type NeedsYouItem = {
  key: "assessments" | "requests" | "review" | "drafts";
  count: number;
  title: string;
  detail: string;
  href: string;
  action: string;
};

/**
 * Up to four cards, in the order someone should act on them. A count the person can't see (null)
 * is left out; a zero stays, so they can see it's all clear.
 */
export function needsYou(input: {
  awaitingAssessment: number | null;
  pendingRequests: number | null;
  awaitingReview: number | null;
  drafts: { count: number; titles: string[] } | null;
}): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  if (input.awaitingAssessment !== null) {
    const n = input.awaitingAssessment;
    items.push({
      key: "assessments",
      count: n,
      title: "Waiting for an assessment",
      detail:
        n === 0
          ? "Nobody has asked a trainer to check their practical skills."
          : `${n === 1 ? "1 volunteer has" : `${n} volunteers have`} asked to be assessed.`,
      href: "/admin/assessments",
      action: "Assess",
    });
  }
  if (input.pendingRequests !== null) {
    const n = input.pendingRequests;
    items.push({
      key: "requests",
      count: n,
      title: "Requests to join",
      detail:
        n === 0
          ? "No one is waiting to join a department."
          : `${n === 1 ? "1 person is" : `${n} people are`} waiting to join.`,
      href: "/admin/members",
      action: "Review requests",
    });
  }
  if (input.awaitingReview) {
    items.push({
      key: "review",
      count: input.awaitingReview,
      title: "Curriculum waiting for review",
      detail: "Submitted changes that need a second person to publish.",
      href: "/admin/curriculum",
      action: "Review",
    });
  }
  if (input.drafts !== null) {
    const { count, titles } = input.drafts;
    items.push({
      key: "drafts",
      count,
      title: count === 1 ? "Course not published yet" : "Courses not published yet",
      detail:
        count === 0
          ? "Every course is published."
          : `${draftNames(titles, count)}. Volunteers can't see ${count === 1 ? "it" : "them"} until ${count === 1 ? "it's" : "they're"} published.`,
      href: "/admin/curriculum",
      action: "Open curriculum",
    });
  }
  return items;
}

/** "“Focus”", "“Focus” and “Lenses”", or "“Focus”, “Lenses” and 3 more". */
export function draftNames(titles: readonly string[], count: number): string {
  const shown = titles.slice(0, 2).map((t) => `“${t}”`);
  const more = count - shown.length;
  if (shown.length === 0) {
    return count === 1 ? "1 draft" : `${count} drafts`;
  }
  if (more <= 0) {
    return shown.join(" and ");
  }
  return `${shown.join(", ")} and ${more} more`;
}

export type PipelineSegments = {
  /** Percent of members at each furthest stage; adds up to 100 at most. */
  approved: number;
  waiting: number;
  learning: number;
  joined: number;
};

/**
 * One department's bar, read left to right: approved to serve, waiting for an assessment, learning,
 * then members who haven't started. People can be counted in more than one stage (approved in one
 * role, learning another), so each stage takes only what's left, and the bar never passes 100%.
 */
export function pipelineSegments(row: {
  activeMembers: number;
  inProgress: number;
  awaitingAssessment: number;
  approvedToServe: number;
}): PipelineSegments {
  const total = row.activeMembers;
  if (total <= 0) {
    return { approved: 0, waiting: 0, learning: 0, joined: 0 };
  }
  let left = total;
  const take = (n: number) => {
    const used = Math.max(0, Math.min(n, left));
    left -= used;
    return used;
  };
  const approved = take(row.approvedToServe);
  const waiting = take(row.awaitingAssessment);
  const learning = take(row.inProgress);
  const pct = (n: number) => Math.round((n / total) * 100);
  return {
    approved: pct(approved),
    waiting: pct(waiting),
    learning: pct(learning),
    joined: pct(left),
  };
}
