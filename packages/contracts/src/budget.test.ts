import { describe, expect, it } from 'vitest';

import { settlePayment } from './budget.js';

describe('settlePayment', () => {
  it('fills in the status from what was paid, and what was paid from the status', () => {
    expect(settlePayment({ amountPaise: 1000 })).toEqual({
      paidPaise: 0,
      paymentStatus: 'planned',
    });
    expect(settlePayment({ amountPaise: 1000, paidPaise: 1000 })).toEqual({
      paidPaise: 1000,
      paymentStatus: 'paid',
    });
    expect(settlePayment({ amountPaise: 1000, paidPaise: 300 })).toEqual({
      paidPaise: 300,
      paymentStatus: 'partially_paid',
    });
    expect(settlePayment({ amountPaise: 1000, paymentStatus: 'paid' })).toEqual({
      paidPaise: 1000,
      paymentStatus: 'paid',
    });
  });

  it('refuses amounts that disagree with the status (DatabaseDesign check)', () => {
    expect(settlePayment({ amountPaise: 1000, paymentStatus: 'advance_paid' })).toMatchObject({
      path: 'paidPaise',
    });
    expect(
      settlePayment({ amountPaise: 1000, paidPaise: 1000, paymentStatus: 'advance_paid' }),
    ).toHaveProperty('error');
    expect(
      settlePayment({ amountPaise: 1000, paidPaise: 5, paymentStatus: 'planned' }),
    ).toHaveProperty('error');
    expect(settlePayment({ amountPaise: 1000, paidPaise: 1200 })).toHaveProperty('error');
  });
});
