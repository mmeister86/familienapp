import { describe, expect, it } from "vitest";
import { pendingFlush } from "../../src/lib/pending-save.js";
import type { SceneForm } from "../../src/components/layouts/use-scene-form.js";

const form: SceneForm = {
  name: "Morgen",
  start: { kind: "default" } as SceneForm["start"],
  widgets: [],
  palette: undefined,
};

describe("pendingFlush", () => {
  it("returns the previous scene's payload when leaving a dirty scene", () => {
    expect(
      pendingFlush({ sceneId: "a", dirty: true, form }, "b"),
    ).toEqual({ sceneId: "a", form });
    expect(pendingFlush({ sceneId: "a", dirty: true, form }, null)).toEqual({
      sceneId: "a",
      form,
    });
  });

  it("returns null when nothing was dirty", () => {
    expect(pendingFlush({ sceneId: "a", dirty: false, form }, "b")).toBeNull();
  });

  it("returns null when the selection did not change", () => {
    expect(pendingFlush({ sceneId: "a", dirty: true, form }, "a")).toBeNull();
  });

  it("returns null without a form or a previous scene id", () => {
    expect(
      pendingFlush({ sceneId: "a", dirty: true, form: null }, "b"),
    ).toBeNull();
    expect(pendingFlush({ sceneId: null, dirty: true, form }, "b")).toBeNull();
  });
});
