import type { EventTemplate, TemplateKey } from '@pme/contracts';

// Placement on dates (starterSubEvents) lives in @pme/contracts so the web app can preview it.

/**
 * Event templates (PRD "Event setup"): which modules start on, the default response mode,
 * starter sub-events and starter tasks. Times are local to the event's time zone; day
 * offsets past the event's last day are clamped to it. Budget categories join in step 6b.
 */
export const EVENT_TEMPLATES: Record<TemplateKey, EventTemplate> = {
  wedding: {
    key: 'wedding',
    modules: [
      { module: 'guests', enabled: true },
      { module: 'registration', enabled: false },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'invite_only',
    subEvents: [
      { name: 'Haldi', dayOffset: 0, start: '10:00', end: '13:00' },
      { name: 'Mehendi', dayOffset: 0, start: '16:00', end: '21:00' },
      { name: 'Sangeet', dayOffset: 1, start: '19:00', end: '23:00' },
      { name: 'Wedding', dayOffset: 2, start: '17:00', end: '23:30' },
      { name: 'Reception', dayOffset: 3, start: '19:00', end: '23:00' },
    ],
    tasks: [
      { key: 'book-venue', title: 'Book the venue', category: 'Venue', daysBefore: 180 },
      { key: 'book-caterer', title: 'Book the caterer', category: 'Catering', daysBefore: 120 },
      {
        key: 'book-photographer',
        title: 'Book the photographer',
        category: 'Photography',
        daysBefore: 120,
      },
      { key: 'book-decorator', title: 'Book the decorator', category: 'Decor', daysBefore: 90 },
      { key: 'guest-list', title: 'Finalise the guest list', category: 'Guests', daysBefore: 90 },
      { key: 'book-pandit', title: 'Book the pandit', category: 'Rituals', daysBefore: 60 },
      { key: 'outfits', title: 'Order the outfits', category: 'Clothing', daysBefore: 60 },
      {
        key: 'mehendi-artist',
        title: 'Book the mehendi artist',
        category: 'Mehendi',
        daysBefore: 60,
        subEvent: 'Mehendi',
      },
      {
        key: 'sangeet-dj',
        title: 'Book the DJ and choreographer',
        category: 'Entertainment',
        daysBefore: 60,
        subEvent: 'Sangeet',
      },
      { key: 'invitations', title: 'Send the invitations', category: 'Guests', daysBefore: 30 },
      {
        key: 'guest-stay',
        title: 'Arrange guest stay and transport',
        category: 'Logistics',
        daysBefore: 30,
      },
      { key: 'return-gifts', title: 'Buy return gifts', category: 'Gifts', daysBefore: 21 },
    ],
  },
  conference: {
    key: 'conference',
    modules: [
      { module: 'guests', enabled: false },
      { module: 'registration', enabled: true },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'open_registration',
    subEvents: [
      { name: 'Registration and breakfast', dayOffset: 0, start: '08:30', end: '09:30' },
      { name: 'Opening keynote', dayOffset: 0, start: '09:30', end: '10:30' },
      { name: 'Sessions', dayOffset: 0, start: '11:00', end: '17:00' },
      // A large offset clamps to the last day.
      { name: 'Closing', dayOffset: 99, start: '17:00', end: '18:00' },
    ],
    tasks: [
      { key: 'book-venue', title: 'Book the venue', category: 'Venue', daysBefore: 120 },
      { key: 'sponsors', title: 'Reach out to sponsors', category: 'Sponsors', daysBefore: 90 },
      {
        key: 'open-registration',
        title: 'Open registration',
        category: 'Registration',
        daysBefore: 60,
      },
      { key: 'speakers', title: 'Confirm the speakers', category: 'Program', daysBefore: 60 },
      { key: 'agenda', title: 'Publish the agenda', category: 'Program', daysBefore: 45 },
      { key: 'av', title: 'Book sound, projector and streaming', category: 'AV', daysBefore: 30 },
      { key: 'catering', title: 'Order food and tea', category: 'Catering', daysBefore: 21 },
      { key: 'volunteers', title: 'Brief the volunteers', category: 'Team', daysBefore: 14 },
      {
        key: 'badges',
        title: 'Print badges',
        category: 'Registration',
        daysBefore: 7,
        subEvent: 'Registration and breakfast',
      },
      { key: 'feedback', title: 'Send the feedback form', category: 'Program', daysBefore: 0 },
    ],
  },
  fair: {
    key: 'fair',
    modules: [
      { module: 'guests', enabled: false },
      { module: 'registration', enabled: true },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'open_registration',
    // One "Day N" per day of the fair; see `starterSubEvents` in @pme/contracts.
    subEvents: [{ name: 'Day {n}', dayOffset: 0, start: '10:00', end: '20:00' }],
    tasks: [
      {
        key: 'permits',
        title: 'Get permits from the authorities',
        category: 'Admin',
        daysBefore: 60,
      },
      { key: 'stall-layout', title: 'Plan the stall layout', category: 'Venue', daysBefore: 60 },
      {
        key: 'vendor-applications',
        title: 'Collect vendor applications',
        category: 'Vendors',
        daysBefore: 45,
      },
      { key: 'publicity', title: 'Start publicity', category: 'Marketing', daysBefore: 30 },
      {
        key: 'power-water',
        title: 'Arrange power and water',
        category: 'Logistics',
        daysBefore: 14,
      },
      { key: 'security', title: 'Book security', category: 'Logistics', daysBefore: 14 },
      { key: 'volunteers', title: 'Brief the volunteers', category: 'Team', daysBefore: 7 },
    ],
  },
  celebration: {
    key: 'celebration',
    modules: [
      { module: 'guests', enabled: true },
      { module: 'registration', enabled: false },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'invite_rsvp',
    subEvents: [{ name: 'Celebration', dayOffset: 0, start: '18:00', end: '22:00' }],
    tasks: [
      { key: 'book-venue', title: 'Book the venue', category: 'Venue', daysBefore: 30 },
      { key: 'guest-list', title: 'Make the guest list', category: 'Guests', daysBefore: 21 },
      { key: 'invitations', title: 'Send the invitations', category: 'Guests', daysBefore: 14 },
      { key: 'food', title: 'Order the food', category: 'Catering', daysBefore: 14 },
      {
        key: 'cake-decor',
        title: 'Order the cake and decorations',
        category: 'Decor',
        daysBefore: 7,
      },
      { key: 'return-gifts', title: 'Buy return gifts', category: 'Gifts', daysBefore: 7 },
    ],
  },
  custom: {
    key: 'custom',
    modules: [
      { module: 'guests', enabled: true },
      { module: 'registration', enabled: false },
      { module: 'gallery', enabled: false },
    ],
    responseMode: 'invite_only',
    subEvents: [],
    tasks: [],
  },
};
