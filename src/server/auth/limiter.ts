import "server-only";
import { createHash } from "node:crypto";

// A synchronous admission step reserves attempts BEFORE password verification.
// Process-local only: replace with a shared limiter before multi-instance deployment.
export class LoginLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  private global = { count: 0, until: 0 };
  admit(email: string, now = Date.now()): boolean {
    if (now >= this.global.until) this.global = { count: 0, until: now + 60_000 };
    if (++this.global.count > 100) return false;
    const key = createHash("sha256").update(email).digest("hex");
    for (const [id, entry] of this.entries) if (now >= entry.until) this.entries.delete(id);
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 10_000) return false;
      entry = { count: 0, until: now + 15 * 60_000 };
      this.entries.set(key, entry);
    }
    return ++entry.count <= 5;
  }
}
const shared = globalThis as unknown as { slotwiseLoginLimiter?: LoginLimiter };
export const loginLimiter = shared.slotwiseLoginLimiter ??= new LoginLimiter();
