// The church bridge (ADD-DASH-09): reads the mixer, ProPresenter, and the Magewell on the church
// network, and sends the readings out to the Academy. It only connects outward, so no ports open,
// and it only reads, so it can't change the service. It logs status and counts, never lyrics or
// names. Setup: docs/runbooks/service-dashboard.md.
import { BRIDGE_PROTOCOL } from "../lib/domain/bridge-protocol.ts";
import { MagewellReader } from "./magewell.ts";
import { ProPresenterReader } from "./propresenter.ts";
import { simulatedReading, simulatedSlides } from "./simulate.ts";
import { X32Reader } from "./x32.ts";

const env = (name: string) => process.env[name]?.trim() ?? "";

const academy = env("ACADEMY_URL").replace(/\/$/, "");
const secret = env("LIVE_ROOM_SECRET");
const simulate = process.argv.includes("--simulate");

if (!academy || !secret) {
  console.error("Set ACADEMY_URL and LIVE_ROOM_SECRET. See docs/runbooks/service-dashboard.md.");
  process.exit(1);
}

const x32 = !simulate && env("X32_HOST") ? new X32Reader(env("X32_HOST")) : null;
const propresenter =
  !simulate && env("PROPRESENTER_URL") ? new ProPresenterReader(env("PROPRESENTER_URL")) : null;
const magewell =
  !simulate && env("MAGEWELL_URL")
    ? new MagewellReader(env("MAGEWELL_URL"), env("MAGEWELL_USER"), env("MAGEWELL_PASSWORD"))
    : null;

x32?.start();

let socket: WebSocket | null = null;
let backoff = 1000;
let tick = 0;
let lastSlides = "";
let encoder: Awaited<ReturnType<MagewellReader["read"]>> = null;

function connect(): void {
  const url = `${academy.replace(/^http/, "ws")}/live/bridge`;
  // The secret goes as a subprotocol, so it never appears in an address or a log.
  const next = new WebSocket(url, [BRIDGE_PROTOCOL, secret]);
  next.addEventListener("open", () => {
    backoff = 1000;
    lastSlides = "";
    console.log("Connected to the Academy.");
  });
  next.addEventListener("close", () => {
    socket = null;
    console.log(`Not connected. Trying again in ${backoff / 1000} s.`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  });
  next.addEventListener("error", () => {
    // "close" follows, and that's where it tries again.
  });
  socket = next;
}

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

async function everySecond(): Promise<void> {
  tick += 1;
  if (simulate) {
    send(simulatedReading(tick));
    const slides = simulatedSlides(Math.floor(tick / 10));
    const key = JSON.stringify(slides);
    if (key !== lastSlides) {
      lastSlides = key;
      send(slides);
    }
    return;
  }

  // The encoder changes rarely, and answers slowly.
  if (magewell && tick % 5 === 1) {
    encoder = await magewell.read();
  }
  const [timers, slides] = await Promise.all([
    propresenter?.timers() ?? null,
    propresenter?.slides() ?? null,
  ]);
  const mixer = x32?.read() ?? null;
  send({
    type: "reading",
    levels: mixer?.levels ?? null,
    names: mixer?.names ?? null,
    encoder,
    timers,
  });
  if (slides) {
    const key = `${slides.presentation}:${slides.position}`;
    if (key !== lastSlides) {
      lastSlides = key;
      send({ type: "slides", ...slides });
    }
  }
  if (tick % 60 === 0) {
    console.log(
      `Status: mixer ${mixer ? "ok" : "no answer"}, ProPresenter ${timers ? "ok" : "no answer"}, encoder ${encoder ? "ok" : "no answer"}.`,
    );
  }
}

connect();
let running = false;
setInterval(() => {
  // A slow source must not pile up requests, so skip a beat if the last one hasn't finished.
  if (!running) {
    running = true;
    void everySecond().finally(() => {
      running = false;
    });
  }
}, 1000);
console.log(simulate ? "Bridge started with example readings." : "Bridge started.");
