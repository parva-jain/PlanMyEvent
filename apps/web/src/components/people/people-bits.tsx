'use client';

import type {
  AttendanceStatus,
  Contact,
  DeliveryStatus,
  Household,
  Invitation,
} from '@pme/contracts';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { useCurrentEvent } from '@/components/shell/current-event';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { duration } from '@/lib/motion';
import { useInvitationShare } from '@/lib/people';
import { membersQuery } from '@/lib/team';

/** One line of the guest list: a household with its members, or a contact on their own. */
export interface GuestRow {
  kind: 'household' | 'contact';
  id: string;
  name: string;
  household: Household | null;
  contact: Contact | null;
  members: Contact[];
  /** The household's estimate, or 1 for a contact. */
  expected: number;
  tags: string[];
  /** The primary contact's phone, else the first member's. */
  phone: string | null;
  invitation: Invitation | null;
}

/**
 * Households (with their members) and contacts not in one, each with its invitation. A
 * contact in an invited household shows the household's invitation.
 */
export function guestRows(
  households: readonly Household[],
  contacts: readonly Contact[],
  invitations: readonly Invitation[],
): { households: GuestRow[]; everyone: GuestRow[] } {
  const membersOf = new Map<string, Contact[]>();
  for (const contact of contacts) {
    if (!contact.householdId) continue;
    membersOf.set(contact.householdId, [...(membersOf.get(contact.householdId) ?? []), contact]);
  }
  const byHousehold = new Map(
    invitations.flatMap((i) => (i.householdId ? [[i.householdId, i]] : [])),
  );
  const byContact = new Map(invitations.flatMap((i) => (i.contactId ? [[i.contactId, i]] : [])));
  const householdById = new Map(households.map((item) => [item.id, item]));

  const householdRow = (household: Household): GuestRow => {
    const members = membersOf.get(household.id) ?? [];
    const primary = members.find((item) => item.id === household.primaryContactId);
    return {
      kind: 'household',
      id: household.id,
      name: household.name,
      household,
      contact: null,
      members,
      expected: household.expectedCount,
      tags: uniqueTags(members.flatMap((item) => item.tags)),
      phone: primary?.phone ?? members.find((item) => item.phone)?.phone ?? null,
      invitation: byHousehold.get(household.id) ?? null,
    };
  };
  const contactRow = (contact: Contact): GuestRow => {
    const household = contact.householdId ? householdById.get(contact.householdId) : undefined;
    return {
      kind: 'contact',
      id: contact.id,
      name: contact.name,
      household: household ?? null,
      contact,
      members: [contact],
      expected: 1,
      tags: contact.tags,
      phone: contact.phone,
      invitation:
        byContact.get(contact.id) ??
        (household ? byHousehold.get(household.id) : undefined) ??
        null,
    };
  };

  const alone = contacts.filter(
    (item) => !item.householdId || !householdById.has(item.householdId),
  );
  const byName = (a: GuestRow, b: GuestRow) => a.name.localeCompare(b.name);
  return {
    households: [...households.map(householdRow), ...alone.map(contactRow)].sort(byName),
    everyone: contacts.map(contactRow).sort(byName),
  };
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Map<string, string>();
  for (const tag of tags) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()];
}

/** "+919820144521" → "+91 98201 44521"; other countries as stored. */
export function formatPhone(phone: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return india ? `+91 ${india[1]} ${india[2]}` : phone;
}

/** wa.me wants the number without "+". */
export const whatsappTo = (phone: string) => `https://wa.me/${phone.replace(/^\+/, '')}`;

const DELIVERY_TONE = {
  not_sent: 'neutral',
  sent_digitally: 'info',
  delivered_in_person: 'success',
} as const satisfies Record<DeliveryStatus, string>;

export function DeliveryChip({ status }: { status: DeliveryStatus | null }) {
  const t = useTranslations('people.delivery');
  return (
    <Badge tone={status ? DELIVERY_TONE[status] : 'neutral'} dot data-testid="delivery-status">
      {status ? t(status) : t('notInvited')}
    </Badge>
  );
}

const ATTENDANCE_TONE = {
  invited: 'neutral',
  confirmed: 'success',
  declined: 'danger',
  registered: 'info',
  waitlisted: 'warning',
  cancelled: 'neutral',
  checked_in: 'success',
} as const satisfies Record<AttendanceStatus, string>;

export function AttendanceChip({ status }: { status: AttendanceStatus }) {
  const t = useTranslations('people.attendance');
  return (
    <Badge tone={ATTENDANCE_TONE[status]} dot data-testid="attendance-status">
      {t(status)}
    </Badge>
  );
}

/** Member names by member id, for distributors; empty without members.view. */
export function useMemberNames(): Map<string, string> {
  const { eventId, can } = useCurrentEvent();
  const { data: members = [] } = useQuery({
    ...membersQuery(eventId),
    enabled: can('members.view'),
  });
  return new Map(members.map((member) => [member.id, member.name]));
}

/**
 * Copy the magic link, or open WhatsApp with the message (to the primary contact's phone
 * when known). Copying crossfades to "Copied" (MOTION.md 6.10). `onShared` runs after
 * WhatsApp opens, so the caller can mark it sent.
 */
export function ShareButtons({
  invitation,
  onShared,
  size = 'sm',
}: {
  invitation: Invitation;
  onShared?: () => void;
  size?: 'sm' | 'default';
}) {
  const t = useTranslations('people.share');
  const { eventId } = useCurrentEvent();
  const reduced = useShouldReduceMotion();
  const [wanted, setWanted] = useState(false);
  const share = useInvitationShare(eventId, wanted ? invitation.id : null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  /** The link is fetched on first use; links aren't loaded for every row of a long list. */
  async function load() {
    setWanted(true);
    setFailed(false);
    const result = share.data ?? (await share.refetch()).data;
    if (!result) setFailed(true);
    return result;
  }

  async function copy() {
    const result = await load();
    if (!result) return;
    await navigator.clipboard?.writeText(result.url);
    setCopied(true);
  }

  async function whatsapp() {
    // Opened before the await, so phones don't treat it as a pop-up.
    const tab = window.open('', '_blank');
    const result = await load();
    if (!result) return tab?.close();
    if (tab) tab.location.href = result.whatsappUrl;
    else window.location.href = result.whatsappUrl;
    onShared?.();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size={size}
        variant="secondary"
        icon={<MessageCircle aria-hidden />}
        onClick={() => void whatsapp()}
      >
        {t('whatsapp')}
      </Button>
      <Button
        type="button"
        size={size}
        variant="secondary"
        icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        loading={share.isFetching && !copied}
        onClick={() => void copy()}
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={copied ? 'copied' : 'copy'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? duration.instant : duration.fast }}
          >
            {copied ? t('copied') : t('copy')}
          </m.span>
        </AnimatePresence>
      </Button>
      {failed && (
        <p role="alert" className="text-small text-danger-text">
          {t('failed')}
        </p>
      )}
    </div>
  );
}
