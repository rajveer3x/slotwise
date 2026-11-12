import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getDatabaseUrl } from "@/server/env";

afterEach(() => vi.unstubAllEnvs());

describe("server database environment", () => {
  it.each(["postgresql://demo:placeholder@localhost:5433/demo", "postgres://demo:placeholder@localhost/demo"])("accepts a PostgreSQL connection URL: %s", (url) => {
    vi.stubEnv("DATABASE_URL", url);
    expect(getDatabaseUrl()).toBe(url);
  });

  it.each([undefined, "", "not-a-url", "https://private-user:private-password@example.com"])("rejects a missing or non-PostgreSQL URL without revealing its input", (url) => {
    vi.stubEnv("DATABASE_URL", url);
    expect(() => getDatabaseUrl()).toThrow("Set a valid PostgreSQL DATABASE_URL in .env before using the database.");
  });
});
