import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../src/server/db";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("Isolated test database required.");
process.env.DATABASE_URL = url;

test("development cache reuses real Prisma proxies and replaces an older generated constructor", async () => {
  const runtimeEnv: Record<string, string | undefined> = process.env;
  const previousMode = runtimeEnv.NODE_ENV;
  runtimeEnv.NODE_ENV = "development";
  const cache = globalThis as unknown as { slotwiseDbClientClass?: unknown };
  let db = getDb();
  try {
    assert.equal(getDb(), db);
    assert.equal(getDb(), db);
    await db.leaveRequest.count();
    // Simulate HMR retaining a client from the previous generated class.
    cache.slotwiseDbClientClass = class PreviousGeneratedClient {};
    const replacement = getDb();
    assert.notEqual(replacement, db);
    db = replacement;
    assert.equal(getDb(), db);
    await db.leaveRequest.count();
  } finally {
    await db.$disconnect();
    if (previousMode === undefined) delete runtimeEnv.NODE_ENV;
    else runtimeEnv.NODE_ENV = previousMode;
  }
});
