import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticateCredentials } from "./credentials";
import { authConfig } from "./config";
import { getDb } from "@/server/db";

export function authOptions(): NextAuthOptions {
  const config = authConfig();
  return {
    secret: config.secret,
    useSecureCookies: config.secure,
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    providers: [CredentialsProvider({
      name: "Local credentials",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      authorize: authenticateCredentials,
    })],
    callbacks: {
      async jwt({ token, user }) {
        // Never accept role, department or identity from session update input.
        return { sub: user?.id || token.sub };
      },
      async session({ session, token }) {
        const user = token.sub ? await getDb().user.findUnique({ where: { id: token.sub }, select: { name: true, email: true, active: true } }) : null;
        return { ...session, user: user?.active ? { name: user.name, email: user.email } : undefined };
      },
      async redirect({ url }) {
        try { const target = new URL(url, config.origin); if (target.origin === config.origin) return target.href; } catch {}
        return `${config.origin}/dashboard`;
      },
    },
  };
}
