import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation/build need no database; database commands require .env.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
