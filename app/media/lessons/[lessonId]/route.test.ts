import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's collaborators are mocked: the session, the RLS lesson read, and the configuration.
// Addresses and tokens are fake placeholders.
const { getCurrentUser, mediaConfig, readableLibraryVideo } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  mediaConfig: vi.fn(),
  readableLibraryVideo: vi.fn(),
}));
vi.mock("@/lib/data/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/data/media", () => ({ mediaConfig, readableLibraryVideo }));

const { GET, HEAD } = await import("./route");

const LESSON = "dddddddd-0000-4000-8000-000000000001";
const CONFIG = {
  originUrl: "https://media.example.org",
  accessClientId: "fake-id",
  accessClientSecret: "fake-secret",
};
const context = (lessonId = LESSON) => ({ params: Promise.resolve({ lessonId }) });
const request = (headers: Record<string, string> = {}, method = "GET") =>
  new Request(`https://academy.example/media/lessons/${LESSON}`, { method, headers });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: "u", displayName: "Test", status: "active" });
  mediaConfig.mockReturnValue(CONFIG);
  readableLibraryVideo.mockResolvedValue("camera/level-1/framing.mp4");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /media/lessons/[lessonId]", () => {
  it("streams the file for someone who may read the lesson, forwarding the range", async () => {
    fetchMock.mockResolvedValue(
      new Response("partial", {
        status: 206,
        headers: { "content-type": "video/mp4", "content-range": "bytes 0-6/100" },
      }),
    );
    const response = await GET(request({ range: "bytes=0-6" }), context());

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("partial");
    expect(response.headers.get("content-range")).toBe("bytes 0-6/100");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://media.example.org/camera/level-1/framing.mp4");
    const headers = new Headers(init?.headers);
    expect(headers.get("range")).toBe("bytes=0-6");
    expect(headers.get("cf-access-client-id")).toBe("fake-id");
    expect(init?.redirect).toBe("manual");
  });

  it("answers HEAD without a body", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 200, headers: { "content-type": "video/mp4" } }),
    );
    const response = await HEAD(request({}, "HEAD"), context());
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("HEAD");
  });

  it("refuses signed-out and inactive people without touching the library", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET(request(), context())).status).toBe(401);
    getCurrentUser.mockResolvedValue({ id: "u", displayName: "Test", status: "suspended" });
    expect((await GET(request(), context())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not found when the lesson isn't readable or has no library video", async () => {
    readableLibraryVideo.mockResolvedValue(null);
    expect((await GET(request(), context())).status).toBe(404);
    expect((await GET(request(), context("not-a-uuid"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the library isn't connected", async () => {
    mediaConfig.mockReturnValue(null);
    expect((await GET(request(), context())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the origin can't be reached or answers with a page", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    expect((await GET(request(), context())).status).toBe(503);

    fetchMock.mockResolvedValueOnce(
      new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect((await GET(request(), context())).status).toBe(502);
  });

  it("passes on a missing file as not found", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    expect((await GET(request(), context())).status).toBe(404);
  });
});
