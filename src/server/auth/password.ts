import "server-only";
import { randomBytes } from "node:crypto";
import { hash, verify, argon2id } from "argon2";

export function hashPassword(password: string) {
  return hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
}
let dummyHash: Promise<string> | undefined;
export async function verifyPassword(password: string, passwordHash?: string) {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  const candidate = passwordHash || await dummyHash;
  try { return await verify(candidate, password) && !!passwordHash; }
  catch { return false; }
}
