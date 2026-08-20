import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // Vitest's 5s default budgets a test *body*. Several suites here spend
    // most of their first test loading a module graph rather than asserting,
    // and the bulk-invite and message-send suites deliberately sleep
    // MIN_SEND_INTERVAL_MS (600ms) per simulated send to prove the Resend rate
    // limit is respected. Both are real work, not hangs — but on a loaded CI
    // runner the contention pushed the heaviest of them past 5s and turned
    // `pnpm check` intermittently red.
    //
    // The page tests were fixed at the source (their page imports are static
    // now, so module loading happens during collection, which no timeout
    // governs). This is the safety net for everything else: a genuinely hung
    // test still fails, just later, which is the right trade for a gate whose
    // whole value is that a red run means something.
    testTimeout: 15_000,
  },
});
