import { describe, expect, it } from 'vitest';

import { CreateContactSchema, normalizePhone } from './guests.js';

describe('normalizePhone', () => {
  it('reads Indian mobiles however they are written', () => {
    for (const input of ['98765 43210', '098765-43210', '919876543210', '+91 98765 43210']) {
      expect(normalizePhone(input)).toBe('+919876543210');
    }
  });

  it('keeps other countries with their prefix and refuses the rest', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('0044 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('5876543210')).toBeNull();
    expect(normalizePhone('call me')).toBeNull();
  });
});

describe('contacts', () => {
  it('drop repeated tags, ignoring case', () => {
    const contact = CreateContactSchema.parse({ name: 'Asha', tags: ['VIP', 'vip', 'Bride side'] });
    expect(contact.tags).toEqual(['VIP', 'Bride side']);
  });
});
