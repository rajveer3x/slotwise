import "server-only";
import { CsvError, parse } from "csv-parse/sync";
import { csvMaxBytes, csvMaxRows, csvTemplates, type CsvIssue, type CsvKind, type CsvRow } from "@/features/csv/config";

export class CsvInputError extends Error {
  constructor(public code: string, message: string, public issues?: CsvIssue[]) { super(message); }
}

export function parseCsv(kind: CsvKind, bytes: Uint8Array): { rows: CsvRow[]; issues: CsvIssue[] } {
  if (bytes.byteLength > csvMaxBytes) throw new CsvInputError("VALIDATION_ERROR", "Choose a CSV file of 128 KiB or less.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvInputError("VALIDATION_ERROR", "Save the file as UTF-8 CSV and try again.");
  }
  if (text.includes("\0")) throw new CsvInputError("VALIDATION_ERROR", "Save the file as UTF-8 CSV without NUL characters.");

  const { headers } = csvTemplates[kind];
  let records: string[][];
  try {
    records = parse(text, {
      skip_empty_lines: true,
      relax_column_count: true,
      to: csvMaxRows + 2,
    });
  } catch (error) {
    if (!(error instanceof CsvError)) throw error;
    const row = (typeof error.records === "number" ? error.records : 0) + 1;
    const column = typeof error.column === "number" ? headers[error.column] ?? `Column ${error.column + 1}` : "CSV";
    throw new CsvInputError("VALIDATION_ERROR", "The CSV has malformed quoting.", [
      { row, column, message: "Check the quotes in this field. Double any quotes inside a quoted field." },
    ]);
  }

  const [header, ...data] = records;
  if (!header) throw new CsvInputError("VALIDATION_ERROR", "The file is empty. Download the template and add at least one row.");
  if (header.length !== headers.length || headers.some((name, i) => name !== header[i])) {
    const issues = headers.flatMap((column, i) => header[i] === column ? [] : [{ row: 1, column, message: `Expected this header in column ${i + 1}.` }]);
    if (header.length > headers.length) issues.push({ row: 1, column: `Column ${headers.length + 1}`, message: "Remove additional columns." });
    throw new CsvInputError("VALIDATION_ERROR", "Use the template headers in the listed order.", issues);
  }
  if (!data.length) throw new CsvInputError("VALIDATION_ERROR", "Add at least one data row below the headers.");
  if (data.length > csvMaxRows) throw new CsvInputError("VALIDATION_ERROR", `Import at most ${csvMaxRows} data rows per file.`);

  const issues: CsvIssue[] = [];
  const rows = data.map((values, index) => {
    const row = index + 2;
    if (values.length < headers.length) {
      for (const column of headers.slice(values.length)) issues.push({ row, column, message: "Missing field." });
    }
    if (values.length > headers.length) issues.push({ row, column: `Column ${headers.length + 1}`, message: "Remove additional fields." });
    return { row, values: values.slice(0, headers.length) };
  });
  return { rows, issues };
}

export function renderCsv(rows: readonly (readonly string[])[]) {
  return rows.map(row => row.map(value => {
    // Include leading whitespace and full-width formula characters.
    const safe = /^[\t\r\n]|^\s*[=+\-@＝＋－＠]/u.test(value.normalize("NFKC")) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
