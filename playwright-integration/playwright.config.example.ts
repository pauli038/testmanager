import type { PlaywrightTestConfig } from "@playwright/test";

export default {
  testDir: "./tests",
  reporter: [
    ["list"],
    [
      "./tests/testmanager-reporter.ts",
      {
        url: process.env.TESTMANAGER_URL || "http://localhost:3000/api/ingest",
        apiKey: process.env.TESTMANAGER_API_KEY,
        runName: `Regression Run - ${new Date().toLocaleString()}`,
      },
    ],
  ],
  use: {
    // captura screenshot solo cuando un test falla, así el reporter
    // puede adjuntarlo automáticamente como evidencia
    screenshot: "only-on-failure",
  },
} satisfies PlaywrightTestConfig;
