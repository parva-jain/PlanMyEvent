import { dashboardGenerationKey } from '@pme/contracts';

/** What the throttle needs from Redis. */
export interface DashboardRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  set(key: string, value: string, px: 'PX', ms: number, nx: 'NX'): Promise<'OK' | null>;
  pttl(key: string): Promise<number>;
}

/** Generations outlive any cached value (30 s); an idle event's counter can go. */
const GENERATION_TTL_SECONDS = 24 * 60 * 60;
const signalKey = (eventId: string) => `dash-signal:${eventId}`;

/**
 * After a change that moves dashboard numbers (SystemDesign 5.2 and 5.4):
 * 1. bump the event's cache generation, so the next read recomputes;
 * 2. send dashboard.changed at most once per window per event, across every worker: the first
 *    change in a window sends at once (a Redis SET NX claims the window), and later ones leave
 *    one trailing send for when it ends, so the last change is never left unsignalled.
 */
export class DashboardSignals {
  private readonly trailing = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly redis: DashboardRedis,
    private readonly emit: (eventId: string) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly windowMs = 1_000,
  ) {}

  async changed(eventId: string): Promise<void> {
    const generation = dashboardGenerationKey(eventId);
    await this.redis.incr(generation);
    await this.redis.expire(generation, GENERATION_TTL_SECONDS);
    await this.signal(eventId);
  }

  /** Clears pending trailing sends (shutdown); the clients' 30 s polling covers the gap. */
  close(): void {
    for (const timer of this.trailing.values()) clearTimeout(timer);
    this.trailing.clear();
  }

  private async signal(eventId: string): Promise<void> {
    const claimed = await this.redis.set(signalKey(eventId), '1', 'PX', this.windowMs, 'NX');
    if (claimed === 'OK') {
      await this.emit(eventId);
      return;
    }
    if (this.trailing.has(eventId)) return;
    // -2 (gone) or -1 (no expiry) would mean retry now.
    const wait = Math.max(await this.redis.pttl(signalKey(eventId)), 1);
    this.trailing.set(
      eventId,
      setTimeout(() => {
        this.trailing.delete(eventId);
        this.signal(eventId).catch(this.onError);
      }, wait),
    );
  }
}
