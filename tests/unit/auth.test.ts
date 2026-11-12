import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { LoginLimiter } from "@/server/auth/limiter";
import { credentialsSchema } from "@/features/auth/schema";
import { authConfig } from "@/server/auth/config";
describe("authentication boundaries", () => {
  it("normalizes email and rejects oversized passwords including UTF-8 bytes", () => {
    expect(credentialsSchema.parse({ email: " FACULTY@Demo.Slotwise.Test ", password: "pass" }).email).toBe("faculty@demo.slotwise.test");
    expect(credentialsSchema.safeParse({ email: "bad", password: "" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "a@b.test", password: "é".repeat(65) }).success).toBe(false);
  });
  it("reserves simultaneous attempts and expires at the exact window boundary", async () => {
    const limiter = new LoginLimiter();
    const results = await Promise.all(Array.from({ length: 12 }, async () => limiter.admit("same", 1000)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(limiter.admit("different", 1000)).toBe(true);
    expect(limiter.admit("same", 900999)).toBe(false);
    expect(limiter.admit("same", 901000)).toBe(true);
  });
  it("bounds account-rotation attempts globally", () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 100; i++) expect(limiter.admit(String(i), 0)).toBe(true);
    expect(limiter.admit("another", 59999)).toBe(false);
    expect(limiter.admit("another", 60000)).toBe(true);
  });
  it("requires a secret and uses secure cookies for HTTPS", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => authConfig()).toThrow(/AUTH_SECRET/);
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("NEXTAUTH_URL", "https://demo.example.test");
    expect(authConfig().secure).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(() => authConfig()).toThrow(/NEXTAUTH_URL/);
    vi.stubEnv("NEXTAUTH_URL", "http://127.0.0.1:3100");
    expect(authConfig().secure).toBe(false);
    vi.stubEnv("NEXTAUTH_URL", "http://demo.example.test");
    expect(() => authConfig()).toThrow(/HTTPS/);
    vi.unstubAllEnvs();
  });
});
