/**
 * The mixer's channels (ADD-DASH-08). No imports, so the church bridge (bridge/) can run this file
 * directly. Today's desk is the Behringer X32; another desk needs its own reader in the bridge,
 * reporting these same ids.
 */

export type MixerChannel = { id: string; group: string; number: string };

const pad = (n: number) => String(n).padStart(2, "0");

function range(count: number, group: string, prefix: string, label: string): MixerChannel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${pad(index + 1)}`,
    group,
    number: `${label} ${pad(index + 1)}`,
  }));
}

export const MIXER_CHANNELS: readonly MixerChannel[] = [
  { id: "main-l", group: "Main", number: "Main L" },
  { id: "main-r", group: "Main", number: "Main R" },
  { id: "main-m", group: "Main", number: "Mono" },
  ...range(32, "Channels", "ch", "Ch"),
  ...range(8, "Aux in", "aux", "Aux"),
  ...range(8, "FX returns", "fx", "FX"),
  ...range(16, "Mix buses", "bus", "Bus"),
  ...range(6, "Matrix", "mtx", "Mtx"),
];

const KNOWN = new Set(MIXER_CHANNELS.map((channel) => channel.id));

/** Shown until an editor chooses: the mains, then the first channels. */
export const DEFAULT_CHANNELS: readonly string[] = [
  "main-l",
  "main-r",
  "ch01",
  "ch02",
  "ch03",
  "ch04",
  "ch05",
  "ch06",
  "ch07",
  "ch08",
];

/** What the levels tile shows: the editors' choice in their order, or the default. */
export function channelsToShow(chosen: readonly string[]): string[] {
  const known = chosen.filter((id) => KNOWN.has(id));
  return known.length > 0 ? known : [...DEFAULT_CHANNELS];
}

const FLOOR_DB = -60;

/**
 * A linear level (1.0 is digital full scale) as a meter's height from 0 to 100, on a -60 to 0 dB
 * scale. These are signal levels, not room loudness.
 */
export function levelPercent(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 0) {
    return 0;
  }
  const db = 20 * Math.log10(linear);
  return Math.round(Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100)));
}

/** Above -6 dB: close to the top, so a meter shows it. */
export const HOT_PERCENT = 90;
