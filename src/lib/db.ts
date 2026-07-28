import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/// Prisma 7 has no bundled query engine — it talks to Postgres through a driver
/// adapter, which must be constructed explicitly.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const isProduction = process.env.NODE_ENV === "production";
    const message = "DATABASE_URL is not set — see .env.example";

    if (isProduction) {
      // In production, fail fast with a clear error. Do not silently degrade.
      throw new Error(message);
    }

    // In development/build, throw with a message. Callers wrap in try-catch.
    throw new Error(message);
  }
  // The connect timeout is load-bearing, not tuning. Without it, node-postgres
  // waits on the OS TCP timeout, so a query against an unreachable database
  // hangs rather than failing — measured at over 75 seconds with no rejection.
  // Callers like getPublicTeams wrap their queries in try/catch, but a catch
  // block cannot fire on a promise that never settles, and prerendering a page
  // that hangs blows Next's 60s static-generation budget and fails the build.
  // Five seconds turns "the build dies" into "the page renders empty".
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }),
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/// Lazily create the database client. Delays error until actual usage, allowing
/// graceful error handling in callers and enabling builds without DATABASE_URL.
let clientInstance: PrismaClient | null = null;

export const db = new Proxy({} as PrismaClient, {
  get(target, prop: string | symbol) {
    if (clientInstance === null) {
      clientInstance = globalForPrisma.prisma ?? createClient();
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = clientInstance;
      }
    }
    return (clientInstance as unknown as Record<string | symbol, unknown>)[prop];
  },
});
