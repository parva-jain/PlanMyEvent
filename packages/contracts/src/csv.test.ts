import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv.js';
import { importRows, missingColumns } from './guests.js';

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, newlines in a field, CRLF, a BOM and blank lines', () => {
    const text = '﻿Name,Notes\r\n"Sharma, Asha","Says ""hi""\nto all"\r\n\r\nRavi,\n';
    expect(parseCsv(text)).toEqual({
      headers: ['Name', 'Notes'],
      rows: [
        { line: 2, cells: ['Sharma, Asha', 'Says "hi"\nto all'] },
        { line: 5, cells: ['Ravi', ''] },
      ],
    });
  });

  it('detects semicolons and tabs', () => {
    expect(parseCsv('a;b\n1;2').rows[0]!.cells).toEqual(['1', '2']);
    expect(parseCsv('a\tb\n1\t2').rows[0]!.cells).toEqual(['1', '2']);
  });
});

describe('importRows', () => {
  it('joins name columns, splits tags and says which mapped columns are missing', () => {
    const csv = parseCsv('First,Last,Tags\nAsha,Sharma,"VIP; Bride side"\n');
    const mapping = { name: ['First', 'Last'], tags: 'Tags' };
    expect(missingColumns(csv.headers, { ...mapping, phone: 'Mobile' })).toEqual(['Mobile']);
    expect(importRows(csv, mapping)).toEqual([
      {
        line: 2,
        name: 'Asha Sharma',
        phone: '',
        email: '',
        tags: ['VIP', 'Bride side'],
        household: '',
        expectedCount: '',
        notes: '',
      },
    ]);
  });
});
