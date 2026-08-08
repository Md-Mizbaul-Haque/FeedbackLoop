export interface CsvParseResult {
  headers: string[] | null;
  rows: string[][];
}

const HEADER_KEYWORDS = [
  "review",
  "comment",
  "feedback",
  "content",
  "body",
  "message",
  "text",
];

export function parseCsv(text: string): CsvParseResult {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
  }

  if (rows.length === 0) return { headers: null, rows };

  const first = rows[0].map((cell) => cell.trim());
  const columnCount = Math.max(...rows.map((r) => r.length));

  let headers: string[] | null = null;
  const nonEmpty = first.some((cell) => cell !== "");
  const allNumeric =
    nonEmpty && first.every((cell) => cell !== "" && !Number.isNaN(Number(cell)));

  if (columnCount > 1) {
    const shortCells = first.every((cell) => cell.length <= 40);
    if (nonEmpty && !allNumeric && shortCells) headers = first;
  } else {
    const firstCell = first[0] ?? "";
    if (/^(review|comment|feedback|content|body|message|text)s?$/i.test(firstCell)) {
      headers = first;
    }
  }

  const dataRows = headers ? rows.slice(1) : rows;
  return { headers, rows: dataRows };
}

export function guessReviewColumn(
  headers: string[] | null,
  rows: string[][],
): number {
  if (headers) {
    const lower = headers.map((h) => h.toLowerCase());
    for (const keyword of HEADER_KEYWORDS) {
      const index = lower.findIndex((h) => h.includes(keyword));
      if (index !== -1) return index;
    }
  }

  const columnCount = Math.max(headers?.length ?? 0, ...rows.map((r) => r.length), 1);
  let best = 0;
  let bestAverage = -1;

  for (let col = 0; col < columnCount; col++) {
    let total = 0;
    let count = 0;
    for (const r of rows) {
      const value = (r[col] ?? "").trim();
      if (value) {
        total += value.length;
        count++;
      }
    }
    if (count > 0) {
      const average = total / count;
      if (average > bestAverage) {
        bestAverage = average;
        best = col;
      }
    }
  }

  return best;
}

export function columnValues(rows: string[][], column: number): string[] {
  const values: string[] = [];
  for (const r of rows) {
    const value = (r[column] ?? "")
      .replace(/\r?\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (value) values.push(value);
  }
  return values;
}

export function columnLabel(
  headers: string[] | null,
  column: number,
  count: number,
): string {
  const name = headers?.[column]?.trim() || `Column ${column + 1}`;
  return `${name}${count > 0 ? ` (${count} rows)` : ""}`;
}
