import { importRows, parseCsv, type ContactImportMapping } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { testWedding } from '../testing/wedding.js';
import { createContact } from './guest-actions.js';
import { importContacts, startContactImport } from './import-actions.js';

const IMPORT_ID = '00000000-0000-7000-8000-00000000abcd';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  await wedding.addMember('viewer', [{ roleId: wedding.role('Viewer').id, subEventIds: [] }]);
  /** What the worker does with a whole file: one chunk here. */
  const run = (csv: string, mapping: ContactImportMapping) => {
    const rows = importRows(parseCsv(csv), mapping);
    const householdSizes: Record<string, number> = {};
    for (const row of rows) {
      const name = row.household.toLowerCase();
      if (name) householdSizes[name] = (householdSizes[name] ?? 0) + 1;
    }
    return wedding.run('editor', importContacts, { importId: IMPORT_ID, rows, householdSizes });
  };
  const live = () => [...wedding.contacts.values()].filter((item) => !item.deleted);
  return { ...wedding, importFile: run, live };
}

const mapping = {
  name: ['Name'],
  phone: 'Phone',
  email: 'Email',
  tags: 'Tags',
  household: 'Family',
};

describe('starting an import', () => {
  it('checks the file and mapping at once, then queues the job through the outbox', async () => {
    const { run, outbox } = await wedding();
    const start = (csv: string, map: ContactImportMapping = mapping, user = 'editor') =>
      run(user, startContactImport, { importId: IMPORT_ID, csv, mapping: map });
    const header = 'Name,Phone,Email,Tags,Family\n';
    await expect(start(header + 'Asha,,,,\n', mapping, 'viewer')).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      start(header + 'Asha,,,,\n', { ...mapping, notes: 'Remarks' }),
    ).rejects.toMatchObject({ code: 'validation_failed', message: 'Not in the file: Remarks' });
    await expect(start(header)).rejects.toMatchObject({ code: 'validation_failed' });

    expect(await start(header + 'Asha,,,,\nRavi,,,,\n')).toEqual({ jobId: IMPORT_ID, total: 2 });
    expect(outbox.at(-1)).toMatchObject({
      topic: 'contacts.import',
      dedupeKey: `contacts-import-${IMPORT_ID}`,
      payload: { importId: IMPORT_ID, mapping },
    });
  });
});

describe('importing contacts', () => {
  it('creates contacts and households, counting each household from the file', async () => {
    const { importFile, live, households, activity } = await wedding();
    const result = await importFile(
      'Name,Phone,Email,Tags,Family\n' +
        'Asha Sharma,98765 43210,asha@example.com,"VIP; Bride side",Sharma family\n' +
        'Rohit Sharma,,,Bride side,sharma family\n' +
        'Ravi Kumar,,,,\n',
      mapping,
    );
    expect(result).toMatchObject({ created: 3, updated: 0, skipped: 0, householdsCreated: 1 });
    const sharmas = [...households.values()].find((item) => item.name === 'Sharma family')!;
    expect(sharmas.expectedCount).toBe(2);
    expect(live().find((item) => item.name === 'Asha Sharma')).toMatchObject({
      phone: '+919876543210',
      tags: ['VIP', 'Bride side'],
      householdId: sharmas.id,
    });
    expect(live().find((item) => item.name === 'Rohit Sharma')?.householdId).toBe(sharmas.id);
    expect(activity.at(-2)).toMatchObject({
      action: 'contact.import',
      entityId: IMPORT_ID,
      after: { created: 3, updated: 0, skipped: 0 },
    });
    expect(activity.at(-1)).toMatchObject({ action: 'household.import', after: { created: 1 } });
  });

  it('matches existing guests by phone or email and only fills what they lack', async () => {
    const { run, importFile, live } = await wedding();
    await run('editor', createContact, {
      name: 'Asha',
      phone: '9876543210',
      notes: 'Vegetarian',
      tags: ['VIP'],
    });
    await run('editor', createContact, { name: 'Ravi', email: 'ravi@example.com' });
    const result = await importFile(
      'Name,Phone,Email,Tags,Family\n' +
        'Asha Sharma,+91 98765 43210,asha@example.com,"vip, Bride side",\n' +
        'Ravi K,,RAVI@example.com,,\n' +
        // Seen twice in the file: merged.
        'Meera,99887 76655,,,\n' +
        'Meera Iyer,9988776655,,Friends,\n',
      mapping,
    );
    expect(result).toMatchObject({ created: 1, updated: 1, skipped: 2 });
    expect(live().find((item) => item.phone === '+919876543210')).toMatchObject({
      name: 'Asha',
      email: 'asha@example.com',
      notes: 'Vegetarian',
      tags: ['VIP', 'Bride side'],
    });
    expect(live().find((item) => item.phone === '+919988776655')?.tags).toEqual(['Friends']);
    expect(live()).toHaveLength(3);
  });

  it('notes rows it skipped or partly took, with their line numbers', async () => {
    const { importFile, live } = await wedding();
    const result = await importFile(
      'Name,Phone,Email,Tags,Family\n,9876543210,,,\nAsha,12345,not-an-email,,\n',
      mapping,
    );
    expect(result).toMatchObject({ created: 1, skipped: 1, errorCount: 3 });
    expect(result.errors.map((item) => item.line)).toEqual([2, 3, 3]);
    expect(live().find((item) => item.name === 'Asha')).toMatchObject({ phone: null, email: null });
  });
});
