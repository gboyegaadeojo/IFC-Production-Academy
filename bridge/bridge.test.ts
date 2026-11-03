import { describe, expect, it } from "vitest";
import { bridgeMessageSchema } from "../lib/domain/live-room";
import { MIXER_CHANNELS } from "../lib/domain/mixer";
import { magewellLoginUrl, readEncoderStatus } from "./magewell";
import { decodeOsc, encodeOsc, readMeterBlob, readOscString } from "./osc";
import { fourSlides, readPresentation, readSlideIndex, readTimers } from "./propresenter";
import { simulatedReading, simulatedSlides } from "./simulate";
import { metersToLevels, nameAddresses, subscribeMessages } from "./x32";

describe("encodeOsc", () => {
  it("matches the X32 protocol document's example, byte for byte", () => {
    expect(encodeOsc("/meters", ["/meters/6", 16]).toString("hex")).toBe(
      "2f6d6574657273002c7369002f6d65746572732f3600000000000010",
    );
  });

  it("sends no arguments for a read", () => {
    expect(encodeOsc("/ch/01/config/name").toString("latin1")).toBe("/ch/01/config/name\0\0");
  });
});

describe("decoding replies", () => {
  it("reads the protocol document's example meter reply", () => {
    const reply = Buffer.from(
      "2f6d65746572732f360000002c6200000000001404000000fd1d2137fdff7f3f0000803f6ebbd534",
      "hex",
    );
    const message = decodeOsc(reply);
    expect(message?.address).toBe("/meters/6");
    const floats = readMeterBlob(message!);
    expect(floats).toHaveLength(4);
    expect(floats?.[2]).toBe(1);
  });

  it("reads a channel name", () => {
    const message = decodeOsc(encodeOsc("/ch/01/config/name", ["Fake Vox"]));
    expect(readOscString(message!)).toBe("Fake Vox");
  });

  it.each([
    ["not OSC", Buffer.from("hello")],
    ["empty", Buffer.alloc(0)],
  ])("ignores %s", (_, data) => {
    expect(decodeOsc(data)).toBeNull();
  });

  it("refuses a blob that claims more than it holds", () => {
    const bad = Buffer.concat([
      Buffer.from("/meters/0\0\0\0,b\0\0", "latin1"),
      Buffer.from([0, 0, 0, 8, 0xff, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    expect(readMeterBlob(decodeOsc(bad)!)).toBeNull();
  });
});

describe("metersToLevels", () => {
  it("places /meters/0 in the documented order", () => {
    const floats = Array.from({ length: 70 }, () => 0);
    floats[0] = 1; // Ch 01
    floats[32] = 1; // Aux 01
    floats[40] = 1; // FX 01
    floats[48] = 1; // Bus 01
    floats[64] = 1; // Mtx 01
    const levels = metersToLevels("/meters/0", floats);
    for (const id of ["ch01", "aux01", "fx01", "bus01", "mtx01"]) {
      expect(levels[id]).toBe(100);
    }
    expect(levels.ch02).toBe(0);
    expect(levels.mtx06).toBe(0);
  });

  it("finds the mains in /meters/2", () => {
    const floats = Array.from({ length: 49 }, () => 0);
    floats[22] = 1;
    floats[24] = 0.5012;
    expect(metersToLevels("/meters/2", floats)).toEqual({
      "main-l": 100,
      "main-r": 0,
      "main-m": 90,
    });
  });

  it("reports every channel the app knows about", () => {
    const levels = {
      ...metersToLevels(
        "/meters/0",
        Array.from({ length: 70 }, () => 0),
      ),
      ...metersToLevels(
        "/meters/2",
        Array.from({ length: 49 }, () => 0),
      ),
    };
    for (const channel of MIXER_CHANNELS) {
      expect(levels).toHaveProperty(channel.id);
    }
  });
});

describe("read only", () => {
  it("only ever asks the desk for meters", () => {
    for (const message of subscribeMessages()) {
      expect(decodeOsc(message)?.address).toBe("/meters");
    }
  });

  it("asks for names with no value, which can't change one", () => {
    for (const { address } of nameAddresses()) {
      expect(encodeOsc(address).toString("latin1")).not.toContain(",");
    }
  });
});

describe("ProPresenter", () => {
  const answer = {
    presentation: {
      id: { uuid: "fake-uuid", name: "Fake Song" },
      groups: [
        { name: "Verse", slides: [{ text: "One" }, { text: "Two" }] },
        { name: "Chorus", slides: [{ text: "Three" }, { text: "Four" }, { text: "Five" }] },
      ],
    },
  };

  it("numbers slides across groups", () => {
    const read = readPresentation(answer);
    expect(read?.slides.map((slide) => slide.index)).toEqual([0, 1, 2, 3, 4]);
    expect(read?.slides[2]?.text).toBe("Three");
    expect(read?.name).toBe("Fake Song");
  });

  it("gives the slide on screen and the next three", () => {
    const read = readPresentation(answer)!;
    expect(fourSlides(read, 1).map((slide) => slide.text)).toEqual([
      "Two",
      "Three",
      "Four",
      "Five",
    ]);
  });

  it("gives fewer near the end", () => {
    expect(fourSlides(readPresentation(answer)!, 4)).toHaveLength(1);
  });

  it("reads the slide index", () => {
    expect(
      readSlideIndex({ presentation_index: { index: 3, presentation_id: { uuid: "u" } } }),
    ).toEqual({ index: 3, uuid: "u" });
    expect(readSlideIndex({ presentation_index: null })).toBeNull();
  });

  it("reads timers", () => {
    expect(readTimers([{ id: { name: "Fake" }, time: "00:05:00", state: "running" }])).toEqual([
      { name: "Fake", time: "00:05:00", state: "running" },
    ]);
    expect(readTimers("odd")).toEqual([]);
  });

  it("copes with what it doesn't expect", () => {
    expect(readPresentation({})).toBeNull();
    expect(readPresentation(null)).toBeNull();
  });
});

describe("Magewell", () => {
  it("reads the signal and streams", () => {
    expect(
      readEncoderStatus({
        result: 0,
        "input-signal": { cx: 1920, cy: 1080 },
        "live-status": {
          live: [
            { name: "Fake YouTube", "is-use": 1, result: 0 },
            { name: "Fake Facebook", "is-use": 1, result: 5 },
            { name: "Unused", "is-use": 0, result: 0 },
          ],
        },
      }),
    ).toEqual({
      inputGood: true,
      input: "1920x1080",
      streams: [
        { name: "Fake YouTube", live: true },
        { name: "Fake Facebook", live: false },
        { name: "Unused", live: false },
      ],
    });
  });

  it("says when there's no signal", () => {
    expect(readEncoderStatus({ result: 0, "input-signal": { cx: 0, cy: 0 } })).toMatchObject({
      inputGood: false,
      input: "No signal",
    });
  });

  it("treats a refused call as no answer", () => {
    expect(readEncoderStatus({ result: 36 })).toBeNull();
    expect(readEncoderStatus(null)).toBeNull();
  });

  it("hashes the password, as the API asks", () => {
    const url = new URL(magewellLoginUrl("http://fake", "admin", "password"));
    expect(url.searchParams.get("pass")).toBe("5f4dcc3b5aa765d61d8327deb882cf99");
  });
});

describe("what the bridge sends", () => {
  it("passes the live room's own check", () => {
    expect(bridgeMessageSchema.safeParse(simulatedReading(3)).success).toBe(true);
    expect(bridgeMessageSchema.safeParse(simulatedSlides(2)).success).toBe(true);
  });
});
