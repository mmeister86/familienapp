import { beforeEach, describe, expect, it, vi } from "vitest";
import confetti from "canvas-confetti";
import {
  celebrateCompletion,
  prefersReducedMotion,
} from "../../src/lib/confetti.js";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const confettiMock = vi.mocked(confetti);

describe("celebrateCompletion", () => {
  beforeEach(() => {
    confettiMock.mockClear();
  });

  it("fires confetti exactly once with reduced-motion safety enabled", () => {
    celebrateCompletion();

    expect(confettiMock).toHaveBeenCalledTimes(1);
    expect(confettiMock).toHaveBeenCalledWith(
      expect.objectContaining({ disableForReducedMotion: true }),
    );
  });

  it("does not fire confetti when reduced motion is requested", () => {
    celebrateCompletion({ reducedMotion: true });

    expect(confettiMock).not.toHaveBeenCalled();
  });

  it("fires confetti once when reduced motion is explicitly off", () => {
    celebrateCompletion({ reducedMotion: false });

    expect(confettiMock).toHaveBeenCalledTimes(1);
  });
});

describe("prefersReducedMotion", () => {
  it("returns false when window.matchMedia is unavailable", () => {
    const originalWindow = globalThis.window;
    const writableGlobal = globalThis as unknown as {
      window?: typeof originalWindow;
    };
    // Simulate an environment without window.matchMedia (SSR / old browser).
    writableGlobal.window = {} as typeof originalWindow;
    try {
      expect(prefersReducedMotion()).toBe(false);
    } finally {
      writableGlobal.window = originalWindow;
    }
  });
});
