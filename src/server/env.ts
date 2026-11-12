import "server-only";
import { z } from "zod";

const databaseUrl = z.url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgresql:" || protocol === "postgres:";
  } catch {
    return false;
  }
});

export function getDatabaseUrl(): string {
  const result = databaseUrl.safeParse(process.env.DATABASE_URL);
  if (!result.success) {
    // Never include the URL or the validation input in an error.
    throw new Error("Set a valid PostgreSQL DATABASE_URL in .env before using the database.");
  }
  return result.data;
}
