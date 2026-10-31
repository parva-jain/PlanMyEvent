'use client';

import {
  normalizePhone,
  type Contact,
  type CreateContact,
  type Household,
  type UpdateContact,
} from '@pme/contracts';
import {
  Mail,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { RollingNumber } from '@/components/motion/rolling-number';
import { useCurrentEvent } from '@/components/shell/current-event';
import { useOfferUndo } from '@/components/shell/use-offer-undo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select, Textarea } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { highlight } from '@/lib/live-highlights';
import { useDeleteGuest, useSaveContact, useSaveHousehold } from '@/lib/people';

import { InvitationCard } from './invitation-card';
import { formatPhone, whatsappTo, type GuestRow } from './people-bits';

const MAX_EXPECTED = 50;

/** "Bride side, VIP" → ["Bride side", "VIP"]. */
const parseTags = (text: string) =>
  text
    .split(/[,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);

/** A field error from the API's problem+json, by path. */
function fieldError(failed: unknown, path: string): string | undefined {
  return failed instanceof ApiError
    ? failed.problem?.fields?.find((item) => item.path === path)?.message
    : undefined;
}

/**
 * Add or edit a guest (MOTION.md 6.15: SidePanel or Sheet). New guests start as a household
 * (with its first member) or a single person; an existing household shows its members, its
 * invitation and replies.
 */
export function GuestPanelBody({
  row,
  households,
  onCreated,
  onDone,
}: {
  /** null: a new guest. */
  row: GuestRow | null;
  households: readonly Household[];
  onCreated: (kind: 'household' | 'contact', id: string) => void;
  onDone: () => void;
}) {
  if (!row) return <NewGuest onCreated={onCreated} />;
  return row.kind === 'household' && row.household ? (
    <HouseholdDetails row={row} household={row.household} onDone={onDone} />
  ) : (
    <ContactDetails row={row} households={households} onDone={onDone} />
  );
}

function NewGuest({
  onCreated,
}: {
  onCreated: (kind: 'household' | 'contact', id: string) => void;
}) {
  const t = useTranslations('people.panel');
  const { eventId } = useCurrentEvent();
  const saveHousehold = useSaveHousehold(eventId);
  const saveContact = useSaveContact(eventId);
  const [kind, setKind] = useState<'household' | 'contact'>('household');
  const [name, setName] = useState('');
  const [expected, setExpected] = useState(2);
  const [error, setError] = useState<string | null>(null);

  async function createHousehold(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!name.trim()) return setError(t('nameRequired'));
    setError(null);
    try {
      const household = await saveHousehold.mutateAsync({
        create: { name: name.trim(), expectedCount: expected },
      });
      highlight(household.id, { source: 'own', op: 'created', actorUserId: null });
      onCreated('household', household.id);
    } catch (failed) {
      setError(fieldError(failed, 'name') ?? t('failed'));
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="guest-form">
      <Tabs value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
        <TabsList aria-label={t('kind')}>
          <TabsTrigger value="household">{t('household')}</TabsTrigger>
          <TabsTrigger value="contact">{t('person')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {kind === 'household' ? (
        <form onSubmit={(e) => void createHousehold(e)} className="flex flex-col gap-5">
          <Field
            id="household-name"
            label={t('householdName')}
            hint={t('householdHint')}
            error={error}
          >
            <Input
              id="household-name"
              value={name}
              autoFocus
              placeholder={t('householdPlaceholder')}
              aria-invalid={!!error}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <ExpectedStepper id="household-expected" value={expected} onChange={setExpected} />
          <Button type="submit" loading={saveHousehold.isPending} className="self-start">
            {t('createHousehold')}
          </Button>
        </form>
      ) : (
        <ContactForm
          contact={null}
          pending={saveContact.isPending}
          submitLabel={t('createPerson')}
          onSubmit={async (body) => {
            const contact = await saveContact.mutateAsync({ create: body as CreateContact });
            highlight(contact.id, { source: 'own', op: 'created', actorUserId: null });
            onCreated('contact', contact.id);
          }}
        />
      )}
    </div>
  );
}

/** − n + for the expected count; the number rolls (MOTION.md 6.15, `fast`). */
function ExpectedStepper({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('people.panel');
  const step = (by: number) => {
    onChange(Math.min(MAX_EXPECTED, Math.max(1, value + by)));
  };
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-label">
        {t('expected')}
      </span>
      <div role="group" aria-labelledby={id} className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label={t('fewer')}
          disabled={disabled || value <= 1}
          onClick={() => step(-1)}
        >
          <Minus aria-hidden />
        </Button>
        <RollingNumber value={value} testId="expected-count" className="h-10 w-10 text-h3" />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label={t('more')}
          disabled={disabled || value >= MAX_EXPECTED}
          onClick={() => step(1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function HouseholdDetails({
  row,
  household,
  onDone,
}: {
  row: GuestRow;
  household: Household;
  onDone: () => void;
}) {
  const t = useTranslations('people.panel');
  const { eventId, can } = useCurrentEvent();
  const save = useSaveHousehold(eventId);
  const saveContact = useSaveContact(eventId);
  const remove = useDeleteGuest(eventId);
  const offerUndo = useOfferUndo();
  const editable = can('guests.edit');
  const [name, setName] = useState(household.name);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const failure = (failed: unknown) =>
    setError(
      failed instanceof ApiError && failed.status === 409
        ? t('conflict')
        : (fieldError(failed, 'name') ?? t('failed')),
    );
  const change = (changes: Parameters<typeof save.mutate>[0] & object) =>
    save.mutate(changes, { onError: failure });

  return (
    <div className="flex flex-col gap-6" data-testid="household-panel">
      <div className="flex flex-col gap-4">
        {editable ? (
          <Field id="household-name" label={t('householdName')} error={error}>
            <Input
              id="household-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                name.trim() &&
                name.trim() !== household.name &&
                change({ household, changes: { name: name.trim() } })
              }
            />
          </Field>
        ) : (
          error && (
            <p role="alert" className="text-small text-danger-text">
              {error}
            </p>
          )
        )}
        <ExpectedStepper
          id="household-expected"
          value={household.expectedCount}
          disabled={!editable || save.isPending}
          onChange={(value) => change({ household, changes: { expectedCount: value } })}
        />
        {row.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.tags.map((tag) => (
              <Badge key={tag} tone="accent">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="members-heading">
        <div className="flex items-center justify-between">
          <h3 id="members-heading" className="text-h3">
            {t('members', { count: row.members.length })}
          </h3>
          {editable && !adding && (
            <Button
              size="sm"
              variant="ghost"
              icon={<UserRoundPlus aria-hidden />}
              onClick={() => setAdding(true)}
            >
              {t('addMember')}
            </Button>
          )}
        </div>
        <ListPresence className="flex flex-col gap-2" data-testid="members">
          {row.members.map((contact) => (
            <ListItem key={contact.id}>
              {editing === contact.id ? (
                <div className="rounded-control border border-border p-3">
                  <ContactForm
                    contact={contact}
                    pending={saveContact.isPending}
                    submitLabel={t('save')}
                    onCancel={() => setEditing(null)}
                    onSubmit={async (changes) => {
                      await saveContact.mutateAsync({ contact, changes });
                      setEditing(null);
                    }}
                  />
                </div>
              ) : (
                <MemberLine
                  contact={contact}
                  primary={contact.id === household.primaryContactId}
                  editable={editable}
                  onEdit={() => setEditing(contact.id)}
                  onPrimary={() => change({ household, changes: { primaryContactId: contact.id } })}
                  onRemove={() =>
                    saveContact.mutate(
                      { contact, changes: { householdId: null } },
                      { onError: failure },
                    )
                  }
                />
              )}
            </ListItem>
          ))}
        </ListPresence>
        {adding && (
          <div className="rounded-control border border-border p-3">
            <ContactForm
              contact={null}
              pending={saveContact.isPending}
              submitLabel={t('addMember')}
              onCancel={() => setAdding(false)}
              onSubmit={async (body) => {
                const created = await saveContact.mutateAsync({
                  create: { ...(body as CreateContact), householdId: household.id },
                });
                // The first member with a phone gets the invitation.
                if (!household.primaryContactId && created.phone) {
                  save.mutate({ household, changes: { primaryContactId: created.id } });
                }
                setAdding(false);
              }}
            />
          </div>
        )}
      </section>

      <InvitationCard row={row} />

      {editable && (
        <Button
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          className="self-start text-danger-text hover:bg-danger-tint"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(
              { kind: 'household', household },
              {
                onSuccess: (requestId) => {
                  onDone();
                  offerUndo(t('deleted', { name: household.name }), household.id, requestId);
                },
                onError: failure,
              },
            )
          }
        >
          {t('deleteHousehold')}
        </Button>
      )}
    </div>
  );
}

function MemberLine({
  contact,
  primary,
  editable,
  onEdit,
  onPrimary,
  onRemove,
}: {
  contact: Contact;
  primary: boolean;
  editable: boolean;
  onEdit: () => void;
  onPrimary: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('people.panel');
  return (
    <div
      className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2"
      data-testid="member-row"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-label">
          <span className="truncate">{contact.name}</span>
          {primary && <Badge tone="info">{t('primary')}</Badge>}
        </span>
        {contact.phone && (
          <span className="text-small tabular-nums text-fg-secondary">
            {formatPhone(contact.phone)}
          </span>
        )}
      </div>
      {contact.phone && (
        <a
          href={whatsappTo(contact.phone)}
          target="_blank"
          rel="noreferrer"
          aria-label={t('message', { name: contact.name })}
          className="flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-surface"
        >
          <MessageCircle aria-hidden className="size-4" />
        </a>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          aria-label={t('email', { name: contact.name })}
          className="flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-surface"
        >
          <Mail aria-hidden className="size-4" />
        </a>
      )}
      {editable && (
        <>
          {!primary && (
            <button
              type="button"
              aria-label={t('makePrimary', { name: contact.name })}
              onClick={onPrimary}
              className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface"
            >
              <Star aria-hidden className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label={t('editMember', { name: contact.name })}
            onClick={onEdit}
            className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t('removeMember', { name: contact.name })}
            onClick={onRemove}
            className="flex size-10 items-center justify-center rounded-control text-fg-muted hover:bg-surface"
          >
            <Minus aria-hidden className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

function ContactDetails({
  row,
  households,
  onDone,
}: {
  row: GuestRow;
  households: readonly Household[];
  onDone: () => void;
}) {
  const t = useTranslations('people.panel');
  const { eventId, can } = useCurrentEvent();
  const save = useSaveContact(eventId);
  const remove = useDeleteGuest(eventId);
  const offerUndo = useOfferUndo();
  const contact = row.contact!;
  const [error, setError] = useState<string | null>(null);
  const editable = can('guests.edit');

  return (
    <div className="flex flex-col gap-6" data-testid="contact-panel">
      {editable ? (
        <ContactForm
          key={contact.version}
          contact={contact}
          households={households}
          pending={save.isPending}
          submitLabel={t('save')}
          onSubmit={async (changes) => {
            await save.mutateAsync({ contact, changes });
          }}
        />
      ) : (
        <div className="flex flex-col gap-1">
          {contact.phone && <span className="text-body">{formatPhone(contact.phone)}</span>}
          {contact.email && <span className="text-body">{contact.email}</span>}
          {contact.notes && <p className="text-body text-fg-secondary">{contact.notes}</p>}
        </div>
      )}
      <InvitationCard row={row} />
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      {editable && (
        <Button
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          className="self-start text-danger-text hover:bg-danger-tint"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(
              { kind: 'contact', contact },
              {
                onSuccess: (requestId) => {
                  onDone();
                  offerUndo(t('deleted', { name: contact.name }), contact.id, requestId);
                },
                onError: () => setError(t('failed')),
              },
            )
          }
        >
          {t('deletePerson')}
        </Button>
      )}
    </div>
  );
}

interface ContactFormState {
  name: string;
  phone: string;
  email: string;
  tags: string;
  notes: string;
  householdId: string;
}

/**
 * Name, phone (Indian numbers need no +91), email, tags and notes; with `households`, which
 * household they belong to. Sends only what changed when editing.
 */
function ContactForm({
  contact,
  households,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  contact: Contact | null;
  households?: readonly Household[];
  pending: boolean;
  submitLabel: string;
  onSubmit: (body: UpdateContact) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations('people.panel');
  const id = contact?.id ?? 'new';
  const [form, setForm] = useState<ContactFormState>({
    name: contact?.name ?? '',
    phone: contact?.phone ? formatPhone(contact.phone) : '',
    email: contact?.email ?? '',
    tags: contact?.tags.join(', ') ?? '',
    notes: contact?.notes ?? '',
    householdId: contact?.householdId ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'phone' | 'email', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (changes: Partial<ContactFormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    const found: typeof errors = {};
    if (!form.name.trim()) found.name = t('nameRequired');
    if (form.phone.trim() && !normalizePhone(form.phone)) found.phone = t('phoneInvalid');
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    const body: UpdateContact = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      tags: parseTags(form.tags),
      notes: form.notes.trim() || null,
      ...(households && { householdId: form.householdId || null }),
    };
    const changes = contact
      ? (Object.fromEntries(
          Object.entries(body).filter(([key, value]) => {
            const before = contact[key as keyof Contact];
            if (key === 'phone') return normalizePhone(String(value ?? '')) !== before;
            return JSON.stringify(before ?? null) !== JSON.stringify(value);
          }),
        ) as UpdateContact)
      : body;
    if (contact && Object.keys(changes).length === 0) return onCancel?.();
    try {
      await onSubmit(changes);
      if (!contact)
        setForm({ name: '', phone: '', email: '', tags: '', notes: '', householdId: '' });
    } catch (failed) {
      const phone = fieldError(failed, 'phone');
      const email = fieldError(failed, 'email');
      if (phone || email) setErrors({ phone, email });
      else
        setError(failed instanceof ApiError && failed.status === 409 ? t('conflict') : t('failed'));
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-4"
      data-testid="contact-form"
    >
      <Field id={`contact-name-${id}`} label={t('name')} error={errors.name}>
        <Input
          id={`contact-name-${id}`}
          value={form.name}
          aria-invalid={!!errors.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field
        id={`contact-phone-${id}`}
        label={t('phone')}
        aside={t('optional')}
        hint={t('phoneHint')}
        error={errors.phone}
      >
        <Input
          id={`contact-phone-${id}`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={form.phone}
          aria-invalid={!!errors.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
      </Field>
      <Field
        id={`contact-email-${id}`}
        label={t('emailLabel')}
        aside={t('optional')}
        error={errors.email}
      >
        <Input
          id={`contact-email-${id}`}
          type="email"
          value={form.email}
          aria-invalid={!!errors.email}
          onChange={(e) => set({ email: e.target.value })}
        />
      </Field>
      <Field id={`contact-tags-${id}`} label={t('tags')} aside={t('optional')} hint={t('tagsHint')}>
        <Input
          id={`contact-tags-${id}`}
          value={form.tags}
          onChange={(e) => set({ tags: e.target.value })}
        />
      </Field>
      {households && (
        <Field id={`contact-household-${id}`} label={t('householdLabel')}>
          <Select
            id={`contact-household-${id}`}
            value={form.householdId}
            onChange={(e) => set({ householdId: e.target.value })}
          >
            <option value="">{t('noHousehold')}</option>
            {households.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id={`contact-notes-${id}`} label={t('notes')} aside={t('optional')}>
        <Textarea
          id={`contact-notes-${id}`}
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      {error && (
        <p role="alert" className="text-small text-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
