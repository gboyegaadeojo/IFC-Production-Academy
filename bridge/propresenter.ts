// Reads ProPresenter's network API (openapi.propresenter.com). GET only: monitoring, never control.

const TIMEOUT_MS = 2000;
const TEXT_LIMIT = 1900;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  typeof value === "object" && value !== null ? (value as Obj) : {};

export type PresentationSlides = {
  uuid: string;
  name: string;
  slides: { index: number; text: string }[];
};

/** A presentation's slides in order, numbered as ProPresenter numbers them for thumbnails. */
export function readPresentation(answer: unknown): PresentationSlides | null {
  const presentation = obj(obj(answer).presentation);
  const id = obj(presentation.id);
  if (typeof id.uuid !== "string") {
    return null;
  }
  const groups = Array.isArray(presentation.groups) ? presentation.groups : [];
  let index = 0;
  const slides: { index: number; text: string }[] = [];
  for (const group of groups) {
    const list = obj(group).slides;
    for (const slide of Array.isArray(list) ? list : []) {
      const text = obj(slide).text;
      slides.push({ index, text: typeof text === "string" ? text.slice(0, TEXT_LIMIT) : "" });
      index += 1;
    }
  }
  return {
    uuid: id.uuid,
    name: typeof id.name === "string" ? id.name.slice(0, 300) : "",
    slides,
  };
}

/** Which slide is on screen, and in which presentation. */
export function readSlideIndex(answer: unknown): { index: number; uuid: string } | null {
  const position = obj(obj(answer).presentation_index);
  const uuid = obj(position.presentation_id).uuid;
  return typeof position.index === "number" && typeof uuid === "string"
    ? { index: position.index, uuid }
    : null;
}

/** The slide on screen and the next three. Fewer near the end of a presentation. */
export function fourSlides(
  presentation: PresentationSlides,
  index: number,
): { index: number; text: string }[] {
  return presentation.slides.slice(index, index + 4);
}

export type Timer = { name: string; time: string; state: string };

export function readTimers(answer: unknown): Timer[] {
  return (Array.isArray(answer) ? answer : []).slice(0, 30).map((timer) => {
    const entry = obj(timer);
    const name = obj(entry.id).name;
    return {
      name: typeof name === "string" ? name.slice(0, 200) : "Timer",
      time: typeof entry.time === "string" ? entry.time.slice(0, 40) : "",
      state: typeof entry.state === "string" ? entry.state.slice(0, 40) : "",
    };
  });
}

/** Reads ProPresenter. Monitoring only: every request is a GET. */
export class ProPresenterReader {
  private base: string;
  private presentation: PresentationSlides | null = null;
  private images = new Map<string, string | null>();

  constructor(base: string) {
    this.base = base.replace(/\/$/, "");
  }

  async timers(): Promise<Timer[] | null> {
    try {
      return readTimers(await getJson(`${this.base}/v1/timers/current`));
    } catch {
      return null;
    }
  }

  private async active(uuid: string): Promise<PresentationSlides | null> {
    if (this.presentation?.uuid === uuid) {
      return this.presentation;
    }
    // The published spec says /active; a client library for it uses /current. Either will do.
    for (const path of ["/v1/presentation/active", "/v1/presentation/current"]) {
      try {
        const read = readPresentation(await getJson(`${this.base}${path}`));
        if (read) {
          this.presentation = read;
          this.images.clear();
          return read;
        }
      } catch {
        // Try the other.
      }
    }
    return null;
  }

  private async image(uuid: string, index: number): Promise<string | null> {
    const key = `${uuid}:${index}`;
    const held = this.images.get(key);
    if (held !== undefined) {
      return held;
    }
    let image: string | null = null;
    try {
      const response = await fetch(
        `${this.base}/v1/presentation/${uuid}/thumbnail/${index}?quality=240`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        // Too big for one message: show the words instead.
        if (bytes.length < 120_000) {
          image = `data:image/jpeg;base64,${bytes.toString("base64")}`;
        }
      }
    } catch {
      // Words instead.
    }
    this.images.set(key, image);
    return image;
  }

  /** The four slides, or null if nothing is on screen. */
  async slides(): Promise<{
    presentation: string;
    position: number;
    total: number;
    slides: { index: number; text: string; image: string | null }[];
  } | null> {
    try {
      const position = readSlideIndex(await getJson(`${this.base}/v1/presentation/slide_index`));
      if (!position) {
        return null;
      }
      const presentation = await this.active(position.uuid);
      if (!presentation) {
        return null;
      }
      const four = fourSlides(presentation, position.index);
      return {
        presentation: presentation.name,
        position: position.index,
        total: presentation.slides.length,
        slides: await Promise.all(
          four.map(async (slide) => ({
            ...slide,
            image: await this.image(presentation.uuid, slide.index),
          })),
        ),
      };
    } catch {
      return null;
    }
  }
}
