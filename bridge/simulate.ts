import { MIXER_CHANNELS } from "../lib/domain/mixer.ts";

const LINES = [
  "Example lyric line one",
  "Example lyric line two",
  "Example lyric line three",
  "Example chorus line one",
  "Example chorus line two",
  "Example bridge line",
];

/** Made-up readings, so the dashboard can be tried with no gear connected. Obviously fake. */
export function simulatedReading(tick: number) {
  const levels: Record<string, number> = {};
  MIXER_CHANNELS.forEach((channel, index) => {
    levels[channel.id] = Math.round(45 + 25 * Math.sin(tick * 0.6 + index));
  });
  return {
    type: "reading" as const,
    levels,
    names: { ch01: "Example Kick", ch02: "Example Snare", ch13: "Example Vox" },
    encoder: {
      inputGood: true,
      input: "1920x1080",
      streams: [
        { name: "Example YouTube", live: true },
        { name: "Example Facebook", live: true },
      ],
    },
    timers: [{ name: "Example countdown", time: "00:05:00", state: "running" }],
  };
}

export function simulatedSlides(position: number) {
  const start = position % LINES.length;
  return {
    type: "slides" as const,
    presentation: "Example Song",
    position: start,
    total: LINES.length,
    slides: LINES.slice(start, start + 4).map((text, offset) => ({
      index: start + offset,
      text,
      image: null,
    })),
  };
}
