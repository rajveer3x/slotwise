import "server-only";

export function authConfig() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Set AUTH_SECRET to at least 32 random characters.");
  if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_URL) throw new Error("Set NEXTAUTH_URL to the canonical application URL.");
  const url = new URL(process.env.NEXTAUTH_URL || "http://127.0.0.1:3000");
  if (!["http:", "https:"].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("NEXTAUTH_URL must use HTTPS in production except for local loopback testing.");
  }
  return { secret, origin: url.origin, secure: url.protocol === "https:" };
}
