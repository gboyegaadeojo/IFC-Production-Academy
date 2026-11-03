import { createHash } from "node:crypto";

// Reads a Magewell Ultra Encode AIO's local API (magewell.com/api-docs/ultra-encode-aio-api).
// get-status only: monitoring, never control.

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  typeof value === "object" && value !== null ? (value as Obj) : {};

export type EncoderStatus = {
  inputGood: boolean;
  input: string;
  streams: { name: string; live: boolean }[];
};

/** Reads get-status. A stream counts as live when it's in use with no error on it. */
export function readEncoderStatus(answer: unknown): EncoderStatus | null {
  const body = obj(answer);
  if (body.result !== 0) {
    return null;
  }
  const signal = obj(body["input-signal"]);
  const width = Number(signal.cx);
  const height = Number(signal.cy);
  const inputGood = width > 0 && height > 0;
  const live = obj(body["live-status"]).live;
  return {
    inputGood,
    input: inputGood ? `${width}x${height}` : "No signal",
    streams: (Array.isArray(live) ? live : []).slice(0, 10).map((entry) => {
      const stream = obj(entry);
      const name = stream.name;
      return {
        name: typeof name === "string" && name !== "" ? name.slice(0, 200) : "Stream",
        live: Number(stream["is-use"]) > 0 && Number(stream.result) === 0,
      };
    }),
  };
}

/** The API takes the password as an MD5 hash, as its documentation says. */
export function magewellLoginUrl(base: string, user: string, password: string): string {
  const query = new URLSearchParams({
    method: "login",
    id: user,
    pass: createHash("md5").update(password).digest("hex"),
  });
  return `${base}/usapi?${query}`;
}

export class MagewellReader {
  private base: string;
  private user: string;
  private password: string;
  private cookie = "";

  constructor(base: string, user: string, password: string) {
    this.base = base.replace(/\/$/, "");
    this.user = user;
    this.password = password;
  }

  private async login(): Promise<void> {
    if (!this.user) {
      return;
    }
    const response = await fetch(magewellLoginUrl(this.base, this.user, this.password), {
      signal: AbortSignal.timeout(3000),
    });
    this.cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  private async status(): Promise<unknown> {
    const response = await fetch(`${this.base}/usapi?method=get-status`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
      signal: AbortSignal.timeout(3000),
    });
    return response.json();
  }

  async read(): Promise<EncoderStatus | null> {
    try {
      const first = readEncoderStatus(await this.status());
      if (first) {
        return first;
      }
      await this.login();
      return readEncoderStatus(await this.status());
    } catch {
      return null;
    }
  }
}
