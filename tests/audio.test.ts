import { describe, expect, it } from "vitest";
import { encodePcm16Base64 } from "../src/audio/audio";

describe("audio conversion", () => {
  it("resamples 48 kHz float input to signed 16-bit 16 kHz PCM", () => {
    const input = new Float32Array(4_800).map((_, index) => Math.sin(index / 20));
    const encoded = encodePcm16Base64(input, 48_000, 16_000);
    const bytes = Buffer.from(encoded, "base64");
    expect(bytes.byteLength).toBe(3_200);
    expect(bytes.readInt16LE(2)).not.toBe(0);
  });
});
