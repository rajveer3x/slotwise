"use server";
import { revalidatePath } from "next/cache";
import { config, type Kind } from "./config";
import type { MasterResult } from "./schema";
import { mutateMasterData } from "@/server/services/master-data";
export async function saveMasterRecord(_previous: MasterResult, form: FormData): Promise<MasterResult> {
  const kind = String(form.get("kind")) as Kind;
  const data: Record<string, unknown> = {};
  for (const field of config[kind]?.fields ?? []) {
    const value = form.get(field.key);
    if (field.type === "checkbox") data[field.key] = value === "on";
    else if (field.type === "time") data[field.key] = typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
    else data[field.key] = value;
  }
  const result = await mutateMasterData({ kind, operation: form.get("operation"), id: form.get("id") || undefined, expectedVersion: form.get("expectedVersion") || undefined, requestId: form.get("requestId"), data });
  if (result.ok) { revalidatePath("/admin"); revalidatePath("/timetable"); }
  return result;
}
