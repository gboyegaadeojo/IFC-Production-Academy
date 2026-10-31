import { describe, expect, it } from "vitest";
import { originOutcome, originRequestHeaders, originUrl, videoContentType } from "./media";

// The origin address and tokens here are fake placeholders.
const BASE = "https://media.example.org";
const TOKEN = { accessClientId: "fake-id", accessClientSecret: "fake-secret" };

describe("originUrl", () => {
  it("encodes each path segment", () => {
    expect(originUrl(BASE, "Camera Ops/Level 1/Framing basics.mp4")).toBe(
      "https://media.example.org/Camera%20Ops/Level%201/Framing%20basics.mp4",
    );
  });

  it("keeps a base path and drops query strings", () => {
    expect(originUrl("https://media.example.org/training/?x=1", "camera/a.mp4")).toBe(
      "https://media.example.org/training/camera/a.mp4",
    );
  });

  it("refuses unsafe paths and plain HTTP", () => {
    expect(originUrl(BASE, "../secret.mp4")).toBeNull();
    expect(originUrl(BASE, "/etc/a.mp4")).toBeNull();
    expect(originUrl(BASE, "camera/a.mov")).toBeNull();
    expect(originUrl("http://media.example.org", "camera/a.mp4")).toBeNull();
    expect(originUrl("not a url", "camera/a.mp4")).toBeNull();
  });
});

describe("originRequestHeaders", () => {
  it("sends the Access token and a single byte range", () => {
    const headers = originRequestHeaders({ range: "bytes=100-", ifRange: '"abc"' }, TOKEN);
    expect(headers.get("CF-Access-Client-Id")).toBe("fake-id");
    expect(headers.get("CF-Access-Client-Secret")).toBe("fake-secret");
    expect(headers.get("Range")).toBe("bytes=100-");
    expect(headers.get("If-Range")).toBe('"abc"');
  });

  it("drops multi-range and malformed ranges", () => {
    for (const range of ["bytes=0-1,5-6", "items=0-1", "bytes=-", "bytes=abc"]) {
      expect(originRequestHeaders({ range, ifRange: null }, TOKEN).get("Range")).toBeNull();
    }
    expect(originRequestHeaders({ range: null, ifRange: '"x"' }, TOKEN).get("If-Range")).toBeNull();
  });
});

describe("videoContentType", () => {
  it("comes from the extension", () => {
    expect(videoContentType("a/b.MP4")).toBe("video/mp4");
    expect(videoContentType("a/b.m4v")).toBe("video/mp4");
    expect(videoContentType("a/b.webm")).toBe("video/webm");
  });
});

describe("originOutcome", () => {
  const upstream = (status: number, headers: Record<string, string>) => ({
    status,
    headers: new Headers(headers),
  });

  it("streams a partial response with its range headers, privately", () => {
    const outcome = originOutcome(
      upstream(206, {
        "content-type": "video/mp4",
        "content-range": "bytes 0-99/1000",
        "content-length": "100",
        "accept-ranges": "bytes",
        "set-cookie": "should-not-pass",
      }),
      "camera/a.mp4",
    );
    expect(outcome.kind).toBe("stream");
    if (outcome.kind !== "stream") return;
    expect(outcome.status).toBe(206);
    expect(outcome.headers.get("content-range")).toBe("bytes 0-99/1000");
    expect(outcome.headers.get("content-length")).toBe("100");
    expect(outcome.headers.get("cache-control")).toBe("private, no-store");
    expect(outcome.headers.get("content-type")).toBe("video/mp4");
    expect(outcome.headers.get("set-cookie")).toBeNull();
  });

  it("uses the stored path's type, not the origin's", () => {
    const outcome = originOutcome(
      upstream(200, { "content-type": "application/octet-stream" }),
      "camera/a.webm",
    );
    expect(outcome.kind === "stream" && outcome.headers.get("content-type")).toBe("video/webm");
  });

  it("treats an HTML page (such as an Access login) as unavailable", () => {
    expect(originOutcome(upstream(200, { "content-type": "text/html" }), "a.mp4").kind).toBe(
      "unavailable",
    );
    expect(originOutcome(upstream(302, { location: "https://login" }), "a.mp4").kind).toBe(
      "unavailable",
    );
    expect(originOutcome(upstream(500, {}), "a.mp4").kind).toBe("unavailable");
  });

  it("passes through missing files, unchanged files, and bad ranges", () => {
    expect(originOutcome(upstream(404, {}), "a.mp4").kind).toBe("missing");
    expect(originOutcome(upstream(304, { etag: '"x"' }), "a.mp4").kind).toBe("unchanged");
    expect(originOutcome(upstream(416, { "content-range": "bytes */10" }), "a.mp4").kind).toBe(
      "range_not_satisfiable",
    );
  });
});
