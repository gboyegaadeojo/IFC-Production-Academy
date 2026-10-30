import { describe, expect, it } from "vitest";
import {
  acceptErrorMessage,
  createInvitationSchema,
  invitationState,
  invitationUrl,
  isInvitationToken,
  maxUsesFor,
  toAcceptError,
  toPreviewStatus,
} from "./invitations";

const AUDIO = "8cd57d7d-1aab-4be6-b67b-e9bc606e0d73";

describe("isInvitationToken", () => {
  it("accepts 32 URL-safe characters", () => {
    expect(isInvitationToken("abcdefghijklmnopqrstuvwxyz012-_A")).toBe(true);
  });

  it("rejects anything else, including path tricks", () => {
    expect(isInvitationToken("short")).toBe(false);
    expect(isInvitationToken("../../../../../../../../etc/pass")).toBe(false);
    expect(isInvitationToken("abcdefghijklmnopqrstuvwxyz012+/A")).toBe(false);
    expect(isInvitationToken(null)).toBe(false);
  });
});

describe("createInvitationSchema", () => {
  it("makes a single-use invitation for one person", () => {
    const parsed = createInvitationSchema.parse({
      departmentId: AUDIO,
      audience: "one",
      groupSize: "",
      validDays: "14",
      note: "  ",
    });
    expect(parsed).toMatchObject({ departmentId: AUDIO, validDays: 14, note: null });
    expect(maxUsesFor(parsed)).toBe(1);
  });

  it("needs a size for a group", () => {
    const missing = createInvitationSchema.safeParse({
      departmentId: AUDIO,
      audience: "group",
      validDays: "7",
      note: "",
    });
    expect(missing.success).toBe(false);

    const parsed = createInvitationSchema.parse({
      departmentId: AUDIO,
      audience: "group",
      groupSize: "25",
      validDays: "7",
      note: "Volunteer night",
    });
    expect(maxUsesFor(parsed)).toBe(25);
  });

  it("caps groups at 200 and only allows the offered durations", () => {
    const base = { departmentId: AUDIO, audience: "group", validDays: "7", note: "" };
    expect(createInvitationSchema.safeParse({ ...base, groupSize: "201" }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({ ...base, groupSize: "10", validDays: "365" }).success,
    ).toBe(false);
  });

  it("treats an empty department as an Academy-only invitation", () => {
    const parsed = createInvitationSchema.parse({
      departmentId: "",
      audience: "one",
      validDays: "30",
      note: "",
    });
    expect(parsed.departmentId).toBeNull();
  });
});

describe("invitationState", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const base = { revokedAt: null, expiresAt: "2026-11-10T00:00:00Z", useCount: 0, maxUses: 1 };

  it("reads active, expired, used up, and revoked", () => {
    expect(invitationState(base, now)).toBe("active");
    expect(invitationState({ ...base, expiresAt: "2026-11-01T11:59:59Z" }, now)).toBe("expired");
    expect(invitationState({ ...base, useCount: 1 }, now)).toBe("used_up");
    expect(invitationState({ ...base, revokedAt: "2026-11-01T00:00:00Z" }, now)).toBe("revoked");
  });
});

describe("previews and errors", () => {
  it("treats unknown statuses as not found", () => {
    expect(toPreviewStatus("valid")).toBe("valid");
    expect(toPreviewStatus("something_else")).toBe("not_found");
    expect(toPreviewStatus(null)).toBe("not_found");
  });

  it("never shows raw database messages", () => {
    expect(toAcceptError("invitation_used_up")).toBe("invitation_used_up");
    expect(toAcceptError("internal failure detail")).toBe("unknown");
    expect(acceptErrorMessage("unknown")).not.toContain("internal");
  });
});

describe("invitationUrl", () => {
  it("builds the link on the site's own address", () => {
    expect(invitationUrl("https://academy.example.org", "abcdefghijklmnopqrstuvwxyz012-_A")).toBe(
      "https://academy.example.org/invite/abcdefghijklmnopqrstuvwxyz012-_A",
    );
  });
});
