import "dotenv/config";
import { defineConfig } from "prisma/config";

// This file configures the Prisma CLI only — migrate, studio, generate. The
// application's own connection is built in src/lib/db.ts from DATABASE_URL.
//
// Those two want *different* endpoints on Neon. DATABASE_URL points at the
// pooled host (`...-pooler.<region>.aws.neon.tech`), which is what serverless
// functions need and what the Vercel Marketplace integration injects. But the
// pooler is PgBouncer in transaction mode, and `prisma migrate` needs a session
// it can hold a Postgres advisory lock on for the length of the migration, so
// it must talk to the direct host instead.
//
// Prisma 7's config has no `directUrl` — that was a schema-level attribute in
// Prisma 6 and earlier, removed along with the datasource url block. Preferring
// an unpooled variable here is the replacement. `DATABASE_URL_UNPOOLED` is the
// name Neon's own Vercel integration injects, so deployed environments already
// have it; locally it is the same URL with `-pooler` dropped from the hostname.
const migrationUrl =
  process.env["DATABASE_URL_UNPOOLED"] ?? process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
