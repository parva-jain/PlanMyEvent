import {
  CreateContactSchema,
  jobId,
  MAX_IMPORT_ERRORS,
  MAX_IMPORT_ROWS,
  missingColumns,
  normalizePhone,
  parseCsv,
  type Contact,
  type ContactImportJob,
  type ContactImportResult,
  type ContactImportRow,
  type StartContactImport,
} from '@pme/contracts';
import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx, NewContact } from '../ports.js';

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

/**
 * POST E/contacts/import (guests.edit): checks the file and the mapping at once, so mistakes
 * come back as 422 instead of a failed job, then queues the import through the outbox. The
 * worker runs `importContacts` chunk by chunk as the member who started it.
 */
export const startContactImport: ActionDefinition<
  StartContactImport & { importId: string },
  { jobId: string; total: number },
  CoreTx
> = {
  name: 'contacts.import.start',
  permission: 'guests.edit',
  noActivity: 'Each chunk the worker imports logs its own entry',
  execute(_tx, ctx, { importId, csv, mapping }) {
    const parsed = parseCsv(csv);
    if (!parsed.headers.length) throw fieldError('csv', 'The file has no header row');
    const missing = missingColumns(parsed.headers, mapping);
    if (missing.length) {
      throw fieldError('mapping', `Not in the file: ${missing.join(', ')}`);
    }
    if (!parsed.rows.length) throw fieldError('csv', 'The file has no rows under its headers');
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      throw fieldError('csv', `A file can hold at most ${MAX_IMPORT_ROWS} guests`);
    }
    const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;
    if (!userId) throw new ActionError('forbidden', 'Only a member can import contacts');
    const job: ContactImportJob = { importId, eventId: ctx.eventId!, userId, csv, mapping };
    return Promise.resolve({
      result: { jobId: importId, total: parsed.rows.length },
      outbox: [
        { topic: 'contacts.import', dedupeKey: jobId('contacts-import', importId), payload: job },
      ],
    });
  },
};

const EmailSchema = CreateContactSchema.shape.email;
const key = (name: string) => name.trim().toLowerCase();

/** A row's fields after checks; problems that don't stop the row are noted, not fatal. */
function clean(row: ContactImportRow, problem: (message: string) => void) {
  const phone = row.phone ? normalizePhone(row.phone) : null;
  if (row.phone && !phone)
    problem(`Phone "${row.phone}" isn't a number we recognise; added without it`);
  const email = row.email && EmailSchema.safeParse(row.email).success ? row.email : null;
  if (row.email && !email) problem(`Email "${row.email}" isn't valid; added without it`);
  const tags: string[] = [];
  for (const tag of row.tags.map((item) => item.slice(0, 30))) {
    if (tags.length < 20 && !tags.some((item) => key(item) === key(tag))) tags.push(tag);
  }
  return {
    name: row.name.slice(0, 120),
    phone,
    email,
    tags,
    household: row.household.slice(0, 120),
    notes: row.notes.slice(0, 2_000) || null,
  };
}

/**
 * One chunk of an import, in one transaction. A row matches a live contact by phone or email
 * (the file's earlier rows included); a match only fills what the contact lacks and adds new
 * tags, never overwriting what someone typed. Households are found by name, ignoring case,
 * or made: with the file's expected count, else as many as the file puts in it.
 */
export const importContacts: ActionDefinition<
  {
    importId: string;
    rows: ContactImportRow[];
    /** How many rows of the whole file name each household (lowercased), for new ones. */
    householdSizes: Record<string, number>;
  },
  ContactImportResult,
  CoreTx
> = {
  name: 'contacts.import',
  permission: 'guests.edit',
  async execute(tx, ctx, { importId, rows, householdSizes }) {
    const eventId = ctx.eventId!;
    const result: ContactImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      householdsCreated: 0,
      errorCount: 0,
      errors: [],
    };
    const problems: ContactImportResult['errors'] = [];
    const note = (line: number, message: string) => problems.push({ line, message });

    const cleaned = rows.map((row) => ({
      line: row.line,
      expectedCount: row.expectedCount,
      ...clean(row, (message) => note(row.line, message)),
    }));

    // Households: found by name, or made.
    const households = new Map<string, string>();
    const names = [
      ...new Set(cleaned.flatMap((row) => (row.household ? [key(row.household)] : []))),
    ];
    for (const household of await tx.households.findByNames(eventId, names)) {
      households.set(key(household.name), household.id);
    }
    const toMake = new Map<string, { name: string; expectedCount: number }>();
    for (const row of cleaned) {
      const name = key(row.household);
      if (!name || households.has(name) || toMake.has(name)) continue;
      const given = Number(row.expectedCount);
      const valid =
        row.expectedCount !== '' && Number.isInteger(given) && given >= 1 && given <= 50;
      if (row.expectedCount && !valid)
        note(row.line, 'Expected count must be a whole number from 1 to 50');
      toMake.set(name, {
        name: row.household,
        expectedCount: valid ? given : Math.min(Math.max(householdSizes[name] ?? 1, 1), 50),
      });
    }
    for (const household of await tx.households.insert(eventId, [...toMake.values()])) {
      households.set(key(household.name), household.id);
      result.householdsCreated++;
    }

    // Contacts: matched by phone or email, else made.
    const byPhone = new Map<string, Contact>();
    const byEmail = new Map<string, Contact>();
    const remember = (contact: Contact) => {
      if (contact.phone) byPhone.set(contact.phone, contact);
      if (contact.email) byEmail.set(key(contact.email), contact);
    };
    const existing = await tx.contacts.findMatches(eventId, {
      phones: cleaned.flatMap((row) => (row.phone ? [row.phone] : [])),
      emails: cleaned.flatMap((row) => (row.email ? [row.email] : [])),
    });
    existing.forEach(remember);

    const fresh: (NewContact & { line: number })[] = [];
    for (const row of cleaned) {
      if (!row.name) {
        note(row.line, 'No name; row skipped');
        result.skipped++;
        continue;
      }
      const householdId = row.household ? (households.get(key(row.household)) ?? null) : null;
      const match =
        (row.phone && byPhone.get(row.phone)) || (row.email && byEmail.get(key(row.email)));
      if (!match) {
        const pending = fresh.find(
          (item) =>
            (row.phone && item.phone === row.phone) ||
            (row.email && item.email && key(item.email) === key(row.email)),
        );
        if (pending) {
          // The same guest twice in this chunk: merge into the first.
          pending.tags = [
            ...pending.tags,
            ...row.tags.filter((tag) => !pending.tags.includes(tag)),
          ];
          result.skipped++;
          continue;
        }
        fresh.push({
          line: row.line,
          householdId,
          name: row.name,
          phone: row.phone,
          email: row.email,
          tags: row.tags,
          notes: row.notes,
        });
        continue;
      }
      const lower = match.tags.map(key);
      const newTags = row.tags.filter((tag) => !lower.includes(key(tag)));
      const changes: Partial<NewContact> = {
        ...(!match.phone && row.phone && { phone: row.phone }),
        ...(!match.email && row.email && { email: row.email }),
        ...(!match.notes && row.notes && { notes: row.notes }),
        ...(!match.householdId && householdId && { householdId }),
        ...(newTags.length && { tags: [...match.tags, ...newTags].slice(0, 20) }),
      };
      if (!Object.keys(changes).length) {
        result.skipped++;
        continue;
      }
      const after = await tx.contacts.update(eventId, match.id, match.version, changes);
      if (!after) {
        note(row.line, `${match.name} changed while importing; left as it was`);
        result.skipped++;
        continue;
      }
      remember(after);
      result.updated++;
    }
    const created = await tx.contacts.insert(
      eventId,
      fresh.map(({ line: _line, ...contact }) => contact),
    );
    result.created = created.length;
    problems.sort((a, b) => a.line - b.line);
    result.errorCount = problems.length;
    result.errors = problems.slice(0, MAX_IMPORT_ERRORS);

    return {
      result,
      activity: [
        {
          action: 'import',
          entityType: 'contact',
          entityId: importId,
          before: null,
          after: { created: result.created, updated: result.updated, skipped: result.skipped },
        },
        ...(result.householdsCreated
          ? [
              {
                action: 'import',
                entityType: 'household',
                entityId: importId,
                before: null,
                after: { created: result.householdsCreated },
              },
            ]
          : []),
      ],
    };
  },
};
