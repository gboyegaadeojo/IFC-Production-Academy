import { describe, expect, it } from "vitest";
import {
  nas,
  parseVideo,
  resumeFrom,
  storedVideo,
  videoInputValue,
  youtube,
  youtubeEmbedUrl,
} from "./video";

// Every id here is fake. Real (unlisted) video ids never go in the repo (SRS-LESSON-007).
const ID = "AbC_dEf-123";

describe("youtube.parse", () => {
  it.each([
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=42s`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=tracking`,
    `youtu.be/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}?rel=0`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `  https://youtu.be/${ID}  `,
  ])("reads %s", (input) => {
    expect(youtube.parse(input)).toBe(ID);
  });

  it.each([
    "",
    "not a link",
    "AbC_dEf-12",
    "AbC_dEf-1234",
    `https://example.com/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `javascript:alert(1)//youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PLfake",
    "https://www.youtube.com/@channel",
  ])("rejects %s", (input) => {
    expect(youtube.parse(input)).toBeNull();
  });
});

describe("nas.parse", () => {
  it.each([
    "framing.mp4",
    "camera/level-1/framing.mp4",
    "Camera Ops/Level 1/Framing basics.MP4",
    "audio/mixing_101.webm",
    "lighting/cues.m4v",
  ])("accepts %s", (input) => {
    expect(nas.parse(input)).toBe(input);
  });

  it("turns Windows separators into slashes", () => {
    expect(nas.parse("camera\\level-1\\framing.mp4")).toBe("camera/level-1/framing.mp4");
  });

  it.each([
    "",
    "/camera/framing.mp4",
    "../framing.mp4",
    "camera/../../etc/passwd.mp4",
    "camera/./framing.mp4",
    "camera//framing.mp4",
    "camera/framing.mov",
    "camera/framing",
    "camera/ framing.mp4",
    "camera/framing.mp4?x=1",
    "https://nas.example/framing.mp4",
    "camera/%2e%2e/framing.mp4",
    `${"a/".repeat(150)}x.mp4`,
  ])("rejects %s", (input) => {
    expect(nas.parse(input)).toBeNull();
  });
});

describe("parseVideo and storedVideo", () => {
  it("parses for the chosen source only", () => {
    expect(parseVideo("youtube", `https://youtu.be/${ID}`)).toEqual({
      provider: "youtube",
      id: ID,
    });
    expect(parseVideo("nas", `https://youtu.be/${ID}`)).toBeNull();
    expect(parseVideo("youtube", "camera/framing.mp4")).toBeNull();
  });

  it("checks stored values again", () => {
    expect(storedVideo("youtube", ID)).toEqual({ provider: "youtube", id: ID });
    expect(storedVideo("nas", "camera/framing.mp4")).toEqual({
      provider: "nas",
      id: "camera/framing.mp4",
    });
    expect(storedVideo(null, null)).toBeNull();
    expect(storedVideo("youtube", null)).toBeNull();
    expect(storedVideo("vimeo", ID)).toBeNull();
    expect(storedVideo("toString", ID)).toBeNull();
    expect(storedVideo("youtube", `https://youtu.be/${ID}`)).toBeNull();
  });

  it("shows the editor a watch link for YouTube and the path for files", () => {
    expect(videoInputValue({ provider: "youtube", id: ID })).toBe(
      `https://www.youtube.com/watch?v=${ID}`,
    );
    expect(videoInputValue({ provider: "nas", id: "camera/framing.mp4" })).toBe(
      "camera/framing.mp4",
    );
  });
});

describe("youtubeEmbedUrl", () => {
  it("uses the privacy-enhanced host and the JS API", () => {
    const url = new URL(youtubeEmbedUrl(ID, { origin: "https://academy.example" }));
    expect(url.hostname).toBe("www.youtube-nocookie.com");
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("https://academy.example");
  });
});

describe("resumeFrom", () => {
  it("starts over near the beginning and rewinds a little otherwise", () => {
    expect(resumeFrom(0)).toBe(0);
    expect(resumeFrom(14)).toBe(0);
    expect(resumeFrom(15)).toBe(10);
    expect(resumeFrom(300.9)).toBe(295);
  });
});
