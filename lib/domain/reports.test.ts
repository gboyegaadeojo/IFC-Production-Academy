import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, toCsv } from "./reports";

describe("csvCell", () => {
  it("quotes commas, quotes, and line breaks", () => {
    expect(csvCell("Plain")).toBe("Plain");
    expect(csvCell("Smith, Avery")).toBe('"Smith, Avery"');
    expect(csvCell('Says "hi"')).toBe('"Says ""hi"""');
    expect(csvCell("Two\nlines")).toBe('"Two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("never lets a value run as a spreadsheet formula", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("toCsv", () => {
  it("writes a header row and CRLF lines with a byte-order mark", () => {
    expect(toCsv(["Name", "State"], [["Avery", "Completed"]])).toBe(
      `${String.fromCharCode(0xfeff)}Name,State\r\nAvery,Completed\r\n`,
    );
  });
});

describe("csvFileName", () => {
  it("is safe and dated", () => {
    expect(csvFileName("camera-operations", "Training", "2026-11-08T10:00:00Z")).toBe(
      "camera-operations-training-2026-11-08.csv",
    );
    expect(csvFileName("../Audio Engineering", "readiness", "2026-11-08")).toBe(
      "audio-engineering-readiness-2026-11-08.csv",
    );
  });
});
