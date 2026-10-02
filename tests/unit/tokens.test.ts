import { describe, expect, it } from "vitest";
import {
  bearerToken,
  timingSafeEqual,
} from "../../convex/lib/tokens.js";
describe("bearerToken", () => {
  it("extracts the token after 'Bearer '", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
  });
  it("trims surrounding whitespace", () => {
    expect(bearerToken("Bearer   abc123  ")).toBe("abc123");
  });
  it("returns null for a missing header", () => {
    expect(bearerToken(null)).toBeNull();
  });
  it("returns null for the wrong scheme", () => {
    expect(bearerToken("Basic abc123")).toBeNull();
  });
  it("accepts a lowercase scheme", () => {
    expect(bearerToken("bearer abc")).toBe("abc");
  });
  it("accepts an uppercase scheme and a tab separator", () => {
    expect(bearerToken("BEARER\tabc")).toBe("abc");
  });
  it("returns null for an empty token", () => {
    expect(bearerToken("Bearer ")).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  it("is true for equal strings", () => {
    expect(timingSafeEqual("s3cret", "s3cret")).toBe(true);
  });
  it("is false for different strings of equal length", () => {
    expect(timingSafeEqual("s3cret", "s3crat")).toBe(false);
  });
  it("is false for different lengths", () => {
    expect(timingSafeEqual("s3cret", "s3cret-long")).toBe(false);
  });
  it("is false for an asymmetric length the other direction", () => {
    expect(timingSafeEqual("s3cret-long", "s3cret")).toBe(false);
  });
  it("is false when one side carries a trailing NUL", () => {
    expect(timingSafeEqual("abc", "abc\u0000")).toBe(false);
  });
  it("is false for two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(false);
  });
  it("is false when one string is empty", () => {
    expect(timingSafeEqual("", "x")).toBe(false);
    expect(timingSafeEqual("x", "")).toBe(false);
  });
});
