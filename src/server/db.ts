import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/server/env";

const globalForDb = globalThis as unknown as { slotwiseDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForDb.slotwiseDb) {
    globalForDb.slotwiseDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl(), connectionTimeoutMillis: 5000 }),
    });
  }
  // One pool per process, including during Next.js development hot reloads.
  return globalForDb.slotwiseDb;
}
