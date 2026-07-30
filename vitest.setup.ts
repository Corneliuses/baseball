import "@testing-library/jest-dom/vitest";

// Pin the app timezone for every test, regardless of what the host shell or
// CI runner happens to export. src/lib/calendar.ts reads APP_TIMEZONE once at
// module load, and the whole schedule test suite hardcodes America/Chicago's
// UTC offsets directly (e.g. "2026-08-01T05:00:00.000Z" for midnight
// Central) — leaving this to the ambient environment would make those
// assertions non-deterministic for anyone who has APP_TIMEZONE set locally.
process.env.APP_TIMEZONE = "America/Chicago";
