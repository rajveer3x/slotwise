import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ created: vi.fn(), disconnect: vi.fn().mockResolvedValue(undefined) }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ getDatabaseUrl: () => "postgresql://synthetic:placeholder@localhost/test" }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor() { mocked.created(); }
    $disconnect = mocked.disconnect;
  },
}));
import { getDb } from "@/server/db";

const cache = globalThis as unknown as { slotwiseDb?: ReturnType<typeof getDb>; slotwiseDbClientClass?: unknown };
beforeEach(() => { delete cache.slotwiseDb; delete cache.slotwiseDbClientClass; vi.clearAllMocks(); });
afterEach(() => { delete cache.slotwiseDb; delete cache.slotwiseDbClientClass; vi.unstubAllEnvs(); });

describe("database client across development hot reloads", () => {
  it("reuses the current client and its connection pool", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getDb()).toBe(getDb());
    expect(mocked.created).toHaveBeenCalledTimes(1);
    expect(mocked.disconnect).not.toHaveBeenCalled();
  });

  it.each(["legacy untagged", "older generated class"])("retires a %s cached client and exposes the new client", (kind) => {
    vi.stubEnv("NODE_ENV", "development");
    const disconnect = vi.fn().mockResolvedValue(undefined);
    class PreviousClient { $disconnect = disconnect; }
    const previous = new PreviousClient() as unknown as ReturnType<typeof getDb>;
    cache.slotwiseDb = previous;
    if (kind === "older generated class") cache.slotwiseDbClientClass = PreviousClient;
    const current = getDb();
    expect(current).not.toBe(previous);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(getDb()).toBe(current);
    expect(mocked.created).toHaveBeenCalledTimes(1);
  });

  it("does not recycle production clients based on development class identity", () => {
    vi.stubEnv("NODE_ENV", "production");
    const disconnect = vi.fn();
    const previous = { $disconnect: disconnect } as unknown as ReturnType<typeof getDb>;
    cache.slotwiseDb = previous;
    expect(getDb()).toBe(previous);
    expect(disconnect).not.toHaveBeenCalled();
    expect(mocked.created).not.toHaveBeenCalled();
  });
});
