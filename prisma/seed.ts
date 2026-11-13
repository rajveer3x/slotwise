import "dotenv/config";
import { getDb } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { seedDemoData } from "./demo-fixtures";
if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
const password = process.env.DEMO_SEED_PASSWORD;
if (!password || password.length < 12 || Buffer.byteLength(password) > 128) throw new Error("Set DEMO_SEED_PASSWORD to 12–128 bytes before seeding.");
const db = getDb();
try {
  await seedDemoData(db, await hashPassword(password));
  console.log("Seeded synthetic Computing and Design fixtures. Existing records, access and passwords were preserved. Capacities, limits and identities are demo examples.");
} finally { await db.$disconnect(); }
