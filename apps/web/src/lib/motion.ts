/**
 * Motion tokens (docs/MOTION.md section 2). Import these everywhere; never hard-code
 * durations or easings in components. CSS-only transitions use the matching variables
 * in src/styles/motion.css.
 */

/** Seconds, as Motion expects. */
export const duration = {
  instant: 0.1,
  fast: 0.15,
  base: 0.2,
  moderate: 0.25,
  slow: 0.4,
  deliberate: 0.6,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  in: [0.55, 0, 1, 0.45],
  inOut: [0.65, 0, 0.35, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
} as const;

export const spring = {
  snappy: { type: 'spring', stiffness: 500, damping: 35, mass: 1 },
  gentle: { type: 'spring', stiffness: 260, damping: 30 },
  bouncy: { type: 'spring', stiffness: 400, damping: 18 },
  drag: { type: 'spring', stiffness: 600, damping: 40 },
} as const;

/** Pixels. */
export const distance = { rise: 12, riseLarge: 24, lift: -4 } as const;

/** Seconds between staggered children. */
export const stagger = { list: 0.04, section: 0.08 } as const;

/** Lists stagger at most this many rows; the rest appear together. */
export const maxStaggeredRows = 8;

export const scale = { press: 0.97 } as const;
