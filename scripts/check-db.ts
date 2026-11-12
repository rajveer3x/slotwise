import "dotenv/config";
import { getDb } from "../src/server/db";

async function main() {
  const db = getDb();
  try {
    const rows = await db.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`;
    if (rows[0]?.ok !== 1) throw new Error("Unexpected database response");
    console.log("PostgreSQL connectivity verified through Prisma (SELECT 1).");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error("Database check failed. Check .env and run docker compose up -d --wait db. No data was changed.");
  process.exitCode = 1;
});
