import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: the app config pulls in the React
// and Tailwind plugins, none of which the tests need.
export default defineConfig({
  test: {
    // *.test.ts: API and unit tests (node). *.test.tsx: dashboard component tests, which opt in to jsdom with
    // a `// @vitest-environment jsdom` comment at the top of the file.
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Each test file boots the real Express app against its own copy of the
    // test database, so files can run in parallel without sharing state.
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
