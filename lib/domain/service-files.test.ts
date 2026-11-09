import { describe, expect, it } from "vitest";
import {
  checkServiceFile,
  feedToken,
  feedUrl,
  fileSizeLabel,
  safeFileName,
  SERVICE_FILE_MAX_BYTES,
} from "./service-files";

describe("service files", () => {
  it("takes PDFs, images, and office files up to 10 MB", () => {
    expect(checkServiceFile({ name: "plot.pdf", size: 1000, type: "application/pdf" })).toEqual({
      ok: true,
    });
    expect(
      checkServiceFile({
        name: "plot.pdf",
        size: SERVICE_FILE_MAX_BYTES + 1,
        type: "application/pdf",
      }).ok,
    ).toBe(false);
    expect(checkServiceFile({ name: "song.mp3", size: 1000, type: "audio/mpeg" }).ok).toBe(false);
    expect(checkServiceFile({ name: "", size: 0, type: "" }).ok).toBe(false);
  });

  it("stores a safe name that keeps the extension", () => {
    expect(safeFileName("Stage plot (Nov).PDF")).toBe("stage-plot-nov.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\fake\\Run sheet.docx")).toBe("run-sheet.docx");
    expect(safeFileName("???.pdf")).toBe("file.pdf");
  });

  it("says how big a file is", () => {
    expect(fileSizeLabel(421_888)).toBe("412 KB");
    expect(fileSizeLabel(1_258_291)).toBe("1.2 MB");
  });
});

describe("the calendar link", () => {
  const token = "a".repeat(48);

  it("reads the token with or without .ics", () => {
    expect(feedToken(`${token}.ics`)).toBe(token);
    expect(feedToken(token)).toBe(token);
    expect(feedToken("not-a-token.ics")).toBeNull();
  });

  it("builds the address a calendar app subscribes to", () => {
    expect(feedUrl("https://academy.example.org/", token)).toBe(
      `https://academy.example.org/feeds/serving/${token}.ics`,
    );
  });
});
