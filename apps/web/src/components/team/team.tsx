'use client';

import type { Member, MemberInvite } from '@pme/contracts';
import { Link2, Mail, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ListItem, ListPresence } from '@/components/motion/list-presence';
import { Reveal, RevealGroup } from '@/components/motion/reveal';
import { EditPanel } from '@/components/motion/side-panel';
import { Skeleton } from '@/components/motion/skeleton';
import { useCurrentEvent } from '@/components/shell/current-event';
import { canSeeSection, eventHref } from '@/components/shell/nav';
import { NoAccess } from '@/components/shell/no-access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSubEvents } from '@/lib/events';
import { formatEventDate } from '@/lib/format';
import { useMemberInvites, useMembers, useRevokeInvite, useRoles } from '@/lib/team';

import { InvitePanelBody } from './invite-panel';
import { AssignmentBadge, Avatar } from './member-bits';
import { MemberPanelBody } from './member-panel';

/**
 * Team (Stitch "Team"): who is on the event, their roles and where those apply, and invites
 * still open. Members open a side panel (sheet on phone) to change roles or remove someone.
 */
export function Team() {
  const t = useTranslations('team');
  const { eventId, can, membership } = useCurrentEvent();
  const manage = can('members.manage');
  const { data: members } = useMembers(eventId);
  const { data: invites = [] } = useMemberInvites(eventId, manage);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  // The panel follows the list, so a save shows the member's new version.
  const chosen = members?.find((member) => member.id === chosenId) ?? null;

  if (!canSeeSection('team', membership.permissions)) {
    return <NoAccess permission="members.view" />;
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1-phone sm:text-h1">{t('title')}</h1>
          <p className="text-body text-fg-secondary">
            {t('summary', { members: members?.length ?? 0, invites: invites.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" icon={<ShieldCheck aria-hidden />}>
            <Link href={`${eventHref(eventId, 'team')}/roles`}>{t('roles.title')}</Link>
          </Button>
          {manage && (
            <Button icon={<UserPlus aria-hidden />} onClick={() => setInviting(true)}>
              {t('invite.title')}
            </Button>
          )}
        </div>
      </div>

      {!members ? (
        <Skeleton className="h-64" />
      ) : (
        <MemberList members={members} onOpen={(member) => setChosenId(member.id)} />
      )}

      {manage && invites.length > 0 && <PendingInvites invites={invites} />}

      <EditPanel
        open={chosen !== null}
        onOpenChange={(open) => !open && setChosenId(null)}
        title={t('member.title')}
      >
        {chosen && <MemberPanelBody member={chosen} onDone={() => setChosenId(null)} />}
      </EditPanel>
      <EditPanel open={inviting} onOpenChange={setInviting} title={t('invite.title')}>
        {inviting && <InvitePanelBody onDone={() => setInviting(false)} />}
      </EditPanel>
    </div>
  );
}

function MemberList({ members, onOpen }: { members: Member[]; onOpen: (member: Member) => void }) {
  const t = useTranslations('team');
  const { eventId, membership } = useCurrentEvent();
  const { data: subEvents = [] } = useSubEvents(eventId);
  const { data: roles = [] } = useRoles(eventId);
  const ownerRoleId = roles.find((role) => role.isOwner)?.id;

  return (
    <Card className="gap-0 p-0 sm:p-0">
      <RevealGroup pace="list" className="flex flex-col divide-y divide-border">
        {members.map((member) => (
          <Reveal key={member.id}>
            <button
              type="button"
              onClick={() => onOpen(member)}
              data-testid="member"
              className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors duration-(--dur-fast) hover:bg-surface-muted sm:flex-row sm:items-center sm:px-6"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={member.name} url={member.avatarUrl} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-label">
                    {member.name}
                    {member.id === membership.member.id && (
                      <span className="text-fg-muted"> · {t('member.you')}</span>
                    )}
                  </span>
                  <span className="truncate text-small text-fg-secondary">{member.email}</span>
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5 sm:max-w-[50%] sm:justify-end">
                {member.assignments.length === 0 && <Badge>{t('noRoles')}</Badge>}
                {member.assignments.map((assignment) => (
                  <AssignmentBadge
                    key={assignment.roleId}
                    assignment={assignment}
                    subEvents={subEvents}
                    isOwner={assignment.roleId === ownerRoleId}
                  />
                ))}
              </span>
              <span className="hidden w-28 text-right text-small text-fg-muted lg:block">
                {formatEventDate(member.joinedAt.slice(0, 10))}
              </span>
            </button>
          </Reveal>
        ))}
      </RevealGroup>
    </Card>
  );
}

function PendingInvites({ invites }: { invites: MemberInvite[] }) {
  const t = useTranslations('team.pending');
  const { eventId } = useCurrentEvent();
  const { data: roles = [] } = useRoles(eventId);
  const revoke = useRevokeInvite(eventId);
  const [confirming, setConfirming] = useState<string | null>(null);
  const roleNames = (invite: MemberInvite) =>
    invite.grants
      .map((grant) => roles.find((role) => role.id === grant.roleId)?.name)
      .filter(Boolean)
      .join(', ');

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <h2 className="text-h3">{t('title', { count: invites.length })}</h2>
        <p className="text-small text-fg-secondary">{t('subtitle')}</p>
      </div>
      <ListPresence className="flex flex-col gap-2" data-testid="pending-invites">
        {invites.map((invite) => (
          <ListItem
            key={invite.id}
            className="flex flex-wrap items-center gap-3 rounded-control bg-surface-muted px-4 py-3"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-surface text-fg-secondary">
              {invite.email ? (
                <Mail aria-hidden className="size-4" />
              ) : (
                <Link2 aria-hidden className="size-4" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-label">
                {invite.email ?? t('link')} · {roleNames(invite)}
              </span>
              <span className="text-small text-fg-secondary">
                {invite.email
                  ? t('emailMeta', { by: invite.createdBy.name })
                  : t('linkMeta', { used: invite.usedCount, max: invite.maxUses })}
                {' · '}
                {t('expires', { date: formatEventDate(invite.expiresAt.slice(0, 10)) })}
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              variant={confirming === invite.id ? 'destructive' : 'ghost'}
              icon={<Trash2 aria-hidden />}
              loading={revoke.isPending && confirming === invite.id}
              onClick={() => {
                if (confirming !== invite.id) return setConfirming(invite.id);
                revoke.mutate(invite.id);
              }}
            >
              {confirming === invite.id ? t('confirmRevoke') : t('revoke')}
            </Button>
          </ListItem>
        ))}
      </ListPresence>
    </Card>
  );
}
