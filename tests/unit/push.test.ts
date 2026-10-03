import { describe, expect, it } from "vitest";
import {
  toBase64Url,
  urlBase64ToUint8Array,
} from "../../src/lib/push.js";

describe("urlBase64ToUint8Array", () => {
  it("decodes unpadded base64url (the VAPID key format)", () => {
    expect([...urlBase64ToUint8Array("AQAB")]).toEqual([0x01, 0x00, 0x01]);
  });

  it("decodes padded base64url too", () => {
    expect([...urlBase64ToUint8Array("AQ==")]).toEqual([0x01]);
  });

  it("round-trips a 65-byte P-256 key via Buffer as the oracle", () => {
    const bytes = new Uint8Array(65);
    bytes[0] = 0x02; // uncompressed point marker
    for (let i = 1; i < bytes.length; i++) {
      bytes[i] = i % 256;
    }
    const fixture = Buffer.from(bytes).toString("base64url");
    expect(fixture).toHaveLength(87); // unpadded, 65 bytes
    const decoded = urlBase64ToUint8Array(fixture);
    expect(decoded).toHaveLength(65);
    expect(toBase64Url(decoded.buffer as ArrayBuffer)).toBe(fixture);
  });
});

describe("toBase64Url", () => {
  it("emits no +, / or = characters", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0xef, 0xee, 0xed]);
    const out = toBase64Url(bytes.buffer as ArrayBuffer);
    expect(out).not.toMatch(/[+/=]/);
    expect(out).toBe(Buffer.from(bytes).toString("base64url"));
  });
});
