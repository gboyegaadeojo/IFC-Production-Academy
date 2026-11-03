/**
 * Just enough OSC for reading an X32. OSC strings are null-terminated and padded to 4 bytes, and
 * numbers are big-endian. See the Unofficial X32/M32 OSC Remote Protocol by Patrick-Gilles Maillot.
 */

function pad(text: string): Buffer {
  const length = Buffer.byteLength(text);
  const padded = Buffer.alloc(length + (4 - (length % 4)));
  padded.write(text);
  return padded;
}

/** A message with string and integer arguments. No arguments means "tell me its value". */
export function encodeOsc(address: string, args: (string | number)[] = []): Buffer {
  const parts = [pad(address)];
  if (args.length > 0) {
    parts.push(pad(`,${args.map((arg) => (typeof arg === "string" ? "s" : "i")).join("")}`));
    for (const arg of args) {
      if (typeof arg === "string") {
        parts.push(pad(arg));
      } else {
        const number = Buffer.alloc(4);
        number.writeInt32BE(arg);
        parts.push(number);
      }
    }
  }
  return Buffer.concat(parts);
}

function readString(buffer: Buffer, offset: number): { value: string; next: number } {
  const end = buffer.indexOf(0, offset);
  if (end < 0) {
    return { value: "", next: buffer.length };
  }
  const length = end - offset;
  return {
    value: buffer.toString("utf8", offset, end),
    next: offset + length + (4 - (length % 4)),
  };
}

export type OscMessage = { address: string; types: string; body: Buffer };

export function decodeOsc(buffer: Buffer): OscMessage | null {
  const address = readString(buffer, 0);
  if (!address.value.startsWith("/") || address.next > buffer.length) {
    return null;
  }
  const types = readString(buffer, address.next);
  if (!types.value.startsWith(",")) {
    return null;
  }
  return { address: address.value, types: types.value, body: buffer.subarray(types.next) };
}

/** The first string argument, such as a channel's name. */
export function readOscString(message: OscMessage): string | null {
  return message.types.startsWith(",s") ? readString(message.body, 0).value : null;
}

/**
 * A meter reply: a blob holding a big-endian length, then a little-endian count, then that many
 * little-endian floats.
 */
export function readMeterBlob(message: OscMessage): number[] | null {
  if (!message.types.startsWith(",b") || message.body.length < 8) {
    return null;
  }
  const count = message.body.readInt32LE(4);
  if (count < 0 || 8 + count * 4 > message.body.length) {
    return null;
  }
  return Array.from({ length: count }, (_, index) => message.body.readFloatLE(8 + index * 4));
}
