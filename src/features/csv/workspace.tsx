"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { csvKinds, csvMaxBytes, csvMaxRows, csvTemplates, type CsvIssue, type CsvKind } from "./config";
import { submitCsv } from "./actions";

type Semester = { id: string; name: string; startDate: string; endDate: string };
type Result = Awaited<ReturnType<typeof submitCsv>>;

function RowIssues({ issues }: { issues: CsvIssue[] }) {
  const grouped = Map.groupBy(issues, issue => issue.row);
  return <ul className="mt-3 grid gap-2" aria-label="CSV row errors">
    {[...grouped].map(([row, entries]) => <li key={row} className="rounded-xl bg-danger-tint p-3 text-danger">
      <strong>Row {row}</strong>
      <ul>{entries.map(({ column, message }, index) => <li key={index} className="wrap-anywhere"><code>{column}</code> · {message}</li>)}</ul>
    </li>)}
  </ul>;
}

export function CsvWorkspace({ semesters, initialSemester, today }: { semesters: Semester[]; initialSemester?: string; today: string }) {
  const initial = semesters.find(semester => semester.id === initialSemester) ?? semesters[0];
  const earliest = (semester?: Semester) => semester && semester.startDate > today ? semester.startDate : today;
  const [semesterId, setSemesterId] = useState(initial?.id ?? "");
  const [exportId, setExportId] = useState(initial?.id ?? "");
  const [kind, setKind] = useState<CsvKind>(initialSemester && initial ? "timetable" : "course");
  const [effectiveFrom, setEffectiveFrom] = useState(earliest(initial));
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [operation, setOperation] = useState<"preview" | "commit">("preview");
  const [pending, startTransition] = useTransition();
  const [retryToken, setRetryToken] = useState<{ id: string; signature: string } | null>(null);

  const semester = semesters.find(semester => semester.id === semesterId);
  const canImport = kind !== "timetable" || (!!semester && earliest(semester) <= semester.endDate);
  const template = csvTemplates[kind];
  const preview = result?.ok && "rows" in result ? result : null;
  const issues = result && "issues" in result ? result.issues ?? [] : [];
  const success = result?.ok && "count" in result ? result : null;

  function clearResult() {
    setResult(null);
    setRetryToken(null);
  }

  function send(nextOperation: "preview" | "commit") {
    if (pending || !file) return;
    if (file.size > csvMaxBytes) {
      setResult({ ok: false, code: "VALIDATION_ERROR", message: "Choose a CSV file of 128 KiB or less." });
      return;
    }
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    if (kind === "timetable") {
      form.set("semesterId", semesterId);
      form.set("effectiveFrom", effectiveFrom);
    }
    if (nextOperation === "commit") {
      if (!retryToken) return;
      form.set("previewId", retryToken.id);
      form.set("signature", retryToken.signature);
    }

    setOperation(nextOperation);
    startTransition(async () => {
      try {
        const response = await submitCsv(nextOperation, form);
        if (response.ok && "token" in response) setRetryToken(response.token);
        else if (nextOperation === "preview" || response.ok || response.code !== "ERROR") setRetryToken(null);
        setResult(response);
      } catch {
        if (nextOperation === "preview") setRetryToken(null);
        setResult({ ok: false, code: "ERROR", message: "The request could not be confirmed. Retry with the same file." });
      }
    });
  }

  function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send("preview");
  }

  return <>
    <section className="schedule-panel mt-6 min-w-0" aria-labelledby="csv-import">
      <h2 id="csv-import" className="text-lg font-semibold">Import CSV</h2>
      <form className="mt-4 grid max-w-[640px] gap-4" onSubmit={previewFile}>
        <label className="grid min-w-0 gap-2">Import type
          <select className="input w-full" value={kind} disabled={pending} onChange={event => { setKind(event.target.value as CsvKind); clearResult(); }}>
            {csvKinds.map(value => <option key={value} value={value}>{csvTemplates[value].label}</option>)}
          </select>
        </label>
        <div className="rounded-xl bg-surface-subtle p-3 text-sm">
          <a className="inline-link font-semibold" href={`/api/csv?template=${kind}`} download>Download {template.label.toLowerCase()} template</a>
          <p className="mt-2">{template.help}</p>
          <p className="mt-2 wrap-anywhere">Headers in order <code>{template.headers.join(", ")}</code></p>
        </div>
        {kind === "timetable" && <div className="schedule-form">
          <label>Draft semester
            <select className="input" required value={semesterId} disabled={pending || !semesters.length}
              onChange={event => {
                setSemesterId(event.target.value);
                setEffectiveFrom(earliest(semesters.find(semester => semester.id === event.target.value)));
                clearResult();
              }}>
              {semesters.length ? semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.name}</option>) : <option value="">No semester configured</option>}
            </select>
          </label>
          <label>Draft effective date
            <Input type="date" required min={earliest(semester)} max={semester?.endDate} value={effectiveFrom}
              disabled={pending || !canImport} onChange={event => { setEffectiveFrom(event.target.value); clearResult(); }} />
          </label>
          {!canImport && <p className="text-sm text-warning">Choose a semester with current or future dates to create a draft.</p>}
        </div>}
        <label className="grid min-w-0 gap-2">CSV file
          <Input type="file" className="w-full min-w-0" required accept=".csv,text/csv" aria-describedby="csvFileHelp"
            disabled={pending} onChange={event => { setFile(event.target.files?.[0] ?? null); clearResult(); }} />
          <small id="csvFileHelp" className="text-text-secondary">UTF-8, up to 128 KiB and {csvMaxRows} data rows.</small>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending || !file || !canImport}>
            {pending && operation === "preview" ? "Checking CSV…" : "Preview CSV"}
          </Button>
          <Button disabled={pending || !retryToken} onClick={() => send("commit")}>
            {pending && operation === "commit" ? "Committing CSV…" : retryToken && !preview ? "Retry commit" : "Commit import"}
          </Button>
        </div>
      </form>

      <div role="status" className="mt-4 text-sm">
        {pending ? (operation === "preview" ? "Validating rows…" : "Saving the reviewed file…") :
          result && !result.ok ? <p className={result.code === "STALE_VERSION" ? "text-warning" : "text-danger"}>{result.message}</p> :
          success ? <p className="text-success">Imported {success.count} {success.count === 1 ? "row" : "rows"}.{success.draftId ? " Your weekly draft is ready." : ""}</p> :
          preview ? <p className={issues.length ? "text-danger" : "text-success"}>{issues.length
            ? "Correct the row errors, then upload and preview the file again."
            : `${preview.rows.length} ${preview.rows.length === 1 ? "row is" : "rows are"} ready to commit.`}</p> :
          <p className="text-text-secondary">Preview the file to review its rows before committing.</p>}
      </div>
      {issues.length > 0 && <RowIssues issues={issues} />}
      {preview && <details open className="mt-4 min-w-0">
        <summary className="cursor-pointer font-semibold">Preview rows</summary>
        <div className="insight-table mt-2 max-w-full" role="region" aria-label="CSV preview rows, scroll horizontally for all columns" tabIndex={0}>
          <table className="w-full text-left align-top">
            <thead><tr><th scope="col">Row</th>{template.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.row}>
              <th scope="row">{row.row}</th>{template.headers.map((header, i) => <td className="max-w-[18rem] whitespace-pre-wrap wrap-anywhere align-top" key={header}>{row.values[i] ?? ""}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
      {success?.draftId && success.semesterId && <Link className={buttonClassName("secondary", "mt-4")}
        href={`/timetable?${new URLSearchParams({ semester: success.semesterId, draft: success.draftId })}`}>Open draft in Timetable</Link>}
    </section>

    <section className="schedule-panel mt-6" aria-labelledby="csv-export">
      <h2 id="csv-export" className="text-lg font-semibold">Export published timetable</h2>
      <p className="mt-2 text-sm text-text-secondary">{semesters.length ? "Download active published classes for one semester." : "Add a semester in Master data to enable export."}</p>
      {semesters.length > 0 && <div className="mt-4 grid max-w-[640px] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid min-w-0 gap-2">Export semester
          <select className="input w-full" value={exportId} onChange={event => setExportId(event.target.value)}>
            {semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
          </select>
        </label>
        <a className={buttonClassName("secondary")} href={`/api/csv?${new URLSearchParams({ semester: exportId })}`} download>Download timetable CSV</a>
      </div>}
    </section>
  </>;
}
