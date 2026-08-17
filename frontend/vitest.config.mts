import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    // Pinned west of UTC so the date helpers are tested somewhere their UTC-versus-local
    // difference actually shows. Setting TZ inside a test cannot be undone - Node keeps the
    // last zone it read - so it has to be set once, here, for the whole run.
    env: { TZ: "America/Los_Angeles" },
  },
});
