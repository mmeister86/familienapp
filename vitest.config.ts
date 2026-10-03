import { defineConfig } from "vitest/config";

// Two projects: plain Node unit tests (pure helpers, no backend) and
// edge-runtime DB tests (Convex functions via convex-test). The unit glob
// preserves all pre-existing tests/unit tests.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "convex",
          environment: "node",
          include: ["tests/convex/**/*.test.ts"],
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
