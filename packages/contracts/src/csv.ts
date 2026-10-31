/** One data row of a CSV file, with its 1-based line number in the file for error messages. */
export interface CsvRow {
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

/** Excel saves with ';' where ',' is the decimal mark, and some exports use tabs. */
function delimiterOf(firstLine: string): string {
  const counts = [',', ';', '\t'].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length,
  }));
  return counts.reduce((best, item) => (item.count > best.count ? item : best)).delimiter;
}

/**
 * RFC 4180 CSV: quoted fields may hold the delimiter, newlines and doubled quotes. A UTF-8 BOM
 * is dropped, CRLF and LF both end a record, and blank lines are skipped. The first record is
 * the header row. Shared by the web (mapping preview) and the worker (the import itself).
 */
export function parseCsv(text: string): ParsedCsv {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = delimiterOf(source.slice(0, source.search(/\r?\n|$/)));
  const records: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (cells.some((value) => value.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line++;
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
    }
  }
  if (cell !== '' || cells.length) endRecord();

  const [header, ...rows] = records;
  return { headers: (header?.cells ?? []).map((value) => value.trim()), rows };
}
