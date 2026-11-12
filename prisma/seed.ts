import "dotenv/config";
import { getDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { Role } from "../src/generated/prisma/enums";
if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
const password = process.env.DEMO_SEED_PASSWORD;
if (!password || password.length < 12 || Buffer.byteLength(password) > 128) throw new Error("Set DEMO_SEED_PASSWORD to 12–128 bytes before seeding.");
const db = getDb();
try {
  const passwordHash = await hashPassword(password);
  await db.$transaction(async tx => {
    await tx.department.upsert({ where: { id: "demo-computing" }, create: { id: "demo-computing", name: "Computing · Synthetic demo" }, update: {} });
    for (const role of Object.values(Role)) {
      const email = `${role.toLowerCase()}@demo.slotwise.test`;
      await tx.user.upsert({ where: { email }, create: { email, name: `Demo ${role}`, role, departmentId: "demo-computing", passwordHash }, update: {} });
    }
  });
  console.log("Seeded five synthetic demo identities. Existing accounts and passwords were preserved.");
} finally { await db.$disconnect(); }
