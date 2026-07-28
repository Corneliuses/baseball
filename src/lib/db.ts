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
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
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
