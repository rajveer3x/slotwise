"use server";

import { revalidatePath } from "next/cache";
import { csvMaxBytes, type CsvFailure } from "./config";
import { sessionIdentity } from "@/server/auth/session";
import { commitCsv, previewCsv } from "@/server/services/csv-import";

export async function submitCsv(operation: "preview" | "commit", form: FormData) {
  const actorId = await sessionIdentity();
  if (!actorId) return { ok: false, code: "UNAUTHORIZED", message: "Sign in to import CSV." } satisfies CsvFailure;
  const file = form.get("file");
  if (!(file instanceof File) || file.size > csvMaxBytes) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Choose a CSV file of 128 KiB or less." } satisfies CsvFailure;
  }
  const input = { kind: form.get("kind"), semesterId: form.get("semesterId"), effectiveFrom: form.get("effectiveFrom") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (operation === "preview") return previewCsv(actorId, input, bytes);
  if (operation !== "commit") return { ok: false, code: "VALIDATION_ERROR", message: "Choose an import action." } satisfies CsvFailure;
  const result = await commitCsv(actorId, input, bytes, { id: form.get("previewId"), signature: form.get("signature") });
  if (result.ok) {
    revalidatePath("/admin");
    revalidatePath("/timetable");
    revalidatePath("/audit");
  }
  return result;
}
