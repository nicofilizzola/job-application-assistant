import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/** Reads a .env file without pulling in a dependency just for the test config. A CI runner has no
 *  such file and passes the same names in its environment instead, so an absent file is not an
 *  error - it means the values are already here. */
function readEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return process.env as Record<string, string>;

  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return values;
}

const frontend = readEnv("./.env.local");
const backend = readEnv("../backend/.env");

const FRONTEND_PORT = 3100;
const BACKEND_PORT = 8100;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

if (!backend.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set in backend/.env");
}

// Handed to the setup and teardown projects, which talk to the API directly.
process.env.E2E_BACKEND_URL = BACKEND_URL;
process.env.E2E_BACKEND_API_KEY = frontend.BACKEND_API_KEY;
process.env.E2E_APP_PASSWORD = frontend.APP_PASSWORD;

export default defineConfig({
  testDir: "./e2e",
  // One database, shared by every test.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /setup\.ts$/, teardown: "teardown" },
    { name: "teardown", testMatch: /teardown\.ts$/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "uv run fastapi run app/main.py --port 8100",
      cwd: "../backend",
      url: `${BACKEND_URL}/health`,
      env: {
        DATABASE_URL: backend.TEST_DATABASE_URL,
        BACKEND_API_KEY: frontend.BACKEND_API_KEY,
        // The analyse call is made server-side, so page.route() cannot reach it. The seam is here.
        AI_STUB: "true",
        // On Windows stdout is cp1252, and the `fastapi run` banner contains characters it cannot
        // encode, so the server dies with a UnicodeEncodeError before it ever serves /health.
        PYTHONIOENCODING: "utf-8",
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // A production build, not `next dev`: compile-on-demand makes navigation slow enough
      // to time the suite out, and this is closer to what actually gets deployed.
      command: `npm run build && npm run start -- --port ${FRONTEND_PORT}`,
      url: `http://127.0.0.1:${FRONTEND_PORT}/login`,
      env: {
        BACKEND_URL,
        BACKEND_API_KEY: frontend.BACKEND_API_KEY,
        APP_PASSWORD: frontend.APP_PASSWORD,
        AUTH_SECRET: frontend.AUTH_SECRET,
      },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
