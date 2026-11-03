// Proves the live room end to end in local workerd (ADD-DASH-09): a screen with a good ticket gets
// what the bridge sends, a wrong secret and a bad ticket are refused, and a screen can't send
// anything on to others. CI runs this against `wrangler dev`, with fake readings only.
import { createHmac } from "node:crypto";

const base = process.argv[2];
const secret = process.argv[3];
const ws = base.replace(/^http/, "ws");

function ticket() {
  const expires = String(Math.floor(Date.now() / 1000) + 60);
  return `${expires}.${createHmac("sha256", secret).update(expires).digest("base64url")}`;
}

function open(url, protocols) {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, protocols);
    const messages = [];
    socket.addEventListener("message", (event) => messages.push(JSON.parse(event.data)));
    socket.addEventListener("open", () => resolve({ socket, messages, ok: true }));
    socket.addEventListener("error", () => resolve({ socket, messages, ok: false }));
  });
}

async function until(check, what) {
  for (let i = 0; i < 50; i += 1) {
    if (check()) {
      return;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function expect(condition, what) {
  if (!condition) {
    throw new Error(`Failed: ${what}`);
  }
  console.log(`ok: ${what}`);
}

const reading = {
  type: "reading",
  levels: { ch01: 50 },
  names: { ch01: "Fake" },
  encoder: null,
  timers: null,
};

expect(
  !(await open(`${ws}/live/bridge`, ["ifc-bridge", "wrong"])).ok,
  "a wrong bridge secret is refused",
);
expect(!(await open(`${ws}/live/connect?ticket=1.nope`)).ok, "a bad ticket is refused");
expect(!(await open(`${ws}/live/connect`)).ok, "no ticket is refused");

const viewer = await open(`${ws}/live/connect?ticket=${encodeURIComponent(ticket())}`);
expect(viewer.ok, "a screen with a good ticket connects");
await until(() => viewer.messages.length > 0, "the first state");
expect("reading" in viewer.messages[0], "a new screen is told the current state straight away");

const bridge = await open(`${ws}/live/bridge`, ["ifc-bridge", secret]);
expect(bridge.ok, "the bridge connects with the secret");
const before = viewer.messages.length;

bridge.socket.send(JSON.stringify({ type: "control", command: "next" }));
bridge.socket.send("not json");
bridge.socket.send(JSON.stringify(reading));
await until(() => viewer.messages.length > before, "the reading");
expect(viewer.messages.length === before + 1, "anything that isn't a valid reading goes nowhere");
const got = viewer.messages.at(-1);
expect(got.reading.levels.ch01 === 50, "the screen gets the bridge's reading");
expect(typeof got.bridgeSeenAt === "number", "the room says when it last heard the bridge");

const other = await open(`${ws}/live/connect?ticket=${encodeURIComponent(ticket())}`);
await until(() => other.messages.length > 0, "the second screen's state");
const seen = other.messages.length;
viewer.socket.send(JSON.stringify(reading));
await new Promise((done) => setTimeout(done, 500));
expect(other.messages.length === seen, "a screen can't send anything to other screens");
expect(other.messages[0].reading.levels.ch01 === 50, "a later screen gets the last reading");

for (const { socket } of [viewer, bridge, other]) {
  socket.close();
}
console.log("Live room smoke test passed.");
process.exit(0);
