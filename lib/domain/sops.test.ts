import { describe, expect, it } from "vitest";
import {
  checkSopFile,
  cleanFileName,
  formatFileSize,
  matchesSearch,
  MAX_SOP_FILE_BYTES,
  reviewDueAt,
  sniffSopFileType,
  sopSettingsSchema,
  sopState,
  toSopError,
} from "./sops";

const bytes = (...values: number[]) => new Uint8Array(values);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);

describe("sniffSopFileType", () => {
  it("reads the type from the file's first bytes", () => {
    expect(sniffSopFileType(PDF)).toBe("application/pdf");
    expect(sniffSopFileType(PNG)).toBe("image/png");
    expect(sniffSopFileType(JPEG)).toBe("image/jpeg");
    expect(sniffSopFileType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(sniffSopFileType(bytes())).toBeNull();
  });
});

describe("checkSopFile", () => {
  it("accepts a PDF whatever it's called", () => {
    expect(checkSopFile({ size: 1200, name: "Camera checklist.exe" }, PDF)).toEqual({
      ok: true,
      type: "application/pdf",
      name: "Camera checklist.exe",
    });
  });

  it("rejects empty, oversized, and other files", () => {
    expect(checkSopFile({ size: 0, name: "a.pdf" }, PDF)).toEqual({
      ok: false,
      problem: "missing",
    });
    expect(checkSopFile({ size: MAX_SOP_FILE_BYTES + 1, name: "a.pdf" }, PDF)).toEqual({
      ok: false,
      problem: "too_large",
    });
    expect(checkSopFile({ size: 10, name: "a.pdf" }, bytes(0x50, 0x4b, 3, 4))).toEqual({
      ok: false,
      problem: "wrong_type",
    });
  });
});

describe("cleanFileName", () => {
  it("drops folders and control characters", () => {
    expect(cleanFileName("C:\\Users\\someone\\SOP.pdf")).toBe("SOP.pdf");
    expect(cleanFileName("../../evil\u0000.pdf")).toBe("evil.pdf");
    expect(cleanFileName("   ")).toBe("file");
  });
});

describe("reviewDueAt", () => {
  it("adds the interval in months, keeping to real days", () => {
    expect(reviewDueAt("2026-01-31T15:00:00Z", 1)?.toISOString()).toBe("2026-02-28T15:00:00.000Z");
    expect(reviewDueAt("2026-10-31T15:00:00Z", 12)?.toISOString()).toBe("2027-10-31T15:00:00.000Z");
    expect(reviewDueAt(null, 12)).toBeNull();
  });
});

describe("sopState", () => {
  const sop = { archivedAt: null, lastReviewedAt: "2026-01-01T00:00:00Z", reviewIntervalMonths: 6 };

  it("is current until the review date, then review due", () => {
    expect(sopState(sop, true, new Date("2026-06-30T00:00:00Z"))).toBe("current");
    expect(sopState(sop, true, new Date("2026-07-01T00:00:00Z"))).toBe("review_due");
  });

  it("knows unpublished and archived SOPs", () => {
    expect(sopState({ ...sop, lastReviewedAt: null }, false, new Date())).toBe("not_published");
    expect(sopState({ ...sop, archivedAt: "2026-02-01T00:00:00Z" }, true, new Date())).toBe(
      "archived",
    );
  });
});

describe("sopSettingsSchema", () => {
  it("allows only the offered review intervals", () => {
    expect(
      sopSettingsSchema.parse({ category: " Checklists ", reviewIntervalMonths: "6" }),
    ).toEqual({ category: "Checklists", reviewIntervalMonths: 6 });
    expect(sopSettingsSchema.safeParse({ category: "", reviewIntervalMonths: "5" }).success).toBe(
      false,
    );
  });
});

describe("matchesSearch", () => {
  const sop = { title: "Camera power-up", summary: "Before the service", category: "Checklists" };
  it("matches every word anywhere, ignoring case", () => {
    expect(matchesSearch(sop, "camera service")).toBe(true);
    expect(matchesSearch(sop, "CHECKLISTS")).toBe(true);
    expect(matchesSearch(sop, "camera audio")).toBe(false);
    expect(matchesSearch(sop, "  ")).toBe(true);
  });
});

describe("formatFileSize and errors", () => {
  it("formats sizes and maps database errors", () => {
    expect(formatFileSize(900)).toBe("900 bytes");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(toSopError({ message: "sop_has_no_file" })).toBe("sop_has_no_file");
    expect(toSopError({ code: "42501", message: "x" })).toBe("not_authorized");
    expect(toSopError({ code: "XX000", message: "secret" })).toBe("unknown");
  });
});
