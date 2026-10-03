import { describe, expect, it } from "vitest";
import { isOffline } from "../../src/lib/connection.js";

describe("isOffline", () => {
  it("returns false when the connection state is unknown", () => {
    expect(isOffline(undefined)).toBe(false);
  });

  it("returns false before the first successful connection", () => {
    expect(isOffline({ hasEverConnected: false, isWebSocketConnected: false })).toBe(false);
  });

  it("returns false while the websocket is connected", () => {
    expect(isOffline({ hasEverConnected: true, isWebSocketConnected: true })).toBe(false);
  });

  it("returns true when a previously connected websocket drops", () => {
    expect(isOffline({ hasEverConnected: true, isWebSocketConnected: false })).toBe(true);
  });
});
