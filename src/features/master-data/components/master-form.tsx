"use client";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveMasterRecord } from "../actions";
import { useMasterFeedback } from "./feedback";
import type { MasterResult } from "../schema";
import { config, recordLabel, timeLabel, weekdays, type Kind, type MasterRow, type MasterSnapshot } from "../config";

export function MasterForm({ kind, row, snapshot, requestId }: { kind: Kind; row?: MasterRow; snapshot: MasterSnapshot; requestId: string }) {
  const initialValues = () => Object.fromEntries(config[kind].fields.map(f => [f.key, f.type === "checkbox" ? !!row?.[f.key] : f.type === "time" && row ? timeLabel(Number(row[f.key])) : String(row?.[f.key] ?? "")]));
  const [values, setValues] = useState<Record<string, string | boolean>>(initialValues);
  const [version, setVersion] = useState(row?.version);
  const [token, setToken] = useState(requestId);
  const feedback = useMasterFeedback();
  const [state, action, pending] = useActionState(async (previous: MasterResult, data: FormData) => {
    const result = await saveMasterRecord(previous, data);
    feedback(result);
    if (result.ok) { setToken(crypto.randomUUID()); if (!row) setValues(initialValues()); else setVersion(current => current === undefined ? current : current + 1); }
    return result;
  }, { ok: false, message: "" });
  const prefix = useId();
  const definition = config[kind];
  return <form action={action} className="grid max-w-[640px] gap-4">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="requestId" value={token} />
    {row && <><input type="hidden" name="id" value={row.id} /><input type="hidden" name="expectedVersion" value={version} /></>}
    {row && row.version > (version ?? 0) && <p className="text-sm text-warning">Newer data is available. Your input is retained. Refresh the page to load it; unsaved input will be replaced.</p>}
    <fieldset disabled={pending} className="grid min-w-0 gap-4">
      <legend className="mb-4 font-semibold">{row ? `Edit ${definition.singular}` : `Create ${definition.singular}`}</legend>
      <p className="text-sm text-text-secondary">All fields are required except checkboxes. Fields marked fixed identify the record and cannot change after creation. Allocation faculty can be reassigned to a qualified teacher.</p>
      {definition.fields.map(field => {
        const id = `${prefix}-${field.key}`, errors = state.fieldErrors?.[field.key];
        const props = { id, name: field.key, required: field.type !== "checkbox", "aria-invalid": !!errors, "aria-describedby": errors ? `${id}-error` : undefined };
        const fixed = !!row && !!field.immutable;
        let options: { value: string; label: string }[] | undefined;
        if (field.ref === "facultyUser" || field.ref === "studentUser") options = snapshot.users.filter(u => (u.active && (field.ref === "facultyUser" ? ["FACULTY", "HOD"].includes(u.role) : u.role === "STUDENT")) || u.id === row?.[field.key]).map(u => ({ value: u.id, label: `${u.name}${u.active ? "" : " (inactive)"}` }));
        else if (field.ref) {
          const ref = field.ref;
          options = snapshot.records[ref].filter(r => !r.archived || r.id === row?.[field.key]).map(r => ({ value: r.id, label: `${recordLabel(ref, r, snapshot)}${r.archived ? " (archived)" : ""}` }));
        } else if (field.type === "type") options = [{ value: "THEORY", label: "Theory" }, { value: "LAB", label: "Lab" }];
        else if (field.type === "weekday") options = weekdays.map((label, i) => ({ value: String(i + 1), label: i === 5 ? `${label} (exception planning only)` : label }));
        const value = String(values[field.key]);
        const onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues(current => ({ ...current, [field.key]: field.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value }));
        return <div key={field.key} className="grid min-w-0 gap-2">
          <label htmlFor={id} className={`text-sm font-medium ${field.type === "checkbox" ? "flex min-h-11 items-center" : ""}`}>{field.label}{field.type === "checkbox" ? " (optional)" : ""}{fixed ? " (fixed)" : ""}</label>
          {options ? <>{fixed && <input type="hidden" name={field.key} value={value} />}<select {...props} name={fixed ? undefined : field.key} disabled={fixed} className="input min-w-0" value={value} onChange={onChange}><option value="">Choose {field.label.toLowerCase()}</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></>
            : field.type === "checkbox" ? <input {...props} type="checkbox" className="h-6 w-6" checked={!!values[field.key]} onChange={onChange} />
            : <Input {...props} type={field.type === "time" ? "time" : field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} min={field.type === "number" ? 1 : undefined} step={field.type === "number" ? 1 : undefined} maxLength={field.type ? undefined : 120} value={value} onChange={onChange} />}
          {errors && <p id={`${id}-error`} className="text-sm text-danger">{errors.join(" ")}</p>}
        </div>;
      })}
      <Button type="submit" name="operation" value="save">{pending ? "Saving…" : row ? "Save changes" : `Create ${definition.singular}`}</Button>
    </fieldset>
    <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
    {(state.code === "STALE_VERSION" || (row && row.version > (version ?? 0))) && <Button variant="secondary" onClick={() => window.location.reload()}>Refresh page</Button>}
  </form>;
}

export function ArchiveForm({ kind, row, requestId }: { kind: Kind; row: MasterRow; requestId: string }) {
  const feedback = useMasterFeedback();
  const [state, action, pending] = useActionState(async (previous: MasterResult, data: FormData) => { const result = await saveMasterRecord(previous, data); feedback(result); return result; }, { ok: false, message: "" });
  return <form action={action} className="grid justify-items-start gap-3">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={row.id} /><input type="hidden" name="expectedVersion" value={row.version} /><input type="hidden" name="requestId" value={requestId} />
    <p className="text-sm text-text-secondary">Archival preserves existing references and history. Archived records cannot be selected for new work. Codes remain reserved; restore the record to reuse it.</p>
    <Button type="submit" variant="secondary" name="operation" value={row.archived ? "restore" : "archive"} disabled={pending}>{pending ? "Saving…" : row.archived ? "Restore record" : "Archive record"}</Button>
    <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
    {state.code === "STALE_VERSION" && <Button variant="secondary" onClick={() => window.location.reload()}>Refresh page</Button>}
  </form>;
}
