import { describe, expect, it } from "vitest";
import {
  attachmentPreview,
  chatFilePath,
  documentLabel,
  documentTypeFor,
  fitWithin,
  formatBytes,
  matchesSignature,
  parseGiphy,
} from "./chat-files";

describe("documents", () => {
  it("allows PDF, Office and text files by name", () => {
    expect(documentTypeFor("Sunday run sheet.PDF")?.mime).toBe("application/pdf");
    expect(documentTypeFor("plan.docx")?.label).toBe("Word");
    expect(documentTypeFor("rota.xlsx")?.label).toBe("Excel");
    expect(documentTypeFor("notes.txt")?.label).toBe("Text");
  });

  it("refuses programs and anything else", () => {
    expect(documentTypeFor("setup.exe")).toBeNull();
    expect(documentTypeFor("script.js")).toBeNull();
    expect(documentTypeFor("no-extension")).toBeNull();
    expect(documentLabel("application/x-msdownload")).toBe("File");
  });

  it("checks a file's first bytes match its type", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const program = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect(matchesSignature(pdf, "application/pdf")).toBe(true);
    expect(matchesSignature(program, "application/pdf")).toBe(false);
    expect(
      matchesSignature(
        zip,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(matchesSignature(new TextEncoder().encode("Call time 8:30"), "text/plain")).toBe(true);
    expect(matchesSignature(program, "text/plain")).toBe(false);
  });
});

describe("photos", () => {
  it("fits the longest side, and never enlarges", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 320)).toEqual({ width: 240, height: 320 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("labels and paths", () => {
  it("formats sizes", () => {
    expect(formatBytes(240_000)).toBe("234 KB");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("says what a message carried", () => {
    expect(attachmentPreview("photo", 1)).toBe("Photo");
    expect(attachmentPreview("photo", 3)).toBe("3 photos");
    expect(attachmentPreview("gif", 1)).toBe("GIF");
    expect(attachmentPreview("document", 1)).toBe("Document");
    expect(attachmentPreview(null, 0)).toBeNull();
  });

  it("puts the chat first in a file's path", () => {
    expect(chatFilePath("c1", "u1", "full.webp")).toBe("c1/u1/full.webp");
  });
});

describe("parseGiphy", () => {
  it("keeps well-formed results from GIPHY's servers", () => {
    const payload = {
      data: [
        {
          id: "abc123",
          title: "Thumbs Up GIF",
          images: {
            fixed_width: {
              url: "https://media2.giphy.com/media/abc123/200w.gif",
              webp: "https://media2.giphy.com/media/abc123/200w.webp",
              width: "200",
              height: "150",
            },
          },
        },
        {
          id: "bad",
          images: {
            fixed_width: { url: "https://evil.example.com/a.gif", width: "200", height: "150" },
          },
        },
        { id: "no-images" },
      ],
    };
    expect(parseGiphy(payload)).toEqual([
      {
        id: "abc123",
        title: "Thumbs Up GIF",
        url: "https://media2.giphy.com/media/abc123/200w.webp",
        width: 200,
        height: 150,
      },
    ]);
    expect(parseGiphy({})).toEqual([]);
    expect(parseGiphy(null)).toEqual([]);
  });
});
