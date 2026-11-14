import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/server/env";

const globalForDb = globalThis as unknown as { slotwiseDb?: PrismaClient; slotwiseDbClientClass?: typeof PrismaClient };

export function getDb(): PrismaClient {
  const cached = globalForDb.slotwiseDb;
  // HMR preserves globals, but regenerating Prisma replaces its client class.
  // Reusing the old instance would leave new models/fields unavailable.
  if (cached && process.env.NODE_ENV === "development" && globalForDb.slotwiseDbClientClass !== PrismaClient) {
    globalForDb.slotwiseDb = undefined;
    void cached.$disconnect().catch(() => console.error("Could not close the stale development database pool."));
  }
  if (!globalForDb.slotwiseDb) {
    globalForDb.slotwiseDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl(), connectionTimeoutMillis: 5000 }),
    });
    // Prisma returns a proxy, so instanceof is not a reliable identity check.
    globalForDb.slotwiseDbClientClass = PrismaClient;
  }
  // Reuse the pool across ordinary hot reloads with the same generated client.
  return globalForDb.slotwiseDb;
}
