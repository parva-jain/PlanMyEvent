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

/** The shell lives at /app until events exist; milestone 3 moves it under /events/[eventId]. */
export const APP_ROOT = '/app';

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

function item(key: NavKey): NavItem {
  return { key, href: key === 'home' ? APP_ROOT : `${APP_ROOT}/${key}`, icon: ICONS[key] };
}

/** Desktop sidebar and tablet rail: every section. */
export const SIDEBAR_ITEMS: NavItem[] = (['home', ...SECTIONS] as const).map(item);

/** Phone bottom bar (DESIGN.md "Layout"): four sections, the rest under More. */
export const BOTTOM_ITEMS: NavItem[] = (['home', 'tasks', 'people', 'budget'] as const).map(item);

/** Phone "More" screen: the sections that don't fit in the bottom bar. */
export const MORE_ITEMS: NavItem[] = SECTIONS.filter(
  (key) => !BOTTOM_ITEMS.some((bottom) => bottom.key === key),
).map(item);

export const MORE_HREF = `${APP_ROOT}/more`;

/** Home matches only itself; a section also matches its sub-pages. */
export function isActive(href: string, pathname: string): boolean {
  return href === APP_ROOT ? pathname === APP_ROOT : pathname.startsWith(href);
}
