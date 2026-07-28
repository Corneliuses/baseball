import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/// Prisma 7 has no bundled query engine — it talks to Postgres through a driver
/// adapter, which must be constructed explicitly.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // During build time, DATABASE_URL may not be set. Return a stub client
    // that will fail at runtime if actually called. This allows the build to
    // complete; production deployments must set DATABASE_URL.
    if (process.env.NODE_ENV === "production" || process.env.npm_lifecycle_event === "build") {
      console.warn(
        "DATABASE_URL not set during build. Production will require it. See .env.example"
      );
      // Return a stub that throws if actually used
      return new Proxy({} as PrismaClient, {
        get() {
          throw new Error("DATABASE_URL is not set — see .env.example");
        },
      }) as PrismaClient;
    }
    throw new Error("DATABASE_URL is not set — see .env.example");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/// Reused across hot reloads in dev so we don't exhaust Neon's connection pool.
export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
