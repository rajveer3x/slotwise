import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function filesIn(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? filesIn(join(path, entry.name)) : join(path, entry.name)))).flat();
}

const files = (await filesIn(".next/static")).filter((file) => /\.(js|map)$/.test(file));
if (!files.length) throw new Error("No client bundles found. Run npm run build first.");
const markers = ["PrismaClient", "@prisma/adapter-pg", "argon2id", "node:crypto", "postgresql://", "postgres://", ...["DATABASE_URL", "TEST_DATABASE_URL", "AUTH_SECRET", "NEXTAUTH_SECRET", "DEMO_SEED_PASSWORD"].map((key) => process.env[key]).filter(Boolean)];
let failures = 0;
for (const file of files) {
  const content = await readFile(file, "utf8");
  if (markers.some((marker) => content.includes(marker))) {
    console.error(`Server-only marker found in ${file}.`);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else console.log(`Checked ${files.length} client bundles: no Prisma, database URLs or configured secret values found.`);
