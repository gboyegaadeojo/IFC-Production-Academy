import { createSocket, type Socket } from "node:dgram";
import { levelPercent } from "../lib/domain/mixer.ts";
import { decodeOsc, encodeOsc, readMeterBlob, readOscString } from "./osc.ts";

export const X32_PORT = 10023;
/** A subscription lasts 10 seconds. */
const RENEW_MS = 8000;
const NAMES_MS = 60_000;
/** About one update a second: the desk's 50 ms cycle times this factor. */
const TIME_FACTOR = 20;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * /meters/0: 32 channels, 8 aux, 8 FX returns, 16 buses, 6 matrix (70 floats).
 * /meters/2: 16 buses, 6 matrix, main L, main R, mono, then gain reductions (49 floats).
 */
export function metersToLevels(address: string, floats: number[]): Record<string, number> {
  const levels: Record<string, number> = {};
  const put = (id: string, value: number | undefined) => {
    if (value !== undefined) {
      levels[id] = levelPercent(value);
    }
  };
  if (address === "/meters/0") {
    let index = 0;
    for (const [prefix, count] of [
      ["ch", 32],
      ["aux", 8],
      ["fx", 8],
      ["bus", 16],
      ["mtx", 6],
    ] as const) {
      for (let n = 1; n <= count; n += 1) {
        put(`${prefix}${pad(n)}`, floats[index]);
        index += 1;
      }
    }
  } else if (address === "/meters/2") {
    put("main-l", floats[22]);
    put("main-r", floats[23]);
    put("main-m", floats[24]);
  }
  return levels;
}

/** Every address we ask for a name. A request with no value only reads: it changes nothing. */
export function nameAddresses(): { id: string; address: string }[] {
  const out: { id: string; address: string }[] = [
    { id: "main-l", address: "/main/st/config/name" },
    { id: "main-r", address: "/main/st/config/name" },
    { id: "main-m", address: "/main/m/config/name" },
  ];
  for (const [prefix, path, count] of [
    ["ch", "ch", 32],
    ["aux", "auxin", 8],
    ["fx", "fxrtn", 8],
    ["bus", "bus", 16],
    ["mtx", "mtx", 6],
  ] as const) {
    for (let n = 1; n <= count; n += 1) {
      out.push({ id: `${prefix}${pad(n)}`, address: `/${path}/${pad(n)}/config/name` });
    }
  }
  return out;
}

/** The only messages this program ever sends to the desk. None of them can change a setting. */
export function subscribeMessages(): Buffer[] {
  return [
    encodeOsc("/meters", ["/meters/0", TIME_FACTOR]),
    encodeOsc("/meters", ["/meters/2", TIME_FACTOR]),
  ];
}

/** Reads the X32's meters and channel names. Monitoring only. */
export class X32Reader {
  private socket: Socket;
  private levels: Record<string, number> = {};
  private names: Record<string, string> = {};
  private lastHeard = 0;
  private timers: NodeJS.Timeout[] = [];
  private host: string;

  constructor(host: string) {
    this.host = host;
    this.socket = createSocket("udp4");
    // The desk answers to the port we send from, so one socket does both.
    this.socket.on("message", (data) => this.receive(data));
    this.socket.on("error", () => {
      // A network problem: the reading goes stale and the tile says so.
    });
  }

  start(): void {
    this.socket.bind(() => {
      this.subscribe();
      this.askNames();
      this.timers.push(setInterval(() => this.subscribe(), RENEW_MS));
      this.timers.push(setInterval(() => this.askNames(), NAMES_MS));
    });
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.socket.close();
  }

  private subscribe(): void {
    for (const message of subscribeMessages()) {
      this.socket.send(message, X32_PORT, this.host);
    }
  }

  private askNames(): void {
    const addresses = [...new Set(nameAddresses().map((entry) => entry.address))];
    addresses.forEach((address, index) => {
      // Spaced out, so the desk's meters don't stall while it answers.
      setTimeout(() => this.socket.send(encodeOsc(address), X32_PORT, this.host), index * 20);
    });
  }

  private receive(data: Buffer): void {
    const message = decodeOsc(data);
    if (!message) {
      return;
    }
    if (message.address.startsWith("/meters/")) {
      const floats = readMeterBlob(message);
      if (floats) {
        this.lastHeard = Date.now();
        Object.assign(this.levels, metersToLevels(message.address, floats));
      }
      return;
    }
    const name = readOscString(message);
    if (name !== null) {
      for (const entry of nameAddresses()) {
        if (entry.address === message.address && name.trim() !== "") {
          this.names[entry.id] = name.trim().slice(0, 40);
        }
      }
    }
  }

  /** The latest levels, or null if the desk hasn't answered for a few seconds. */
  read(): { levels: Record<string, number>; names: Record<string, string> } | null {
    return Date.now() - this.lastHeard > 5000 ? null : { levels: this.levels, names: this.names };
  }
}
