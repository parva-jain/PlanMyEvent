import { canSomewhere, type EffectivePermissions, type Permission } from '@pme/contracts';
import {
  CalendarDays,
  CircleCheckBig,
  History,
  Images,
  LayoutGrid,
  Settings,
  UserRoundCog,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

/** Sections of an event, in sidebar order (Stitch "Event Dashboard"). */
export const SECTIONS = [
  'schedule',
  'tasks',
  'people',
  'budget',
  'team',
  'gallery',
  'activity',
  'settings',
] as const;

export type Section = (typeof SECTIONS)[number];
export type NavKey = 'home' | Section;

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
}

/** My events: the signed-in landing page. */
export const MY_EVENTS_HREF = '/app';
export const NEW_EVENT_HREF = '/events/new';

export const eventHref = (eventId: string, section?: NavKey | 'more') =>
  !section || section === 'home' ? `/events/${eventId}` : `/events/${eventId}/${section}`;

const ICONS: Record<NavKey, LucideIcon> = {
  home: LayoutGrid,
  schedule: CalendarDays,
  tasks: CircleCheckBig,
  people: UsersRound,
  budget: WalletCards,
  team: UserRoundCog,
  gallery: Images,
  activity: History,
  settings: Settings,
};

export const sectionIcon = (key: NavKey): LucideIcon => ICONS[key];

/**
 * What a section needs to appear (granted anywhere, since lists filter by scope). Sections
 * someone can't use are simply absent (MOTION.md 6.9), never shown and refused.
 */
const SECTION_PERMISSION: Record<NavKey, Permission | null> = {
  home: null,
  schedule: 'subevents.view',
  tasks: 'tasks.view',
  people: 'guests.view',
  budget: 'budget.view',
  team: 'members.view',
  gallery: null,
  activity: 'activity.view',
  settings: 'event.settings',
};

export function canSeeSection(key: NavKey, permissions: EffectivePermissions): boolean {
  const permission = SECTION_PERMISSION[key];
  return permission === null || canSomewhere(permissions, permission);
}

const item = (eventId: string, key: NavKey): NavItem => ({
  key,
  href: eventHref(eventId, key),
  icon: ICONS[key],
});

/** Desktop sidebar and tablet rail: every section I can see. */
export const sidebarItems = (eventId: string, permissions: EffectivePermissions) =>
  (['home', ...SECTIONS] as const)
    .filter((key) => canSeeSection(key, permissions))
    .map((key) => item(eventId, key));

/** Phone bottom bar (DESIGN.md "Layout"): four sections, the rest under More. */
export const BOTTOM_KEYS = ['home', 'tasks', 'people', 'budget'] as const;
export const bottomItems = (eventId: string, permissions: EffectivePermissions) =>
  BOTTOM_KEYS.filter((key) => canSeeSection(key, permissions)).map((key) => item(eventId, key));

/** Phone "More" screen: the sections that don't fit in the bottom bar. */
export const moreItems = (eventId: string, permissions: EffectivePermissions) =>
  SECTIONS.filter(
    (key) => !(BOTTOM_KEYS as readonly string[]).includes(key) && canSeeSection(key, permissions),
  ).map((key) => item(eventId, key));

/** Home matches only itself; a section also matches its sub-pages. */
export function isActive(href: string, pathname: string, eventId: string): boolean {
  return href === eventHref(eventId) ? pathname === href : pathname.startsWith(href);
}

/** The section a path is on, so switching events can keep it. */
export function sectionOf(pathname: string): NavKey | 'more' {
  const segment = pathname.split('/')[3];
  return (SECTIONS as readonly string[]).includes(segment ?? '') || segment === 'more'
    ? (segment as Section | 'more')
    : 'home';
}
